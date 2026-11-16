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
    'por tipo': {  # salido de la primera pasada: hay que leerlo con cuidado (mismos datos con los que se eligió)
        'renta variable': {'riesgo': 15, 'consistencia': 0, 'coste': 60, 'proteccion': 15, 'rentabilidad': 10},
        'renta fija': {'riesgo': 30, 'consistencia': 20, 'coste': 30, 'proteccion': 0, 'rentabilidad': 20},
        'mixto': {'riesgo': 20, 'consistencia': 20, 'coste': 40, 'proteccion': 10, 'rentabilidad': 10},
    },
}
TIPOS = ('renta variable', 'renta fija', 'mixto')
NOMBRE = {'rentabilidad': 'Rentabilidad', 'sharpe': 'Sharpe', 'max_caida': 'Caída máxima (percentil alto = cayó menos)'}
VENTANAS = ('1a', '3a', '5a')  # plazos de la nota que se comparan (10 años: aún no hay historia para probarlo)
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
        b = m.bloques_nota(pct.get(isin, {}), datos['fondos'][isin].get('gestion') == 'indexada')  # la nota de verdad
        indexada = datos['fondos'][isin].get('gestion') == 'indexada'
        por_plazo = {v: x[0] for v in VENTANAS if (x := m.bloques_nota(pct.get(isin, {}), indexada, v))}
        out[isin] = {'bloques': b[0] if b else {}, 'valores': valores.get(isin, {}),
                     'ventanas': por_plazo if len(por_plazo) == len(VENTANAS) else {}}  # solo con todos: misma muestra
    return out


def puntuaciones(bloques: dict[str, float], tipo_: str, ventanas: dict[str, dict] | None = None) -> dict[str, float]:
    """Lo que se evalúa de un fondo: cada bloque solo, la nota de cada reparto y, si tiene todos los plazos, la nota
    actual con cada plazo y con la media de varios."""
    out = {f'bloque {b}': x for b, x in bloques.items()}
    for nombre, pesos in REPARTOS.items():
        if set(pesos) & set(TIPOS):
            pesos = pesos.get(tipo_, m.PESOS_NOTA)
        n = m.ponderar(bloques, pesos)
        if n is not None:
            out[nombre] = n
    notas = {v: m.ponderar(b, m.PESOS_NOTA) for v, b in (ventanas or {}).items()}
    if notas and None not in notas.values():
        out |= {f'plazo {v}': n for v, n in notas.items()}
        out['plazo 3a+5a'] = (notas['3a'] + notas['5a']) / 2
        out['plazo 1a+3a+5a'] = fmean(notas.values())
    return out


def muestra(antes: dict[str, dict], despues: dict[str, dict], fondos: dict[str, dict], horizonte: int,
            resultado: str) -> dict[str, list[tuple[str, float]]]:
    """{categoría: [(isin, percentil futuro)]} de un corte: una clase por fondo (la de menor TER) con nota en el corte y
    resultado `horizonte` años después, pasado a percentil dentro de su categoría y solo entre esa muestra; solo las
    categorías con al menos MIN_CATEGORIA fondos."""
    clave = (f'{horizonte}a', resultado)
    elegida: dict[str, str] = {}
    for isin in sorted(antes, key=lambda i: (fondos[i].get('ter') is None, fondos[i].get('ter') or 0, i)):
        f = fondos[isin]
        if f.get('en_universo') and f.get('categoria') and antes[isin]['bloques'] and clave in despues.get(isin, {}).get('valores', {}):
            elegida.setdefault(f.get('fund_id') or isin, isin)
    futuro = percentiles_categoria({i: {clave: despues[i]['valores'][clave]} for i in elegida.values()}, fondos)
    por_cat: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for i in sorted(elegida.values()):
        if clave in futuro.get(i, {}):
            por_cat[fondos[i]['categoria']].append((i, futuro[i][clave]))
    return {c: xs for c, xs in por_cat.items() if len(xs) >= MIN_CATEGORIA}


def evaluar(antes: dict[str, dict], despues: dict[str, dict], fondos: dict[str, dict], horizonte: int,
            resultado: str) -> dict[tuple[str, str], tuple[float | None, float | None, int]]:
    """{(puntuación, tipo o 'todos'): (correlación, percentil medio futuro del top 20 %, fondos)} de un corte (muestra:
    la de `muestra`)."""
    pares: dict[tuple[str, str], list[tuple[float, float]]] = defaultdict(list)
    top: dict[tuple[str, str], list[float]] = defaultdict(list)
    for cat, xs in muestra(antes, despues, fondos, horizonte, resultado).items():
        t = tipo(cat)
        futuro = dict(xs)
        punt = {i: puntuaciones(antes[i]['bloques'], t, antes[i].get('ventanas')) for i in futuro}
        for nombre in {k for p in punt.values() for k in p}:
            con = [(punt[i][nombre], futuro[i]) for i in futuro if nombre in punt[i]]
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
              'A favor: cortes en los que el top 20 % acaba por encima de 50. '
              'Las filas «plazo» usan los pesos actuales con métricas de ese plazo y solo los fondos con 5 años o más.', '']
    for h in HORIZONTES:
        for r in RESULTADOS:
            cs = sorted(c for (c, hh, rr) in resultados if hh == h and rr == r)
            if not cs:
                continue
            res = [resultados[(c, h, r)] for c in cs]
            nombres = sorted({k[0] for x in res for k in x}, key=lambda n: (n.startswith('plazo'), not n.startswith('bloque'), n))
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
    return informe(resultados) + '\n' + validar(fotos, datos['fondos'])


