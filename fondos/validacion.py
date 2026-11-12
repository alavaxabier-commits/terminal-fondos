"""Comprobaciones y transformaciones de series de valores liquidativos. Sin red ni base de datos."""
from __future__ import annotations

import datetime as dt

Serie = dict[dt.date, float]

HUECO_DIAS_HABILES = 5   # más días hábiles seguidos sin dato → aviso (series diarias)
SALTO_MAX = 0.15         # variación entre dos datos diarios consecutivos por encima de esto → aviso
SALTO_MAX_SEMANAL = 0.20 # ídem entre dos datos semanales


def dias_habiles_entre(a: dt.date, b: dt.date) -> int:
    """Días de lunes a viernes estrictamente entre a y b."""
    if b <= a:
        return 0
    total = (b - a).days - 1
    semanas, resto = divmod(total, 7)
    n = semanas * 5
    d = a + dt.timedelta(days=1 + semanas * 7)
    for _ in range(resto):
        n += d.weekday() < 5
        d += dt.timedelta(days=1)
    return n


def avisos(serie: Serie, semanal: bool = False) -> list[str]:
    """Huecos y saltos sospechosos, en texto, de más antiguo a más reciente."""
    fechas = sorted(serie)
    out = []
    for a, b in zip(fechas, fechas[1:]):
        if semanal:
            semanas = (lunes(b) - lunes(a)).days // 7
            if semanas > 1:  # alguna semana sin dato
                out.append(f'{semanas - 1} semana(s) sin dato entre {a} y {b}')
        else:
            h = dias_habiles_entre(a, b)
            if h > HUECO_DIAS_HABILES:
                out.append(f'hueco de {h} días hábiles entre {a} y {b}')
        salto = serie[b] / serie[a] - 1
        if abs(salto) > (SALTO_MAX_SEMANAL if semanal else SALTO_MAX):
            out.append(f'salto de {salto:+.1%} el {b}')
    return out


def lunes(d: dt.date) -> dt.date:
    return d - dt.timedelta(days=d.weekday())


def a_semanal(serie: Serie, hoy: dt.date) -> Serie:
    """Último dato de cada semana ya cerrada (la semana en curso se descarta: aún puede cambiar su último dato)."""
    corte = lunes(hoy)
    ultimo: dict[tuple[int, int], dt.date] = {}
    for f in sorted(serie):
        if f < corte:
            ultimo[f.isocalendar()[:2]] = f
    return {f: serie[f] for f in sorted(ultimo.values())}


def a_semanal_y_meses(serie: Serie, hoy: dt.date) -> Serie:
    """Lo semanal más el último dato de cada mes ya cerrado (para años naturales exactos y métricas mensuales)."""
    out = a_semanal(serie, hoy)
    corte = hoy.replace(day=1)
    ultimo_mes: dict[tuple[int, int], dt.date] = {}
    for f in sorted(serie):
        if f < corte:
            ultimo_mes[(f.year, f.month)] = f
    out.update({f: serie[f] for f in ultimo_mes.values()})
    return dict(sorted(out.items()))


def ultimo_habil_anterior(hoy: dt.date) -> dt.date:
    d = hoy - dt.timedelta(days=1)
    while d.weekday() >= 5:
        d -= dt.timedelta(days=1)
    return d


def hace_anos(hoy: dt.date, anos: int) -> dt.date:
    try:
        return hoy.replace(year=hoy.year - anos)
    except ValueError:  # 29 de febrero
        return hoy.replace(year=hoy.year - anos, day=28)
