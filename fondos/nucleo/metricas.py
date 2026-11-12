"""Métricas de un fondo sobre su serie semanal en EUR (especificación, sección 5). Sin red ni base de datos.

Las series se alinean por semana ISO (año, semana): un fondo con dato el jueves de una semana festiva y su índice
con dato el viernes caen en la misma semana. Todas las rentabilidades son semanales y se anualizan con 52.
"""
from __future__ import annotations

import datetime as dt
import math
from statistics import fmean, pstdev, stdev

Semana = tuple[int, int]            # (año ISO, semana ISO)
SerieSemanal = dict[Semana, float]  # valor por semana
SEMANAS_ANO = 52
VENTANAS = {'1a': 1, '3a': 3, '5a': 5, '10a': 10}


# ------------------------------------------------------------------ preparación
def semanal(serie: dict[dt.date, float]) -> SerieSemanal:
    """Último valor de cada semana ISO."""
    out: dict[Semana, tuple[dt.date, float]] = {}
    for f, v in serie.items():
        k = f.isocalendar()[:2]
        if k not in out or f > out[k][0]:
            out[k] = (f, v)
    return {k: v for k, (_, v) in sorted(out.items())}


def lunes_de(s: Semana) -> dt.date:
    return dt.date.fromisocalendar(s[0], s[1], 1)


def a_eur(serie: dict[dt.date, float], por_eur: dict[dt.date, float]) -> dict[dt.date, float]:
    """Pasa una serie en divisa a EUR con el tipo del BCE del día o del último día anterior con tipo."""
    if not por_eur:
        return {}
    fechas = sorted(por_eur)
    out, j = {}, 0
    for f in sorted(serie):
        while j + 1 < len(fechas) and fechas[j + 1] <= f:
            j += 1
        if fechas[j] <= f:
            out[f] = serie[f] / por_eur[fechas[j]]
    return out


def rendimientos(s: SerieSemanal) -> dict[Semana, float]:
    """Rentabilidad de cada semana frente a la semana anterior con dato (si es la inmediatamente anterior)."""
    ks = list(s)
    out = {}
    for a, b in zip(ks, ks[1:]):
        if (lunes_de(b) - lunes_de(a)).days == 7:
            out[b] = s[b] / s[a] - 1
    return out


def recorte(s: SerieSemanal, desde: Semana) -> SerieSemanal:
    return {k: v for k, v in s.items() if k >= desde}


def semana_hace(ultima: Semana, anos: int) -> Semana:
    return (lunes_de(ultima) - dt.timedelta(weeks=SEMANAS_ANO * anos)).isocalendar()[:2]


def ventana_completa(s: SerieSemanal, ultima: Semana, anos: int) -> SerieSemanal | None:
    """Los últimos `anos` años de la serie, o None si no llega a cubrirlos (con una semana de holgura)."""
    inicio = semana_hace(ultima, anos)
    if not s or min(s) > (lunes_de(inicio) + dt.timedelta(weeks=1)).isocalendar()[:2]:
        return None
    return recorte(s, inicio)


# ------------------------------------------------------------------ métricas de un fondo
def anualizada(s: SerieSemanal) -> float | None:
    ks = list(s)
    if len(ks) < 2:
        return None
    semanas = (lunes_de(ks[-1]) - lunes_de(ks[0])).days / 7
    return (s[ks[-1]] / s[ks[0]]) ** (SEMANAS_ANO / semanas) - 1 if semanas > 0 else None


def acumulada(s: SerieSemanal) -> float | None:
    ks = list(s)
    return s[ks[-1]] / s[ks[0]] - 1 if len(ks) >= 2 else None


def volatilidad(r: list[float]) -> float | None:
    return pstdev(r) * math.sqrt(SEMANAS_ANO) if len(r) >= 2 else None


def desviacion_bajista(r: list[float]) -> float | None:
    """Raíz de la media de los cuadrados de las semanas negativas, sobre el total de semanas, anualizada."""
    if len(r) < 2:
        return None
    return math.sqrt(sum(min(x, 0) ** 2 for x in r) / len(r)) * math.sqrt(SEMANAS_ANO)


