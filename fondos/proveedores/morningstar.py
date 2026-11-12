"""Morningstar (no oficial).

- Fichas y búsqueda: el buscador público de Morningstar España (universo FOESP$$ALL, fondos registrados en España).
- Histórico de valor liquidativo: su servicio público de series (sin navegador). mstarpy 10 da 401 en su API de
  gráficos, así que ya no se usa.

Son endpoints no oficiales: si Morningstar cambia algo, falla aquí y la ingesta prueba con Yahoo.
"""
from __future__ import annotations

import datetime as dt
import time

import requests

from ..validacion import Serie

SCREENER = 'https://lt.morningstar.com/api/rest.svc/klr5zyak8x/security/screener'
UNIVERSO = 'FOESP$$ALL'
CAMPOS_BASICOS = 'SecId|Name|Isin|CategoryName|PriceCurrency|OngoingCharge|InceptionDate'
CAMPOS = CAMPOS_BASICOS + '|FundId|FundTNAV'  # FundTNAV: patrimonio del fondo, en su divisa

# Servicio de series de precios: se prueban en orden hasta que uno responda con datos.
SERIES = [
    'https://lt.morningstar.com/api/rest.svc/timeseries_price/klr5zyak8x',
    'https://tools.morningstar.es/api/rest.svc/timeseries_price/2nhcdckzon',
]
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'


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
    patrimonio = _num(fila.get('FundTNAV'))
    return {
        'isin': isin,
        'nombre': fila.get('Name') or isin,
        'ms_id': fila.get('SecId'),
        'fund_id': fila.get('FundId'),
        'patrimonio_meur': round(patrimonio / 1e6, 2) if patrimonio else None,
        'categoria': fila.get('CategoryName'),
        'divisa': divisa,
        'ter': _num(fila.get('OngoingCharge')),
        'fecha_lanzamiento': _fecha(fila.get('InceptionDate')),
    }


def leer_serie(datos) -> Serie:
    """Respuesta del servicio de series → {fecha: valor}.

    Acepta los dos formatos que usa: COMPACTJSON ([[milisegundos, valor], …]) y JSON
    ({"TimeSeries": {"Security": [{"HistoryDetail": [{"EndDate": …, "Value": …}, …]}]}}).
    """
    out: Serie = {}
    if isinstance(datos, list):
        for x in datos:
            if isinstance(x, (list, tuple)) and len(x) >= 2:
                v = _num(x[1])
                try:
                    f = dt.datetime.fromtimestamp(float(x[0]) / 1000, dt.timezone.utc).date()
                except (TypeError, ValueError, OverflowError):
                    continue
                if v and v > 0:
                    out[f] = round(v, 6)
        return out
    if isinstance(datos, dict):
        seguridades = ((datos.get('TimeSeries') or {}).get('Security')) or []
        for s in seguridades:
            for x in s.get('HistoryDetail') or []:
                f, v = _fecha(x.get('EndDate')), _num(x.get('Value'))
                if f and v and v > 0:
                    out[f] = round(v, 6)
    return out


class Morningstar:
    nombre = 'morningstar'

    def __init__(self, pausa: float = 1.0):
        self.pausa = pausa
        self.http = requests.Session()
        self.http.headers['User-Agent'] = UA

    def _buscador(self, **params) -> dict:
        def pedir(campos):
            r = self.http.get(SCREENER, params={'outputType': 'json', 'universeIds': UNIVERSO,
                                                'securityDataPoints': campos, **params}, timeout=60)
            r.raise_for_status()
            return r.json()
        try:
            return pedir(CAMPOS)
        except requests.HTTPError:  # si algún campo extra deja de existir, al menos los básicos
            return pedir(CAMPOS_BASICOS)

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

    def historico(self, isin: str, ms_id: str | None, desde: dt.date, hasta: dt.date, divisa: str | None = None) -> Serie:
        if not ms_id:
            encontrado = self.buscar(isin)
            ms_id = encontrado and encontrado['ms_id']
        if not ms_id:
            raise LookupError('sin SecId de Morningstar')
        errores = []
        for url in SERIES:
            try:
                r = self.http.get(url, params={'id': f'{ms_id}]2]0]{UNIVERSO}', 'idtype': 'Morningstar',
                                               'currencyId': divisa or 'EUR', 'frequency': 'daily',
                                               'startDate': desde.isoformat(), 'endDate': hasta.isoformat(),
                                               'outputType': 'COMPACTJSON'}, timeout=30)
                if r.status_code != 200:
                    errores.append(f'{r.status_code} en {url.split("/")[2]}')
                    continue
                serie = leer_serie(r.json())
                if serie:
                    return serie
                errores.append(f'vacío en {url.split("/")[2]}')
            except (requests.RequestException, ValueError) as e:
                errores.append(f'{type(e).__name__} en {url.split("/")[2]}')
        raise RuntimeError('; '.join(errores))
