"""Morningstar (no oficial).

- Fichas y búsqueda: el buscador público de Morningstar España (universo FOESP$$ALL, fondos registrados en España).
- Histórico de valor liquidativo: mstarpy (abre Chrome con Selenium; en GitHub Actions va con xvfb-run).

Ambos son endpoints no oficiales: si Morningstar cambia algo, falla aquí y la ingesta prueba con Yahoo.
"""
from __future__ import annotations

import datetime as dt
import time

import requests

from ..validacion import Serie

SCREENER = 'https://lt.morningstar.com/api/rest.svc/klr5zyak8x/security/screener'
UNIVERSO = 'FOESP$$ALL'
CAMPOS = 'SecId|Name|Isin|CategoryName|PriceCurrency|OngoingCharge|InceptionDate'


def _num(x):
    try:
        return float(str(x).replace(',', '.'))
    except (TypeError, ValueError):
        return None


def _fecha(x):
    try:
        return dt.date.fromisoformat(str(x)[:10])
    except (TypeError, ValueError):
        return None


def ficha(fila: dict) -> dict | None:
    """Fila del buscador → ficha del fondo con los nombres de la tabla fondos.fondo."""
    isin = str(fila.get('Isin') or '').strip().upper()
    if len(isin) != 12:
        return None
    divisa = str(fila.get('PriceCurrency') or '').strip().upper()[:3] or None
    return {
        'isin': isin,
        'nombre': fila.get('Name') or isin,
        'ms_id': fila.get('SecId'),
        'categoria': fila.get('CategoryName'),
        'divisa': divisa,
        'ter': _num(fila.get('OngoingCharge')),
        'fecha_lanzamiento': _fecha(fila.get('InceptionDate')),
    }


def leer_nav(filas) -> Serie:
    """Respuesta de mstarpy Funds.nav() → {fecha: valor}. Ignora filas sin fecha o sin valor."""
    out: Serie = {}
    for x in filas or []:
        if not isinstance(x, dict):
            continue
        f, v = _fecha(x.get('date')), _num(x.get('nav'))
        if f and v and v > 0:
            out[f] = round(v, 6)
    return out


class Morningstar:
    nombre = 'morningstar'

    def __init__(self, pausa: float = 1.0):
        self.pausa = pausa
        self.http = requests.Session()

    def _buscador(self, **params) -> dict:
        r = self.http.get(SCREENER, params={'outputType': 'json', 'universeIds': UNIVERSO,
                                            'securityDataPoints': CAMPOS, **params}, timeout=60)
        r.raise_for_status()
        return r.json()

    def buscar(self, isin: str) -> dict | None:
        isin = isin.strip().upper()
        for fila in self._buscador(term=isin).get('rows') or []:
            if str(fila.get('Isin', '')).upper() == isin:
                return ficha(fila)
        return None

    def universo(self, tam: int = 500, limite: int | None = None):
        """Todas las fichas del universo, página a página."""
        pagina, n = 1, 0
        while True:
            filas = self._buscador(page=pagina, pageSize=tam, sortOrder='Name asc').get('rows') or []
            for fila in filas:
                f = ficha(fila)
                if f:
                    yield f
                    n += 1
                    if limite and n >= limite:
                        return
            if len(filas) < tam:
                return
            pagina += 1
            time.sleep(self.pausa)

    def _fondo(self, isin: str, ms_id: str | None):
        import mstarpy as ms  # solo aquí: los tests y el resto no lo necesitan
        import mstarpy.security as sec
        try:
            return ms.Funds(isin)
        except Exception:  # noqa: BLE001 — su buscador no tiene todos los fondos
            if not ms_id:
                encontrado = self.buscar(isin)
                ms_id = encontrado and encontrado['ms_id']
            if not ms_id:
                raise
            # Mismo atajo que en el repo Finanzas (mstarpy 10): el objeto sin pasar por su buscador.
            f = object.__new__(ms.Funds)
            f.code, f.name, f.language, f.proxies, f.asset_type = ms_id, isin, 'en-gb', None, 'fund'
            f.session = sec.MorningstarSession()
            return f

    def historico(self, isin: str, ms_id: str | None, desde: dt.date, hasta: dt.date) -> Serie:
        f = self._fondo(isin, ms_id)
        return leer_nav(f.nav(start_date=desde, end_date=hasta, frequency='daily'))