def maxima_caida(s: SerieSemanal) -> tuple[float | None, int | None]:
    """(peor caída desde un máximo previo, semanas desde ese máximo hasta superarlo; None = sin recuperar)."""
    if len(s) < 2:
        return None, None
    ks = list(s)
    pico_k, pico_v = ks[0], s[ks[0]]
    peor, peor_pico, peor_k = 0.0, ks[0], ks[0]
    for k in ks:
        v = s[k]
        if v > pico_v:
            pico_k, pico_v = k, v
        caida = v / pico_v - 1
        if caida < peor:
            peor, peor_pico, peor_k = caida, pico_k, k
    if peor == 0:
        return 0.0, 0
    nivel = s[peor_pico]
    for k in ks:
        if k > peor_k and s[k] >= nivel:
            return peor, (lunes_de(k) - lunes_de(peor_pico)).days // 7
    return peor, None


def regresion(rf: list[float], rb: list[float]) -> tuple[float | None, float | None]:
    """(alfa anualizada, beta) de las rentabilidades del fondo frente a las del índice."""
    if len(rf) < 10:
        return None, None
    mb, mf = fmean(rb), fmean(rf)
    var = sum((x - mb) ** 2 for x in rb)
    if var < 1e-12 * len(rb):  # índice plano (p. ej. un monetario frente al €STR): beta sin sentido
        return None, None
    beta = sum((x - mb) * (y - mf) for x, y in zip(rb, rf)) / var
    return (mf - beta * mb) * SEMANAS_ANO, beta


def captura(rf: list[float], rb: list[float], alcista: bool) -> float | None:
    """Rentabilidad media geométrica del fondo en las semanas en que el índice sube (o baja), entre la del índice, en %."""
    pares = [(f, b) for f, b in zip(rf, rb) if (b > 0 if alcista else b < 0)]
    if len(pares) < 5:
        return None
    gf = math.prod(1 + f for f, _ in pares) ** (1 / len(pares)) - 1
    gb = math.prod(1 + b for _, b in pares) ** (1 / len(pares)) - 1
    return gf / gb * 100 if gb else None


def consistencia(s: SerieSemanal, ref: SerieSemanal, anos: int = 3) -> float | None:
    """% de ventanas rodantes de `anos` años (paso semanal) en que el fondo bate a su referencia.

    Exige al menos 5 años de historia común (dos años de ventanas rodantes); si no, None.
    """
    comunes = [k for k in s if k in ref]
    if len(comunes) < 2:
        return None
    if (lunes_de(comunes[-1]) - lunes_de(comunes[0])).days < 5 * 365:
        return None
    n = anos * SEMANAS_ANO
    gana = total = 0
    for i in range(n, len(comunes)):
        a, b = comunes[i - n], comunes[i]
        total += 1
        gana += (s[b] / s[a]) > (ref[b] / ref[a])
    return gana / total * 100 if total else None


def tasa_semanal(estr: dict[dt.date, float]) -> dict[Semana, float]:
    """€STR diario (% anual) → rentabilidad de cada semana ISO."""
    por_semana: dict[Semana, list[float]] = {}
    for f, v in estr.items():
        por_semana.setdefault(f.isocalendar()[:2], []).append(v)
    return {k: (1 + fmean(vs) / 100) ** (7 / 365) - 1 for k, vs in sorted(por_semana.items())}


def serie_de_rendimientos(r: dict[Semana, float], base: float = 100.0) -> SerieSemanal:
    """Rentabilidades semanales → serie de valor encadenada (para índices combinados o medias)."""
    out, v = {}, base
    for k in sorted(r):
        v *= 1 + r[k]
        out[k] = v
    return out


def media_rendimientos(series: list[dict[Semana, float]], minimo: int = 3) -> dict[Semana, float]:
    """Media simple de varias series de rentabilidades semanales, solo en las semanas con al menos `minimo` fondos."""
    acum: dict[Semana, list[float]] = {}
    for r in series:
        for k, x in r.items():
            acum.setdefault(k, []).append(x)
    return {k: fmean(xs) for k, xs in sorted(acum.items()) if len(xs) >= minimo}


def combinar(componentes: list[tuple[dict[Semana, float], float]]) -> dict[Semana, float]:
    """Índice combinado (p. ej. 60/40) rebalanceado cada semana, solo en semanas en que existen todos."""
    if not componentes:
        return {}
    comunes = set.intersection(*(set(r) for r, _ in componentes))
    return {k: sum(r[k] * peso for r, peso in componentes) for k in sorted(comunes)}


