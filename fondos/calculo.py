"""Cálculo de métricas de todos los fondos: carga series, arma la referencia de cada uno, calcula y guarda.

La referencia de un fondo (especificación, sección 3): su índice propio si lo tiene; si no, el de su categoría
(índice de mercado vía fondo sustituto, índice combinado, €STR o media de la categoría). Todo en EUR y semanal.
"""
from __future__ import annotations

import datetime as dt
from collections import defaultdict

from .nucleo import metricas as m


def serie_eur(valores: dict[dt.date, float], divisa: str | None, tipos: dict[str, dict[dt.date, float]]) -> dict:
    if not divisa or divisa == 'EUR':
        return valores
    if divisa == 'GBX':  # peniques: el BCE solo da la libra
        return m.a_eur({f: v / 100 for f, v in valores.items()}, tipos.get('GBP', {}))
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


def percentiles_categoria(resultados: dict[str, dict], fondos: dict[str, dict], grupo=None) -> dict[str, dict]:
    """{isin: {(ventana, nombre): valor}} → {isin: {(ventana, nombre): percentil}} dentro de la categoría (o del grupo
    que dé `grupo(fondo)`, p. ej. el tipo de activo), entre fondos del universo y con una sola clase por fondo (la de
    menor TER); las demás clases del universo de ese fondo se sitúan frente a la misma distribución, sin contar en ella."""
    clave = grupo or (lambda f: f['categoria'])
    del_universo = [i for i in resultados if fondos[i].get('en_universo') and fondos[i].get('categoria')]
    cuenta: dict[str, str] = {}
    for isin in sorted(del_universo, key=lambda i: (fondos[i].get('ter') is None, fondos[i].get('ter') or 0, i)):
        cuenta.setdefault(fondos[isin].get('fund_id') or isin, isin)
    cuentan = set(cuenta.values())
    por_cat_metrica: dict[tuple[str, str, str], dict[str, float]] = defaultdict(dict)
    for isin in cuentan:
        for (ventana, nombre), valor in resultados[isin].items():
            por_cat_metrica[(clave(fondos[isin]), ventana, nombre)][isin] = valor
    pct: dict[str, dict] = defaultdict(dict)
    for (cat, ventana, nombre), valores in por_cat_metrica.items():
        for isin, p in m.percentiles(valores, nombre).items():
            pct[isin][(ventana, nombre)] = p
    for isin in set(del_universo) - cuentan:
        for (ventana, nombre), valor in resultados[isin].items():
            valores = por_cat_metrica.get((clave(fondos[isin]), ventana, nombre), {})
            p = m.percentiles({**valores, isin: valor}, nombre).get(isin)
            if p is not None:
                pct[isin][(ventana, nombre)] = p
    return pct


COBERTURA_MINIMA = 0.7


def solo_con_cobertura(pct: dict[str, dict], resultados: dict[str, dict], fondos: dict[str, dict], clave: tuple[str, str],
                       minimo: float = COBERTURA_MINIMA) -> dict[str, dict]:
    """Quita el percentil de `clave` en las categorías donde la tienen menos de `minimo` de sus fondos del universo (una
    clase por fondo): así nadie gana ni pierde por un dato que la mayoría de su categoría no publica."""
    por_cat: dict[str, dict[str, bool]] = defaultdict(dict)
    for isin, res in resultados.items():
        f = fondos[isin]
        if f.get('en_universo') and f.get('categoria'):
            fondo = f.get('fund_id') or isin
            por_cat[f['categoria']][fondo] = por_cat[f['categoria']].get(fondo, False) or clave in res
    pocas = {c for c, xs in por_cat.items() if sum(xs.values()) < minimo * len(xs)}
    for isin, p in pct.items():
        if clave in p and fondos[isin].get('categoria') in pocas:
            del p[clave]
    return pct


# Lo que la nota nueva compara en el tipo de activo (todo lo que va frente al índice, y Sharpe y Sortino para suavizar)
EN_TIPO = {'diferencia_seguimiento', 'ratio_informacion', 'consistencia', 'captura_bajista', 'caida_relativa',
           'volatilidad_relativa', 'sharpe', 'sortino'}


