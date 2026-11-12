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
    return m.a_eur(valores, tipos.get(divisa, {}))


def referencias(fondos: dict[str, dict], semanales: dict[str, m.SerieSemanal], indices: dict[str, dict],
                categorias: dict[str, dict], estr_semanal: dict) -> tuple[dict[str, m.SerieSemanal], dict[str, str]]:
    """Serie de referencia de cada índice y de cada categoría con media, y qué clave usa cada fondo.

    Devuelve ({clave: serie}, {isin: clave}). Claves: 'indice:<id>' o 'media:<categoría>'.
    """
    rend = {i: m.rendimientos(s) for i, s in semanales.items()}
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


def calcular(datos: dict, hoy: dt.date) -> list[tuple]:
    """datos: fondos, valores, tipos, estr, indices, categorias → filas (isin, ventana, nombre, valor, percentil)."""
    fondos, tipos = datos['fondos'], datos['tipos']
    semanales = {isin: m.semanal(serie_eur(v, fondos[isin].get('divisa'), tipos))
                 for isin, v in datos['valores'].items() if isin in fondos}
    semanales = {i: s for i, s in semanales.items() if len(s) >= 2}
    estr_semanal = m.tasa_semanal(datos['estr'])
    series_ref, usa = referencias(fondos, semanales, datos['indices'], datos['categorias'], estr_semanal)

    resultados: dict[str, dict] = {}
    for isin, s in semanales.items():
        ref = series_ref.get(usa.get(isin, ''))
        resultados[isin] = m.metricas_fondo(s, ref, estr_semanal, hoy)

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
    return filas