def cierres_mes(serie: dict[dt.date, float]) -> dict[tuple[int, int], tuple[dt.date, float]]:
    """Último dato de cada mes: {(año, mes): (fecha, valor)}."""
    out: dict[tuple[int, int], tuple[dt.date, float]] = {}
    for f in sorted(serie):
        out[(f.year, f.month)] = (f, serie[f])
    return out


def es_cierre(f: dt.date) -> bool:
    """¿La fecha está en los últimos días del mes (con margen para festivos)?"""
    siguiente = (f.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    return (siguiente - f).days <= 7


def metricas_calendario(serie: dict[dt.date, float], hoy: dt.date) -> dict[tuple[str, str], float]:
    """Años naturales (cierre de diciembre a cierre de diciembre) y año en curso, con fechas exactas."""
    out: dict[tuple[str, str], float] = {}
    cierres = cierres_mes(serie)
    dic = {a: fv for (a, mes), fv in cierres.items() if mes == 12 and es_cierre(fv[0])}
    if not serie:
        return out
    ultima = max(serie)
    if ultima.year == hoy.year and (hoy.year - 1) in dic:
        out[('ytd', 'rentabilidad')] = serie[ultima] / dic[hoy.year - 1][1] - 1
    for a in sorted(dic):
        if (a - 1) in dic and a < hoy.year and a >= hoy.year - 10:
            out[(str(a), 'rentabilidad')] = dic[a][1] / dic[a - 1][1] - 1
    return out


def metricas_mensuales(serie: dict[dt.date, float], rf_semanal: dict[Semana, float], hoy: dt.date) -> dict[tuple[str, str], float]:
    """Volatilidad y Sharpe con rentabilidades mensuales, como Morningstar (36, 60 o 120 meses; desviación muestral)."""
    out: dict[tuple[str, str], float] = {}
    cierres = cierres_mes(serie)
    meses = [k for k in sorted(cierres) if es_cierre(cierres[k][0]) and k < (hoy.year, hoy.month)]
    rent: list[tuple[tuple[int, int], float]] = []
    for a, b in zip(meses, meses[1:]):
        consecutivos = (b[0] * 12 + b[1]) - (a[0] * 12 + a[1]) == 1
        if consecutivos:
            rent.append((b, cierres[b][1] / cierres[a][1] - 1))
    rf_anual = (1 + fmean(rf_semanal.values())) ** SEMANAS_ANO - 1 if rf_semanal else 0.0
    for nombre_v, n in (('3a', 3), ('5a', 5), ('10a', 10)):
        tramo = rent[-12 * n:]
        if len(tramo) < 12 * n:
            continue
        (a0, m0), (a1, m1) = tramo[0][0], tramo[-1][0]
        if (a1 * 12 + m1) - (a0 * 12 + m0) != 12 * n - 1:  # algún mes sin dato en medio
            continue
        rs = [r for _, r in tramo]
        vol = stdev(rs) * math.sqrt(12)
        anual = math.prod(1 + r for r in rs) ** (1 / n) - 1
        out[(nombre_v, 'volatilidad_mensual')] = vol
        if vol:
            out[(nombre_v, 'sharpe_mensual')] = (anual - rf_anual) / vol
    return out


def metricas_fondo(s: SerieSemanal, ref: SerieSemanal | None, rf_semanal: dict[Semana, float],
                   hoy: dt.date, fechas: dict[dt.date, float] | None = None) -> dict[tuple[str, str], float]:
    """Todas las métricas de un fondo: {(ventana, nombre): valor}. Lo que no se puede calcular, no aparece.

    `fechas` es la serie con sus fechas reales (semanal + cierres de mes, o diaria): si se da, los años naturales,
    el año en curso y las métricas mensuales salen de ella con fechas exactas.
    """
    out: dict[tuple[str, str], float] = {}
    if len(s) < 2:
        return out
    ultima = list(s)[-1]

    def poner(ventana, nombre, valor):
        if valor is not None and not (isinstance(valor, float) and (math.isnan(valor) or math.isinf(valor))):
            out[(ventana, nombre)] = valor

    if fechas:
        for k, v in metricas_calendario(fechas, hoy).items():
            poner(*k, v)
        for k, v in metricas_mensuales(fechas, rf_semanal, hoy).items():
            poner(*k, v)
    else:
        # sin fechas reales: aproximación por semanas ISO (año en curso y años naturales)
        previos = [k for k in s if k[0] < ultima[0]]
        if previos and ultima[0] == hoy.isocalendar()[0]:
            poner('ytd', 'rentabilidad', s[ultima] / s[previos[-1]] - 1)
        ultimos_por_ano: dict[int, Semana] = {}
        for k in s:
            ultimos_por_ano[k[0]] = k
        anos = sorted(ultimos_por_ano)
        for a, b in zip(anos, anos[1:]):
            if b < ultima[0] and b >= ultima[0] - 10:
                poner(str(b), 'rentabilidad', s[ultimos_por_ano[b]] / s[ultimos_por_ano[a]] - 1)

    for nombre_v, n in VENTANAS.items():
        w = ventana_completa(s, ultima, n)
        if w is None:
            continue
        r = rendimientos(w)
        rs = list(r.values())
        anual = anualizada(w)
        poner(nombre_v, 'rentabilidad', anual)
        poner(nombre_v, 'acumulada', acumulada(w))
        vol = volatilidad(rs)
        poner(nombre_v, 'volatilidad', vol)
        caida, recup = maxima_caida(w)
        poner(nombre_v, 'max_caida', caida)
        if n == 10 and caida is not None:
            poner(nombre_v, 'recuperacion_semanas', recup if recup is not None else -1)  # -1 = sin recuperar
        rf_v = [rf_semanal[k] for k in r if k in rf_semanal]
        rf_anual = (1 + fmean(rf_v)) ** SEMANAS_ANO - 1 if rf_v else 0.0
        if anual is not None and vol:
            poner(nombre_v, 'sharpe', (anual - rf_anual) / vol)
        dd = desviacion_bajista(rs)
        if anual is not None and dd:
            poner(nombre_v, 'sortino', (anual - rf_anual) / dd)

        if ref:
            rref = rendimientos(recorte(ref, list(w)[0]))
            comunes = [k for k in r if k in rref]
            rf_c, rb_c = [r[k] for k in comunes], [rref[k] for k in comunes]
            alfa, beta = regresion(rf_c, rb_c)
            poner(nombre_v, 'alfa', alfa)
            poner(nombre_v, 'beta', beta)
            if len(comunes) >= 10:
                difs = [a - b for a, b in zip(rf_c, rb_c)]
                te = pstdev(difs) * math.sqrt(SEMANAS_ANO)
                poner(nombre_v, 'tracking_error', te)
                exceso = (math.prod(1 + x for x in rf_c) ** (SEMANAS_ANO / len(rf_c))
                          - math.prod(1 + x for x in rb_c) ** (SEMANAS_ANO / len(rb_c)))
                if te:
                    poner(nombre_v, 'ratio_informacion', exceso / te)
            if n == 5:
                poner(nombre_v, 'captura_alcista', captura(rf_c, rb_c, True))
                poner(nombre_v, 'captura_bajista', captura(rf_c, rb_c, False))

    if ref:
        poner('hist', 'consistencia', consistencia(s, ref))
    return out


# ------------------------------------------------------------------ percentiles
# Dónde menos es mejor: el percentil se invierte. La beta no lleva percentil (ni mejor ni peor).
MENOS_ES_MEJOR = {'volatilidad', 'volatilidad_mensual', 'tracking_error', 'captura_bajista', 'recuperacion_semanas'}
SIN_PERCENTIL = {'beta', 'acumulada'}


def percentiles(valores: dict[str, float], nombre: str) -> dict[str, float]:
    """{isin: valor} de una métrica en una categoría → {isin: percentil 0–100, 100 = mejor}.

    max_caida es negativa (−0,10 es mejor que −0,30), así que «más es mejor» ya la ordena bien.
    Una recuperación «sin recuperar» (−1) cuenta como la peor.
    """
    if nombre in SIN_PERCENTIL or len(valores) < 2:
        return {}
    def clave(v):
        if nombre == 'recuperacion_semanas' and v < 0:
            return math.inf
        return v
    orden = sorted(valores, key=lambda i: clave(valores[i]), reverse=nombre in MENOS_ES_MEJOR)
    n = len(orden)
    out, i = {}, 0
    while i < n:  # empates: mismo percentil (el medio de su tramo)
        j = i
        while j + 1 < n and clave(valores[orden[j + 1]]) == clave(valores[orden[i]]):
            j += 1
        p = ((i + j) / 2) / (n - 1) * 100
        for k in orden[i:j + 1]:
            out[k] = round(p, 1)
        i = j + 1
    return out
