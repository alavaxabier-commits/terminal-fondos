"""Banco Central Europeo (API oficial y gratuita): tipos de cambio de referencia y €STR."""
from __future__ import annotations

import csv
import datetime as dt
import io

import requests

URL = 'https://data-api.ecb.europa.eu/service/data/{flujo}/{clave}'


def leer_csv(texto: str) -> dict[dt.date, float]:
    out = {}
    for fila in csv.DictReader(io.StringIO(texto)):
        try:
            out[dt.date.fromisoformat(fila['TIME_PERIOD'][:10])] = float(fila['OBS_VALUE'])
        except (KeyError, TypeError, ValueError):
            continue
    return out


class BCE:
    nombre = 'bce'

    def serie(self, flujo: str, clave: str, desde: dt.date) -> dict[dt.date, float]:
        r = requests.get(URL.format(flujo=flujo, clave=clave),
                         params={'format': 'csvdata', 'detail': 'dataonly', 'startPeriod': desde.isoformat()}, timeout=60)
        if r.status_code == 404:  # sin datos desde esa fecha
            return {}
        r.raise_for_status()
        return leer_csv(r.text)

    def tipo_cambio(self, divisa: str, desde: dt.date) -> dict[dt.date, float]:
        """Unidades de la divisa por 1 EUR."""
        return self.serie('EXR', f'D.{divisa}.EUR.SP00.A', desde)

    def estr(self, desde: dt.date) -> dict[dt.date, float]:
        return self.serie('EST', 'B.EU000A2X2A25.WT', desde)
