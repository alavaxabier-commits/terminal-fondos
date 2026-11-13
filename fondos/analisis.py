"""Análisis de los pesos de la nota (se lanza a mano, no escribe nada): ¿qué bloque predice mejor cómo le irá al fondo
frente a su categoría después?

Para cada corte semestral pasado se calcula todo como si fuera ese día (lo mismo que hace `notas`): los bloques de la
nota con lo que se sabía entonces y, 1 y 3 años después, la rentabilidad, el Sharpe y la caída máxima de esos años. Con eso:
- correlación entre el percentil del bloque (o la nota de un reparto) y el percentil del resultado futuro;
- «top 20 %»: si se elige el 20 % mejor de cada categoría, en qué percentil acaba de media (50 = azar).

Sesgos que hay que tener presentes: solo hay fondos vivos y grandes hoy (supervivencia), el TER y la categoría son los
de hoy y los cortes se solapan (los resultados de 3 años de dos cortes seguidos comparten dos años y medio).
"""
from __future__ import annotations

import datetime as dt
import math
import re
from collections import defaultdict
from statistics import correlation, fmean

from .calculo import calcular, percentiles_categoria
from .nucleo import metricas as m

HORIZONTES = (1, 3)
RESULTADOS = ('rentabilidad', 'sharpe', 'max_caida')  # caída: percentil alto = cayó menos
BLOQUES = ('riesgo', 'consistencia', 'coste', 'proteccion', 'rentabilidad')
# Un reparto es {bloque: peso} o, por tipo de activo, {tipo: {bloque: peso}} (lo que no tenga tipo usa el actual).
REPARTOS = {
    'anterior': {'riesgo': 25, 'consistencia': 20, 'coste': 20, 'proteccion': 15, 'rentabilidad': 10},
    'actual': m.PESOS_NOTA,  # el antiguo «más coste»
    'coste + riesgo': {'riesgo': 50, 'consistencia': 0, 'coste': 50, 'proteccion': 0, 'rentabilidad': 0},
    'propuesta': {'riesgo': 30, 'consistencia': 10, 'coste': 40, 'proteccion': 10, 'rentabilidad': 10},
    'por tipo': {  # salido de la primera pasada: hay que leerlo con cuidado (mismos datos con los que se eligió)
        'renta variable': {'riesgo': 15, 'consistencia': 0, 'coste': 60, 'proteccion': 15, 'rentabilidad': 10},
        'renta fija': {'riesgo': 30, 'consistencia': 20, 'coste': 30, 'proteccion': 0, 'rentabilidad': 20},
        'mixto': {'riesgo': 20, 'consistencia': 20, 'coste': 40, 'proteccion': 10, 'rentabilidad': 10},
    },
}
TIPOS = ('renta variable', 'renta fija', 'mixto')
NOMBRE = {'rentabilidad': 'Rentabilidad', 'sharpe': 'Sharpe', 'max_caida': 'Caída máxima (percentil alto = cayó menos)'}
MIN_CATEGORIA = 5  # fondos de la categoría en la muestra para que cuente


def tipo(categoria: str | None) -> str:
    """Como tipoActivo de la web (calculo/screener.ts)."""
    c = categoria or ''
    if re.search('allocation', c, re.I):
        return 'mixto'
    if re.search('equity', c, re.I):
        return 'renta variable'
    if re.search('bond|fixed|debt|credit', c, re.I):
        return 'renta fija'
    return 'otros'


def cortes(desde: dt.date, hasta: dt.date) -> list[dt.date]:
    """Fines de junio y de diciembre entre las dos fechas."""
    out = []
    for a in range(desde.year, hasta.year + 1):
        out += [d for d in (dt.date(a, 6, 30), dt.date(a, 12, 31)) if desde <= d <= hasta]
    return out


def foto(datos: dict, corte: dt.date) -> dict[str, dict]:
    """Todo calculado como si fuera `corte`: {isin: {'bloques': {...}, 'valores': {(ventana, nombre): valor}}}."""
    recortados = {**datos, 'carteras': {},
                  'valores': {i: {d: v for d, v in s.items() if d <= corte} for i, s in datos['valores'].items()}}
    filas = calcular(recortados, corte)[0]
    pct: dict[str, dict] = defaultdict(dict)
    valores: dict[str, dict] = defaultdict(dict)
    for isin, ventana, nombre, valor, p in filas:
        if p is not None:
            pct[isin][(ventana, nombre)] = p
        if nombre in RESULTADOS and ventana in ('1a', '3a'):
            valores[isin][(ventana, nombre)] = valor
    out = {}
    for isin in set(pct) | set(valores):
        b = m.bloques_nota(pct.get(isin, {}), datos['fondos'][isin].get('gestion') == 'indexada')
        out[isin] = {'bloques': b[0] if b else {}, 'valores': valores.get(isin, {})}
    return out


def puntuaciones(bloques: dict[str, float], tipo_: str) -> dict[str, float]:
    """Lo que se evalúa de un fondo: cada bloque solo y la nota de cada reparto."""
    out = {f'bloque {b}': x for b, x in bloques.items()}
    for nombre, pesos in REPARTOS.items():
        if set(pesos) & set(TIPOS):
            pesos = pesos.get(tipo_, m.PESOS_NOTA)
        n = m.ponderar(bloques, pesos)
        if n is not None:
            out[nombre] = n
    return out


