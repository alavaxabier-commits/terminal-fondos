"""Yahoo Finance con yfinance: respaldo cuando Morningstar falla.

Un ticker solo se acepta si sus precios cuadran (±0,1 %) con valores ya guardados de Morningstar en al menos
5 días comunes: así no se cuela otra clase del fondo ni su cotización en bolsa.
"""
from __future__ import annotations

import datetime as dt
import time

from ..validacion import Serie

TOLERANCIA = 0.001
DIAS_COMUNES_MIN = 5


def coincide(precios: Serie, referencia: Serie) -> tuple[float | None, int]:
    """Diferencia relativa máxima en los días comunes y cuántos días comunes hay."""
    comunes = [d for d in precios if d in referencia]
    if not comunes:
        return None, 0
    return max(abs(precios[d] / referencia[d] - 1) for d in comunes), len(comunes)


def elegir_ticker(candidatos: dict[str, Serie], referencia: Serie) -> str | None:
    """El candidato que cuadra con la referencia y más días comparte con ella."""
    mejor = None
    for ticker, precios in candidatos.items():
        dif, n = coincide(precios, referencia)
        if dif is not None and dif <= TOLERANCIA and n >= DIAS_COMUNES_MIN and (mejor is None or n > mejor[1]):
            mejor = (ticker, n)
    return mejor[0] if mejor else None


class Yahoo:
    nombre = 'yahoo'

    def __init__(self, pausa: float = 1.0):
        self.pausa = pausa

    def historico(self, ticker: str, desde: dt.date, hasta: dt.date) -> Serie:
        import yfinance as yf
        h = yf.Ticker(ticker).history(start=desde.isoformat(), end=(hasta + dt.timedelta(days=1)).isoformat(),
                                      interval='1d', auto_adjust=False)
        if h is None or h.empty:
            return {}
        return {d.date(): round(float(v), 6) for d, v in h['Close'].items() if v == v and v > 0}

    def candidatos(self, isin: str, nombre: str | None) -> list[str]:
        import yfinance as yf
        out: list[str] = []
        for q in (isin, nombre):
            if not q:
                continue
            try:
                for x in yf.Search(q, max_results=15).quotes:
                    if x.get('quoteType') in ('MUTUALFUND', 'ETF') and x.get('symbol') not in out:
                        out.append(x['symbol'])
            except Exception:  # noqa: BLE001
                pass
            time.sleep(self.pausa)
        return out

    def buscar_verificado(self, isin: str, nombre: str | None, referencia: Serie, hoy: dt.date) -> str | None:
        if len(referencia) < DIAS_COMUNES_MIN:
            return None
        precios = {}
        for t in self.candidatos(isin, nombre)[:10]:
            try:
                precios[t] = self.historico(t, hoy - dt.timedelta(days=120), hoy)
            except Exception:  # noqa: BLE001
                continue
            time.sleep(self.pausa)
        return elegir_ticker(precios, referencia)