# ------------------------------------------------------------------ validación fuera de muestra
# Los pesos por tipo se eligen con los cortes cuyo resultado a 1 año acaba antes de SEPARACION (entreno) y se miden con
# los cortes desde SEPARACION (prueba), que no comparten ningún dato futuro con el entreno. Objetivo del entreno: el
# percentil futuro medio del top 20 % en rentabilidad y Sharpe a 1 año (la caída solo se mira en la prueba).
SEPARACION = dt.date(2022, 6, 30)
OBJETIVO = ('rentabilidad', 'sharpe')
PASO = 10  # los pesos van de 10 en 10 y suman 100: 1.001 repartos


def repartos(paso: int = PASO) -> list[dict[str, int]]:
    """Todos los repartos de 100 entre los bloques de la nota, en pasos de `paso`."""
    def rec(i: int, resto: int) -> list[dict[str, int]]:
        if i == len(BLOQUES) - 1:
            return [{BLOQUES[i]: resto * paso}]
        return [{BLOQUES[i]: k * paso, **r} for k in range(resto + 1) for r in rec(i + 1, resto - k)]
    return rec(0, 100 // paso)


def mejores(grupos: list[list[tuple[dict, float]]], pesos: dict[str, float]) -> list[float]:
    """Percentiles futuros del 20 % con mejor nota de cada categoría ({bloques}, percentil futuro) con esos pesos."""
    out = []
    for xs in grupos:
        con = sorted(((n, y) for b, y in xs if (n := m.ponderar(b, pesos)) is not None), key=lambda x: -x[0])
        if len(con) >= MIN_CATEGORIA:
            out += [y for _, y in con[:math.ceil(len(con) / 5)]]
    return out


def validar(fotos: dict[dt.date, dict], fondos: dict[str, dict], separacion: dt.date = SEPARACION) -> str:
    """Elige el mejor reparto de cada tipo con los cortes de entreno y lo compara con los demás en los de prueba."""
    def mas(c: dt.date, h: int) -> dt.date:
        return dt.date(c.year + h, c.month, c.day)

    # {(corte, horizonte, resultado): {tipo: [[(bloques, percentil futuro)] por categoría]}}
    g: dict[tuple, dict[str, list]] = {}
    for c in fotos:
        for h in HORIZONTES:
            if mas(c, h) in fotos:
                for r in RESULTADOS:
                    x: dict[str, list] = defaultdict(list)
                    for cat, xs in muestra(fotos[c], fotos[mas(c, h)], fondos, h, r).items():
                        x[tipo(cat)].append([(fotos[c][i]['bloques'], y) for i, y in xs])
                    g[(c, h, r)] = x
    entreno = sorted(c for c in fotos if (c, 1, OBJETIVO[0]) in g and mas(c, 1) <= separacion)
    prueba = sorted(c for c in fotos if c >= separacion)
    if not entreno or not prueba:
        return ''

    def media_cortes(cs, h, r, t, pesos) -> list[float]:
        return [fmean(xs) for c in cs if (c, h, r) in g and (xs := mejores(g[(c, h, r)].get(t, []), pesos))]

    elegido = {}
    for t in TIPOS:
        def puntos(p):
            xs = [x for r in OBJETIVO for x in media_cortes(entreno, 1, r, t, p)]
            return fmean(xs) if xs else 0.0
        elegido[t] = max(repartos(), key=puntos)
    candidatos = {'actual': {t: m.PESOS_NOTA for t in TIPOS}, 'por tipo (a mano)': REPARTOS['por tipo'],
                  'elegido en el entreno': elegido, 'solo coste': {t: {'coste': 100} for t in TIPOS}}

    lineas = ['## Validación fuera de muestra', '',
              f'Entreno: {len(entreno)} cortes ({entreno[0]} a {entreno[-1]}, resultado a 1 año antes de {separacion}). '
              f'Prueba: cortes desde {separacion}. Cifra: percentil futuro medio del top 20 % (50 = azar); «a favor», '
              'cortes de prueba por encima de 50.', '', '### Reparto elegido en el entreno', '',
              '| Tipo | ' + ' | '.join(BLOQUES) + ' |', '|---|' + '---:|' * len(BLOQUES)]
    lineas += [f'| {t} | ' + ' | '.join(str(elegido[t][b]) for b in BLOQUES) + ' |' for t in TIPOS]
    for h in HORIZONTES:
        for r in RESULTADOS:
            cs = [c for c in prueba if (c, h, r) in g]
            if not cs:
                continue
            lineas += ['', f'### Prueba · {NOMBRE[r]} a {h} año{"s" if h > 1 else ""} · {len(cs)} cortes ({cs[0]} a {cs[-1]})', '',
                       '| Reparto | Todos | A favor | ' + ' | '.join(TIPOS) + ' | Entreno (todos) |', '|---|---:|---:|' + '---:|' * (len(TIPOS) + 1)]
            for nombre, rep in candidatos.items():
                def todos(cs_):
                    return [fmean(xs) for c in cs_ if (c, h, r) in g
                            and (xs := [y for t in TIPOS for y in mejores(g[(c, h, r)].get(t, []), rep[t])])]
                tt, en = todos(cs), todos(entreno)
                if not tt:
                    continue
                celdas = [f'{fmean(tt):.1f}', f'{sum(x > 50 for x in tt)}/{len(tt)}']
                celdas += [f'{fmean(xs):.1f}' if (xs := media_cortes(cs, h, r, t, rep[t])) else '—' for t in TIPOS]
                celdas.append(f'{fmean(en):.1f}' if en else '—')
                lineas.append(f'| {nombre} | ' + ' | '.join(celdas) + ' |')
    return '\n'.join(lineas) + '\n'
