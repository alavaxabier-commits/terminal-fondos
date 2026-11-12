"""Cálculo de métricas de todos los fondos: carga series, arma la referencia de cada uno, calcula y guarda.

La referencia de un fondo (especificación, sección 3): su índice propio si lo tiene; si no, el de su categoría
(índice de mercado vía fondo sustituto, índice combinado, €STR o media de la categoría). Todo en EUR y semanal.
"""
from __future__ import annotations

import datetime as dt
from collections import defaultdict

from .nucleo import metricas as m
from .validacion import hace_anos


def serie_eur(valores: dict[dt.date, float], divisa: str | None, tipos: dict[str, dict[dt.date, float]]) -> dict:
    if not divisa or divisa == 'EUR':
        return valores
    return m.a_eur(valores, tipos.get(divisa, {}))


def referencias(fondos: dict[str, dict], rend: dict[str, dict], indices: dict[str, dict],
                categorias: dict[str, dict], estr_semanal: dict) -> tuple[dict[str, dict], dict[str, str]]:
    """Serie de referencia de cada índice y de cada categoría con media, y qué clave usa cada fondo, a partir de las
    rentabilidades de cada fondo y del €STR (semanales, o mensuales para los años naturales de una cartera).

    Devuelve ({clave: serie}, {isin: clave}). Claves: 'indice:<id>' o 'media:<categoría>'.
    """
    series: dict[str, m.SerieSemanal] = {}

    def rend_indice(iid, profundidad=0) -> dict:
        ind = indices.get(iid)
        if not ind or profundidad > 3:
            return {}
        if iid == 'estr':
            return estr_semanal
        if ind.get('componentes'):
            return m.combinar([(rend_indice(c['id'], profundidad + 1), float(c['peso'])) for c in ind['componentes']])
        return rend.get(ind.get('proxy_isin') or '', {})

    for iid in indices:
        r = rend_indice(iid)
        if r:
            series[f'indice:{iid}'] = m.serie_de_rendimientos(r)

    por_categoria: dict[str, list[str]] = defaultdict(list)
    for isin, f in fondos.items():
        if f.get('en_universo') and f.get('categoria'):
            por_categoria[f['categoria']].append(isin)
    for cat, info in categorias.items():
        if info['metodo'] == 'media_categoria':
            r = m.media_rendimientos([rend[i] for i in por_categoria.get(cat, []) if i in rend])
            if r:
                series[f'media:{cat}'] = m.serie_de_rendimientos(r)

    usa: dict[str, str] = {}
    for isin, f in fondos.items():
        if f.get('indice_id'):
            clave = f'indice:{f["indice_id"]}'
        else:
            info = categorias.get(f.get('categoria') or '', {})
            clave = (f'indice:{info["indice_id"]}' if info.get('metodo') == 'indice'
                     else f'media:{f["categoria"]}' if info.get('metodo') == 'media_categoria' else None)
        if clave and clave in series:
            usa[isin] = clave
    return series, usa


def calcular(datos: dict, hoy: dt.date) -> tuple[list[tuple], dict[int, dict]]:
    """datos: fondos, valores, tipos, estr, indices, categorias y carteras →
    (filas (isin, ventana, nombre, valor, percentil), {id de cartera: cálculo de la cartera})."""
    fondos, tipos = datos['fondos'], datos['tipos']
    en_eur = {isin: serie_eur(v, fondos[isin].get('divisa'), tipos) for isin, v in datos['valores'].items() if isin in fondos}
    semanales = {isin: m.semanal(v) for isin, v in en_eur.items()}
    semanales = {i: s for i, s in semanales.items() if len(s) >= 2}
    estr_semanal = m.tasa_semanal(datos['estr'])
    series_ref, usa = referencias(fondos, {i: m.rendimientos(s) for i, s in semanales.items()},
                                  datos['indices'], datos['categorias'], estr_semanal)

    resultados: dict[str, dict] = {}
    for isin, s in semanales.items():
        ref = series_ref.get(usa.get(isin, ''))
        resultados[isin] = m.metricas_fondo(s, ref, estr_semanal, hoy, en_eur[isin])

    # percentiles dentro de la categoría, solo entre fondos del universo
    filas = []
    por_cat_metrica: dict[tuple[str, str, str], dict[str, float]] = defaultdict(dict)
    for isin, res in resultados.items():
        f = fondos[isin]
        if f.get('en_universo') and f.get('categoria'):
            for (ventana, nombre), valor in res.items():
                por_cat_metrica[(f['categoria'], ventana, nombre)][isin] = valor
    pct: dict[tuple[str, str, str], float] = {}
    for (cat, ventana, nombre), valores in por_cat_metrica.items():
        for isin, p in m.percentiles(valores, nombre).items():
            pct[(isin, ventana, nombre)] = p
    for isin, res in resultados.items():
        for (ventana, nombre), valor in res.items():
            filas.append((isin, ventana, nombre, float(valor), pct.get((isin, ventana, nombre))))
    carteras = {}
    if datos.get('carteras'):
        # referencias mensuales (de cierre a cierre de mes) para los años naturales de las carteras
        ref_mes, _ = referencias(fondos, {i: m.mensuales(v) for i, v in en_eur.items()},
                                 datos['indices'], datos['categorias'], m.tasa_mensual(datos['estr']))
        for cid, c in datos['carteras'].items():
            if x := cartera(c, en_eur, resultados, series_ref, ref_mes, usa, estr_semanal, hoy):
                carteras[cid] = x
    return filas, carteras


