"""Financial Times: cierres del último mes de la ficha pública de cada fondo.

No sirve para el histórico (solo da unas semanas), pero sí como referencia para verificar un ticker de Yahoo
y como último recurso para las actualizaciones diarias. Mismo método que el repo Finanzas.
"""
from __future__ import annotations

import datetime as dt
import html
import re

import requests

from ..validacion import Serie

URL = 'https://markets.ft.com/data/funds/tearsheet/historical'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
FILA = re.compile(r'[A-Z][a-z]+day, ([A-Z][a-z]+ \d{1,2}, \d{4})[^0-9]*[A-Z][a-z]{2} \d{1,2}, \d{4}'
                  r'\s+([0-9.,]+)\s+([0-9.,]+)\s+([0-9.,]+)\s+([0-9.,]+)')


def texto(h: str) -> str:
    h = re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>', ' ', h, flags=re.I)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', h))).replace('\xa0', ' ')


def leer_tabla(t: str) -> Serie:
    """Texto de la página → {fecha: cierre}. Columnas: fecha, apertura, máximo, mínimo, cierre."""
    out: Serie = {}
    for m in FILA.finditer(t):
        try:
            out[dt.datetime.strptime(m.group(1), '%B %d, %Y').date()] = float(m.group(5).replace(',', ''))
        except ValueError:
            continue
    return out


class FT:
    nombre = 'ft'

    def historico(self, isin: str, divisa: str | None) -> Serie:
        r = requests.get(URL, params={'s': f'{isin}:{divisa or "EUR"}'},
                         headers={'User-Agent': UA, 'Accept-Language': 'en'}, timeout=25)
        r.raise_for_status()
        return leer_tabla(texto(r.text))