def evaluar(antes: dict[str, dict], despues: dict[str, dict], fondos: dict[str, dict], horizonte: int,
            resultado: str) -> dict[tuple[str, str], tuple[float | None, float | None, int]]:
    """{(puntuación, tipo o 'todos'): (correlación, percentil medio futuro del top 20 %, fondos)} de un corte.

    Muestra: una clase por fondo (la de menor TER) con nota en el corte y resultado `horizonte` años después; el
    resultado futuro se pasa a percentil dentro de su categoría y solo entre esa muestra."""
    clave = (f'{horizonte}a', resultado)
    elegida: dict[str, str] = {}
    for isin in sorted(antes, key=lambda i: (fondos[i].get('ter') is None, fondos[i].get('ter') or 0, i)):
        f = fondos[isin]
        if f.get('en_universo') and f.get('categoria') and antes[isin]['bloques'] and clave in despues.get(isin, {}).get('valores', {}):
            elegida.setdefault(f.get('fund_id') or isin, isin)
    muestra = set(elegida.values())
    futuro = percentiles_categoria({i: {clave: despues[i]['valores'][clave]} for i in muestra}, fondos)
    por_cat: dict[str, list[str]] = defaultdict(list)
    for i in muestra:
        if clave in futuro.get(i, {}):
            por_cat[fondos[i]['categoria']].append(i)
    por_cat = {c: xs for c, xs in por_cat.items() if len(xs) >= MIN_CATEGORIA}

    pares: dict[tuple[str, str], list[tuple[float, float]]] = defaultdict(list)
    top: dict[tuple[str, str], list[float]] = defaultdict(list)
    for cat, isins in por_cat.items():
        t = tipo(cat)
        punt = {i: puntuaciones(antes[i]['bloques'], t) for i in isins}
        for nombre in {k for p in punt.values() for k in p}:
            con = [(punt[i][nombre], futuro[i][clave]) for i in isins if nombre in punt[i]]
            if len(con) < MIN_CATEGORIA:
                continue
            con.sort(key=lambda x: -x[0])
            mejores = [y for _, y in con[:math.ceil(len(con) / 5)]]
            for g in ('todos', t):
                pares[(nombre, g)] += con
                top[(nombre, g)] += mejores
    out = {}
    for k, xs in pares.items():
        a, b = [x for x, _ in xs], [y for _, y in xs]
        c = correlation(a, b) if len(xs) > 2 and len(set(a)) > 1 and len(set(b)) > 1 else None
        out[k] = (c, fmean(top[k]), len(xs))
    return out


def informe(resultados: dict[tuple[dt.date, int, str], dict]) -> str:
    """Tablas en markdown: por horizonte y resultado, una fila por puntuación con la media de los cortes."""
    lineas = ['## Análisis de los pesos de la nota', '',
              'Correlación: entre la puntuación del fondo en el corte y su percentil futuro en la categoría (0 = nada). '
              'Top 20 %: percentil futuro medio del 20 % mejor de cada categoría según esa puntuación (50 = azar). '
              'A favor: cortes en los que el top 20 % acaba por encima de 50.', '']
    for h in HORIZONTES:
        for r in RESULTADOS:
            cs = sorted(c for (c, hh, rr) in resultados if hh == h and rr == r)
            if not cs:
                continue
            res = [resultados[(c, h, r)] for c in cs]
            nombres = sorted({k[0] for x in res for k in x}, key=lambda n: (not n.startswith('bloque'), n))
            lineas += [f'### {NOMBRE[r]} a {h} año{"s" if h > 1 else ""} · {len(cs)} cortes ({cs[0]} a {cs[-1]})', '',
                       '| Puntuación | Correlación | Top 20 % | A favor | ' + ' | '.join(f'Top 20 % {t}' for t in TIPOS) + ' | Fondos/corte |',
                       '|---|---:|---:|---:|' + '---:|' * len(TIPOS) + '---:|']
            for n in nombres:
                def col(g, i):
                    xs = [x[(n, g)][i] for x in res if (n, g) in x and x[(n, g)][i] is not None]
                    return xs
                corr, t20 = col('todos', 0), col('todos', 1)
                favor = sum(1 for x in t20 if x > 50)
                celdas = [f'{fmean(corr):+.2f}' if corr else '—', f'{fmean(t20):.1f}' if t20 else '—', f'{favor}/{len(t20)}']
                celdas += [f'{fmean(xs):.1f}' if (xs := col(t, 1)) else '—' for t in TIPOS]
                celdas.append(f'{fmean(col("todos", 2)):.0f}' if col('todos', 2) else '—')
                lineas.append(f'| {n} | ' + ' | '.join(celdas) + ' |')
            lineas.append('')
    return '\n'.join(lineas)


def analizar(datos: dict, hoy: dt.date, desde: dt.date = dt.date(2019, 6, 30), log=print) -> str:
    """Calcula una foto por corte y cruza cada una con las de 1 y 3 años después."""
    fotos = {}
    for c in cortes(desde, hoy):
        t0 = dt.datetime.now()
        fotos[c] = foto(datos, c)
        log(f'{c}: {sum(1 for f in fotos[c].values() if f["bloques"])} fondos con nota · {(dt.datetime.now() - t0).seconds} s')
    resultados = {}
    for c in fotos:
        for h in HORIZONTES:
            despues = dt.date(c.year + h, c.month, c.day)
            if despues in fotos:
                for r in RESULTADOS:
                    resultados[(c, h, r)] = evaluar(fotos[c], fotos[despues], datos['fondos'], h, r)
    return informe(resultados)