def _rend_mes(s: dict[tuple[int, int], float]) -> dict[tuple[int, int], float]:
    """Serie mensual encadenada → rentabilidad de cada mes (solo meses seguidos)."""
    ks = list(s)
    return {b: s[b] / s[a] - 1 for a, b in zip(ks, ks[1:]) if (b[0] * 12 + b[1]) - (a[0] * 12 + a[1]) == 1}


def _anidar(met: dict[tuple[str, str], float]) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for (ventana, nombre), v in met.items():
        out.setdefault(ventana, {})[nombre] = float(v)
    return out


def cartera(c: dict, en_eur: dict, resultados: dict, series_ref: dict, ref_mes: dict, usa: dict, estr_semanal: dict,
            hoy: dt.date) -> dict | None:
    """Cartera modelo simulada con su rebalanceo: sus métricas (las mismas que las de un fondo) frente a la
    combinación de las referencias de sus fondos, crisis, aportación y peso de hoy de cada fondo y correlaciones."""
    isins = [i for i, _ in c['fondos']]
    if not isins or any(len(en_eur.get(i, {})) < 2 for i in isins):
        return None
    pesos = [p for _, p in c['fondos']]
    valor, ganancias, pesos_hoy, ultimo = m.simular([(en_eur[i], p) for i, p in c['fondos']], c['rebalanceo'])
    if len(valor) < 2:
        return None
    s = m.semanal(valor)
    refs = [series_ref.get(usa.get(i, '')) for i in isins]
    ref = (m.serie_de_rendimientos(m.combinar([(m.rendimientos(r), p / sum(pesos)) for r, p in zip(refs, pesos)]))
           if all(refs) else None)
    met = m.metricas_fondo(s, ref, estr_semanal, hoy, valor)
    met_ref = {}
    if ref:
        # periodos (1a, 3a…) con la serie semanal, como los fondos; años naturales de cierre a cierre de mes
        met_ref = {k: v for k, v in m.metricas_fondo(ref, None, estr_semanal, hoy).items() if k[0] in m.VENTANAS}
        refs_mes = [ref_mes.get(usa.get(i, '')) for i in isins]
        if all(refs_mes):
            r_mes = m.combinar([(_rend_mes(r), p / sum(pesos)) for r, p in zip(refs_mes, pesos)])
            met_ref.update(m.anos_de_meses(r_mes, hoy))
    ultima = max(valor)
    aporta = {v: m.contribuciones(valor, ganancias, hace_anos(ultima, n)) for v, n in m.VENTANAS.items()}
    vols = [resultados.get(i, {}).get(('3a', 'volatilidad')) for i in isins]
    r = m.riesgo([m.rendimientos(m.semanal(en_eur[i])) for i in isins], pesos)
    return {
        'desde': min(valor).isoformat(), 'hasta': ultima.isoformat(), 'ultimo_rebalanceo': ultimo.isoformat(),
        'metricas': _anidar(met),
        'referencia': _anidar(met_ref) if ref else None,
        'crisis': {k: {'cartera': m.caida_en(s, *t), 'referencia': m.caida_en(ref, *t) if ref else None}
                   for k, t in m.CRISIS.items()},
        # media ponderada de las volatilidades a 3 años de los fondos: frente a la de la cartera, lo que quita diversificar
        'volatilidad_media': sum(p * v for p, v in zip(pesos, vols)) / sum(pesos) if all(v is not None for v in vols) else None,
        'correlacion': r and {'semanas': r['semanas'], 'matriz': r['correlacion']},
        'fondos': [{'isin': i, 'peso_hoy': pesos_hoy[k], 'riesgo': r and r['riesgo'][k],
                    'aporta': {v: a[k] for v, a in aporta.items() if a}} for k, i in enumerate(isins)],
    }
