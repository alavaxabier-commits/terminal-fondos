"""MyInvestor: catálogo de su buscador público de fondos (https://myinvestor.es/inversion/fondos-inversion/buscador/).

La página pide el catálogo a su API con un token fijo que va escrito en su JavaScript; se lee de ahí en cada descarga
para que siga funcionando si lo cambian. Una petición a la página, las de sus scripts hasta dar con el token y una a la
API. No es una API documentada: si cambia, falla aquí y la vigilancia lo avisa.
"""
from __future__ import annotations

import re

import requests

BUSCADOR = 'https://myinvestor.es/inversion/fondos-inversion/buscador/'
API = 'https://api.myinvestor.es/cperf-server/rest/public/fondos/find-fondos'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'


def token(js: str) -> str | None:
    """El token que el JavaScript de la página manda a find-fondos, o None si no está en este script."""
    if 'find-fondos' not in js:
        return None
    m = re.search(r'token\s*:\s*"([0-9a-zA-Z_]{20,})"', js)
    return m and m.group(1)


def filas(catalogo: list[dict]) -> list[dict]:
    """Los fondos del catálogo (sin planes de pensiones), con lo que se guarda."""
    return [{'isin': f['codigoIsin'], 'nombre': f['nombre'], 'gestora': f.get('entidadGestora'), 'ter': f.get('ter'),
             'minimo': f.get('impMinPrimeraSubs'), 'sin_retrocesion': f.get('sinRetrocesion'),
             'abierto': f.get('status') == 'OPEN'}
            for f in catalogo if f.get('tipoProductoEnum') != 'PENSIONES' and not f.get('descatalogado')]


class MyInvestor:
    def __init__(self):
        self.s = requests.Session()
        self.s.headers['User-Agent'] = UA

    def _token(self) -> str:
        html = self.s.get(BUSCADOR, timeout=30)
        html.raise_for_status()
        for ruta in dict.fromkeys(re.findall(r'src="(/_next/static/chunks/[^"]+\.js)"', html.text)):
            t = token(self.s.get('https://myinvestor.es' + ruta, timeout=30).text)
            if t:
                return t
        raise RuntimeError('no se encuentra el token de find-fondos en los scripts del buscador')

    def catalogo(self) -> list[dict]:
        r = self.s.get(API, params={'tipo': 'TODOS', 'token': self._token()}, timeout=60)
        r.raise_for_status()
        return filas(r.json())
