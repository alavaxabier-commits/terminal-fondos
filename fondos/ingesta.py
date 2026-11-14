"""Descarga diaria: qué fondos tocan hoy, de dónde se trae cada serie y cómo se guarda.

Reglas (especificación, secciones 3 y 4):
- Se guardan todos los días de todos los fondos (en paquetes anuales, ver migración 0014).
- Los fondos de mis carteras modelo, los que vigilo y los sustitutos de índices se actualizan cada día; el resto del
  universo, una vez por semana (trae los días de esa semana de una vez).
- 10 años de histórico. La carga inicial va en tandas (por defecto 300 fondos por ejecución), los diarios primero.
- Morningstar primero; si falla, Yahoo con un ticker verificado (contra lo guardado o contra el FT);
  para actualizar, el FT como último recurso.
- Cada fondo deja una línea en registro_descarga: ok, aviso (huecos o saltos) o error.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

from .validacion import Serie, avisos, hace_anos, lunes, ultimo_habil_anterior

ANOS = 10
TANDA = 2000           # cargas iniciales por ejecución (~1,5 s por fondo: unos 50 minutos)
MIN_DIARIOS_ANYO = 150   # un fondo diario con menos valores en el último año solo tiene la serie semanal: se recarga


@dataclass
class FondoIngesta:
    isin: str
    nombre: str
    ms_id: str | None
    yahoo_ticker: str | None
    divisa: str | None
    diaria: bool
    ultima: dt.date | None
    n_ultimo_anyo: int = 0
    historico_diario: bool = True  # ya tiene los 10 años con todos los días (si no, se recarga una vez)


def accion(f: FondoIngesta, hoy: dt.date) -> str | None:
    """'carga' (todo el histórico), 'actualizar' (desde el último dato) o None (está al día)."""
    if f.ultima is None:
        return 'carga'
    if not f.diaria and not f.historico_diario:
        return 'carga'   # serie semanal antigua: se recarga una vez con todos los días
    if f.diaria:
        if f.n_ultimo_anyo < MIN_DIARIOS_ANYO:
            return 'carga'
        return 'actualizar' if f.ultima < ultimo_habil_anterior(hoy) else None
    # resto del universo: una vez por semana, en las dos primeras ejecuciones (martes y miércoles),
    # si le falta el cierre del viernes anterior (así no se queda con el del lunes ni salta una semana)
    return 'actualizar' if hoy.weekday() in (1, 2) and f.ultima < lunes(hoy) - dt.timedelta(days=3) else None


def planificar(fondos: list[FondoIngesta], hoy: dt.date, tanda: int = TANDA) -> list[tuple[FondoIngesta, str]]:
    """Qué hacer hoy y en qué orden: diarios primero; las cargas iniciales, como mucho `tanda`."""
    tareas = [(f, a) for f in fondos if (a := accion(f, hoy))]
    tareas.sort(key=lambda t: (not t[0].diaria, t[1] != 'actualizar', t[0].isin))
    out, cargas = [], 0
    for f, a in tareas:
        if a == 'carga':
            if cargas >= tanda:
                continue
            cargas += 1
        out.append((f, a))
    return out


def descargar_fondo(f: FondoIngesta, que: str, hoy: dt.date, repo, ms, yh, ft) -> str:
    """Trae, valida y guarda la serie de un fondo. Devuelve 'ok', 'aviso' o 'error'.

    Orden: Morningstar → Yahoo (ticker verificado contra lo guardado o, si aún no hay nada, contra el FT)
    → FT (solo para actualizar: da unas semanas, no 10 años).
    """
    desde = hace_anos(hoy, ANOS) if que == 'carga' else f.ultima - dt.timedelta(days=7)
    serie: Serie = {}
    fuente, errores = None, []

    try:
        serie = ms.historico(f.isin, f.ms_id, desde, hoy, f.divisa)
        fuente = 'morningstar'
    except Exception as e:  # noqa: BLE001 — endpoint no oficial
        errores.append(f'Morningstar: {str(e)[:200]}')

    referencia_ft: Serie | None = None

    def ref_ft() -> Serie:
        nonlocal referencia_ft
        if referencia_ft is None:
            try:
                referencia_ft = ft.historico(f.isin, f.divisa)
            except Exception as e:  # noqa: BLE001
                referencia_ft = {}
                errores.append(f'FT: {str(e)[:120]}')
        return referencia_ft

    if not serie:
        ticker = f.yahoo_ticker
        if not ticker:
            referencia = repo.valores(f.isin, hoy - dt.timedelta(days=120))
            if len(referencia) < 5:
                referencia = ref_ft()
            ticker = yh.buscar_verificado(f.isin, f.nombre, referencia, hoy)
            if ticker:
                repo.guardar_ticker(f.isin, ticker)
            else:
                errores.append('Yahoo: sin ticker verificado' + ('' if referencia else ' (sin referencia)'))
        if ticker:
            try:
                serie = yh.historico(ticker, desde, hoy)
                fuente = 'yahoo'
                if not serie:
                    errores.append(f'Yahoo {ticker}: sin datos')
            except Exception as e:  # noqa: BLE001
                errores.append(f'Yahoo {ticker}: {str(e)[:200]}')

    if not serie and que == 'actualizar':
        serie = {d: v for d, v in ref_ft().items() if d >= desde}
        fuente = 'ft'

    if not serie:
        repo.registrar('ingesta', f.isin, 'error', '; '.join(errores))
        return 'error'

    repo.guardar_valores(f.isin, serie, f.divisa or 'EUR', fuente)
    if que == 'carga' and not f.historico_diario:
        repo.marcar_historico_diario(f.isin)
    av = avisos(serie)
    detalle = f'{que}: {len(serie)} valores {min(serie)}…{max(serie)}'
    if errores:
        detalle += ' · ' + '; '.join(errores)
    if av:
        detalle += ' · ' + '; '.join(av[:5]) + (f' (+{len(av) - 5})' if len(av) > 5 else '')
    estado = 'aviso' if av else 'ok'
    repo.registrar(fuente, f.isin, estado, detalle)
    return estado


def precios(repo, ms, yh, ft, hoy: dt.date, tanda: int = TANDA, log=print) -> dict[str, int]:
    plan = planificar(repo.fondos_para_ingesta(), hoy, tanda)
    log(f'{len(plan)} fondos que actualizar hoy')
    cuenta = {'ok': 0, 'aviso': 0, 'error': 0}
    for i, (f, que) in enumerate(plan, 1):
        estado = descargar_fondo(f, que, hoy, repo, ms, yh, ft)
        cuenta[estado] += 1
        log(f'[{i}/{len(plan)}] {f.isin} {f.nombre[:50]} · {que} · {estado}')  # el ritmo lo pone la sesión de Morningstar
    return cuenta


def macro(repo, bce, hoy: dt.date, log=print) -> None:
    """Tipos de cambio de las divisas en uso y €STR, desde el último dato guardado (o 10 años)."""
    inicio = hace_anos(hoy, ANOS)
    for divisa in repo.divisas():
        ultima = repo.ultima_fecha_tipo(divisa)
        try:
            serie = bce.tipo_cambio(divisa, ultima or inicio)
            repo.guardar_tipos(divisa, serie)
            log(f'BCE {divisa}: {len(serie)} días')
        except Exception as e:  # noqa: BLE001
            repo.registrar('bce', None, 'error', f'{divisa}: {str(e)[:200]}')
    ultima = repo.ultima_fecha_estr()
    try:
        serie = bce.estr(ultima or inicio)
        repo.guardar_estr(serie)
        log(f'BCE €STR: {len(serie)} días')
    except Exception as e:  # noqa: BLE001
        repo.registrar('bce', None, 'error', f'€STR: {str(e)[:200]}')