def bloques_fondos(resultados: dict[str, dict], fondos: dict[str, dict], pct_cat: dict[str, dict],
                   solo_activos: bool = False) -> dict[str, dict]:
    """Bloques de la nota de cada fondo con percentiles: {isin: {plazo: (bloques, solo 3A)}}, con plazo None = el de la
    nota (5A o 3A) y los del selector del screener. Activos que no son monetarios: la nota nueva (frente al índice; sin
    referencia, sin nota), con su patrimonio y los años desde el último cambio de gestor (`fondos`). Indexados y
    monetarios: `bloques_nota`."""
    pct_tipo = percentiles_categoria({i: {k: v for k, v in r.items() if k[1] in EN_TIPO} for i, r in resultados.items()},
                                     fondos, lambda f: m.tipo_activo(f['categoria']))
    fondos_cat: dict[str, set] = defaultdict(set)
    for i, f in fondos.items():
        if f.get('en_universo') and f.get('categoria'):
            fondos_cat[f['categoria']].add(f.get('fund_id') or i)
    out: dict[str, dict] = {}
    for isin, pc in pct_cat.items():
        f = fondos[isin]
        tipo = m.tipo_activo(f.get('categoria'))
        ix = f.get('gestion') == 'indexada'
        if ix or tipo == 'monetario':
            if solo_activos:
                continue
            por = {v: m.bloques_nota(pc, ix, v, tipo) for v in (None, *m.PLAZOS_NOTA)}
        else:
            por = {v: m.bloques_nota_nueva(pc, pct_tipo.get(isin, {}), len(fondos_cat[f.get('categoria')]), tipo,
                                           f.get('ter'), f.get('gestor_anos'), f.get('patrimonio_meur'),
                                           resultados.get(isin, {}).get(('1a', 'flujo_pct')), v)
                   for v in (None, *m.PLAZOS_NOTA)}
        por = {v: b for v, b in por.items() if b}
        if por:
            out[isin] = por
    return out


def filas_nota(isin: str, por: dict) -> list[tuple]:
    """Filas de metrica con los bloques de un fondo ({plazo: (bloques, solo 3A)}): ventana 'nota' (todos, y 'solo3a') y
    'nota_<plazo>' (solo los que dependen del plazo); valor y percentil = la puntuación. Así las lee `bloques` en
    web/src/calculo/nota.ts."""
    filas = []
    for plazo, (bs, solo3) in por.items():
        for k, x in bs.items():
            if plazo is None or k in m.BLOQUES_DE_PLAZO:
                filas.append((isin, f'nota_{plazo}' if plazo else 'nota', k, x, x))
        if plazo is None:
            filas.append((isin, 'nota', 'solo3a', float(solo3), float(solo3)))
    return filas


def notas_nuevas(resultados: dict[str, dict], fondos: dict[str, dict], pct_cat: dict[str, dict]
                 ) -> dict[str, tuple[float, bool, dict]]:
    """Nota nueva de los fondos activos que no son monetarios: {isin: (nota, solo 3A, bloques)} (la usa `analisis`)."""
    return {i: (n, b[None][1], b[None][0]) for i, b in bloques_fondos(resultados, fondos, pct_cat, True).items()
            if None in b and (n := m.ponderar(b[None][0], m.PESOS_NOTA_NUEVA)) is not None}


def diversificacion(rend: dict[str, dict], fondos: dict[str, dict], carteras: dict[int, list[str]]) -> list[tuple]:
    """Para cada cartera, (cartera_id, isin, correlación media con sus fondos, percentil de 1 − correlación en la
    categoría) de cada fondo del universo: el bloque Diversificación del screener."""
    filas = []
    for cid, isins in carteras.items():
        suyos = [rend[i] for i in isins if i in rend]
        corr = {i: c for i, r in rend.items() if fondos[i].get('en_universo')
                and (c := m.correlacion_media(r, suyos)) is not None}
        pct = percentiles_categoria({i: {('hoy', 'diversificacion'): 1 - c} for i, c in corr.items()}, fondos)
        filas += [(cid, i, round(c, 4), pct.get(i, {}).get(('hoy', 'diversificacion'))) for i, c in corr.items()]
    return filas


