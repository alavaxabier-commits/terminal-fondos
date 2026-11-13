"""Alarmas de las descargas: lo que se sale de lo normal aunque la tarea no falle del todo (sin red ni base de datos).

Sirven para enterarse si Morningstar cambia algo: un respaldo que tapa la avería (precios de Yahoo o el FT en lugar de
Morningstar), campos que llegan vacíos o fallos parciales. Cada función da la lista de alarmas, en texto, o [] si todo
está en orden. Con alguna alarma la tarea acaba en rojo y GitHub avisa por correo; la web la enseña en Inicio.
"""
from __future__ import annotations

MAX_ERRORES = 0.10         # parte de fondos con error en una descarga
MIN_MORNINGSTAR = 0.50     # parte de los precios del día que deben venir de Morningstar
MIN_DESCARGAS = 5          # con menos descargas, los porcentajes no dicen nada
MAX_DIAS_SIN_PRECIO = 4    # días hábiles sin precio de un fondo de mis carteras
MIN_FICHAS = 0.90          # fichas del universo frente a la semana anterior
MAX_SIN_DATO = 0.20        # parte del universo sin TER o sin categoría
MIN_METRICAS = 0.90        # métricas frente a la ejecución anterior


def _pct(x: float) -> str:
    return f'{x * 100:.0f} %'.replace('.', ',')


def precios(cuenta: dict[str, int], por_fuente: dict[str, int], sin_precio: list[tuple[str, int | None]]) -> list[str]:
    """cuenta: ok/aviso/error de la descarga · por_fuente: descargas buenas por fuente (morningstar, yahoo, ft) ·
    sin_precio: (fondo de mis carteras, días hábiles desde su último precio; None si no tiene ninguno)."""
    out = []
    total = sum(cuenta.values())
    if total >= MIN_DESCARGAS and cuenta.get('error', 0) / total > MAX_ERRORES:
        out.append(f"precios: {cuenta['error']} de {total} fondos con error ({_pct(cuenta['error'] / total)})")
    buenas = sum(por_fuente.values())
    ms = por_fuente.get('morningstar', 0)
    if buenas >= MIN_DESCARGAS and ms / buenas < MIN_MORNINGSTAR:
        resto = ', '.join(f'{f} {n}' for f, n in sorted(por_fuente.items()) if f != 'morningstar' and n)
        out.append(f'precios: Morningstar solo ha dado {ms} de {buenas} descargas; el resto, del respaldo ({resto})')
    for nombre, dias in sin_precio:
        if dias is None or dias > MAX_DIAS_SIN_PRECIO:
            out.append(f'precios: {nombre} sin precio ' + ('todavía' if dias is None else f'desde hace {dias} días hábiles'))
    return out


def universo(fichas: int, anteriores: int | None, sin_ter: float, sin_categoria: float) -> list[str]:
    """fichas: descargadas hoy · anteriores: las de la ejecución anterior · sin_ter, sin_categoria: parte del universo."""
    out = []
    if anteriores and fichas < MIN_FICHAS * anteriores:
        out.append(f'universo: {fichas} fichas, frente a {anteriores} la vez anterior')
    if sin_ter > MAX_SIN_DATO:
        out.append(f'universo: el {_pct(sin_ter)} del universo sin TER')
    if sin_categoria > MAX_SIN_DATO:
        out.append(f'universo: el {_pct(sin_categoria)} del universo sin categoría')
    return out


def composicion(cuenta: dict[str, int], completas: int) -> list[str]:
    """cuenta: ok/aviso/error de la descarga · completas: fondos con todas sus posiciones en esta descarga."""
    out = []
    total = sum(cuenta.values())
    if total >= MIN_DESCARGAS and cuenta.get('error', 0) / total > MAX_ERRORES:
        out.append(f"composición: {cuenta['error']} de {total} fondos con error ({_pct(cuenta['error'] / total)})")
    if cuenta.get('ok', 0) >= 20 and completas == 0:
        out.append(f"composición: ningún fondo con todas sus posiciones (de {cuenta['ok']} descargados)")
    return out


def metricas(n: int, anterior: int) -> list[str]:
    if anterior and n < MIN_METRICAS * anterior:
        return [f'métricas: {n}, frente a {anterior} la vez anterior']
    return []