def calcular(datos: dict, hoy: dt.date) -> tuple[list[tuple], dict[str, tuple], list[tuple], list[tuple]]:
    """datos: fondos, valores, tipos, estr, indices, categorias y carteras ({id: [isin]}) → (filas (isin, ventana,
    nombre, valor, percentil), {clave de referencia: (lunes, valores semanales, meses, valores de cierre de mes)},
    notas (isin, nota, percentil, solo_3a), diversificación (cartera_id, isin, correlación, percentil))."""
    fondos, tipos = datos['fondos'], datos['tipos']
    en_eur = {isin: serie_eur(v, fondos[isin].get('divisa'), tipos) for isin, v in datos['valores'].items() if isin in fondos}
    semanales = {isin: m.semanal(v) for isin, v in en_eur.items()}
    semanales = {i: s for i, s in semanales.items() if len(s) >= 2}
    estr_semanal = m.tasa_semanal(datos['estr'])
    rend = {i: m.rendimientos(s) for i, s in semanales.items()}
    series_ref, usa = referencias(fondos, rend,
                                  datos['indices'], datos['categorias'], estr_semanal)

    resultados: dict[str, dict] = {}
    for isin, s in semanales.items():
        ref = series_ref.get(usa.get(isin, ''))
        resultados[isin] = m.metricas_fondo(s, ref, estr_semanal, hoy, en_eur[isin])
        if ref:
            resultados[isin].update(m.metricas_relativas(s, ref))  # para la nota nueva
        if isin in datos.get('diarios', {}):  # monetarios: rendimiento reciente con la serie diaria
            resultados[isin].update(m.metricas_monetario(serie_eur(datos['diarios'][isin], fondos[isin].get('divisa'), tipos),
                                                         datos['estr']))
        if isin in datos.get('patrimonio', {}):  # flujos, con su serie en su divisa, como el patrimonio
            resultados[isin].update(m.metricas_flujos(datos['patrimonio'][isin], datos['valores'][isin], hoy))
        if fondos[isin].get('ter') is not None:
            resultados[isin][('hoy', 'ter')] = fondos[isin]['ter']  # para el bloque Coste de la nota
        if fondos[isin].get('tir') is not None and m.tipo_activo(fondos[isin].get('categoria')) == 'renta fija':
            resultados[isin][('hoy', 'tir_neta')] = fondos[isin]['tir'] - (fondos[isin].get('ter') or 0)  # bloque TIR, %

    filas = []
    pct = solo_con_cobertura(percentiles_categoria(resultados, fondos), resultados, fondos, ('hoy', 'tir_neta'))
    # bloques de la nota (0–100): se guardan en metrica (ventana 'nota' y, los que dependen del plazo, 'nota_<plazo>'; valor y
    # percentil = la puntuación) para que la web solo pondere. Nota semanal: pesos por defecto de su grupo y su percentil en
    # la categoría, con la misma regla de una clase por fondo
    bloques = bloques_fondos(resultados, fondos, pct)
    notas = {i: (n, b[None][1]) for i, b in bloques.items() if None in b
             and (n := m.ponderar(b[None][0], m.PESOS_GRUPO[m.grupo_pesos(fondos[i].get('categoria'),
                                                                           fondos[i].get('gestion') == 'indexada')])) is not None}
    pct_nota = percentiles_categoria({i: {('hoy', 'nota'): n[0]} for i, n in notas.items()}, fondos)
    notas_filas = [(i, round(n, 2), pct_nota.get(i, {}).get(('hoy', 'nota')), solo3)
                   for i, (n, solo3) in notas.items()]
    for isin, res in resultados.items():
        for (ventana, nombre), valor in res.items():
            filas.append((isin, ventana, nombre, float(valor), pct.get(isin, {}).get((ventana, nombre))))
    for isin, por in bloques.items():
        filas += filas_nota(isin, por)
    # las referencias, también de cierre a cierre de mes (y el mes en curso, para el año en curso), para las carteras (que se calculan en la web)
    ref_mes, _ = referencias(fondos, {i: m.mensuales_con_curso(v) for i, v in en_eur.items()},
                             datos['indices'], datos['categorias'], m.tasa_mensual(datos['estr']))
    refs = {clave: ([m.lunes_de(k) for k in s], list(s.values()),
                    [dt.date(a, mes, 1) for a, mes in ref_mes.get(clave, {})], list(ref_mes.get(clave, {}).values()))
            for clave, s in series_ref.items()}
    return filas, refs, notas_filas, diversificacion(rend, fondos, datos.get('carteras', {}))
