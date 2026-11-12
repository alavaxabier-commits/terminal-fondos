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
CAMPOS_PATRIMONIO = CAMPOS_BASICOS + '|FundId|FundTNAV'  # FundTNAV: patrimonio del fondo, en su divisa
CAMPOS_MINIMA = CAMPOS_PATRIMONIO + '|InitialPurchase'    # inversión mínima de la clase, en su divisa
# Estadísticas de cartera que la ficha de detalle no trae (duración, calidad media, cajas de estilo)
CAMPOS = CAMPOS_MINIMA + '|EquityStyleBox|BondStyleBox|AverageMarketCapital|EffectiveDuration|EffectiveMaturity|AverageCreditQualityCode'
DETALLE = SCREENER.rsplit('/security/', 1)[0] + '/security_details/'
# Posiciones completas: API de la web de Morningstar, con su clave pública (la misma que publica mstarpy 10)
POSICIONES = 'https://api-global.morningstar.com/sal-service/v1/fund/portfolio/holding/v2/{}/data'
CLAVE_WEB = "lstzFDEOhfFNMLikKa0am9mgEKLBl49T"

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
        'inversion_minima': _num(fila.get('InitialPurchase')),
        'estilo_rv': _entero(fila.get('EquityStyleBox')),
        'estilo_rf': _entero(fila.get('BondStyleBox')),
        'capitalizacion_media': _num(fila.get('AverageMarketCapital')),
        'duracion_efectiva': _num(fila.get('EffectiveDuration')),
        'vencimiento_efectivo': _num(fila.get('EffectiveMaturity')),
        'calidad_media': fila.get('AverageCreditQualityCode') or None,
    }


def _entero(x):
    v = _num(x)
    return int(v) if v is not None else None


# Desgloses de la ficha de detalle que forman el X-Ray: nombre nuestro → (bloque de Morningstar, su «Type» o None)
BLOQUES = {
    'regiones': ('RegionalExposure', None),
    'paises_rv': ('CountryExposure', 'Equity'),
    'paises_rf': ('CountryExposure', 'Bond'),
    'sectores_rv': ('GlobalStockSectorBreakdown', None),
    'estilo_rv': ('StyleBoxBreakdown', None),
    'estilo_rf': ('BondStyleBoxBreakdown', None),
    'capitalizacion': ('MarketCapitalBreakdown', None),
    'sectores_rf': ('GlobalBondSectorBreakdownLevel1', None),
    'calidad_rf': ('CreditQualityBreakdown', None),
    'vencimientos': ('MaturityRange', None),
    'cupones': ('CouponRange', None),
}
POSICION = {'nombre': 'SecurityName', 'isin': 'ISIN', 'peso': 'Weighting', 'tipo': 'DetailHoldingTypeId',
            'sector': 'GlobalSectorId', 'pais': 'CountryId'}
PAGINAS = ('equityHoldingPage', 'boldHoldingPage', 'otherHoldingPage')  # acciones, bonos, otros


def leer_posiciones(datos) -> list[dict] | None:
    """Respuesta de posiciones → [{nombre, isin, peso, tipo, sector, pais}] de mayor a menor peso; None si no trae páginas.
    Sector y país vienen con nombre (no con código, como en la ficha de detalle); las cortas, con peso negativo."""
    if not isinstance(datos, dict) or not any(isinstance(datos.get(p), dict) for p in PAGINAS):
        return None
    out = []
    for pag in PAGINAS:
        for h in (datos.get(pag) or {}).get('holdingList') or []:
            peso = _num(h.get('weighting'))
            if not peso or not h.get('securityName'):
                continue
            x = {'nombre': h['securityName'].strip(), 'isin': h.get('isin'), 'peso': round(peso, 4), 'tipo': h.get('holdingTypeId'),
                 'sector': h.get('sector') or h.get('primarySectorName'), 'pais': h.get('country')}
            out.append({k: v for k, v in x.items() if v is not None})
    return sorted(out, key=lambda x: -x['peso'])


def _desglose(lista, lado: str = 'N', tipo: str | None = None) -> dict | None:
    """Primer desglose del lado pedido (N neto, L largo, S corto) → {código: %} sin los ceros; «nc» = sin clasificar."""
    for x in lista or []:
        if x.get('SalePosition') == lado and x.get('Type') == tipo and x.get('BreakdownValues'):
            out = {str(b['Type']): round(b['Value'], 4) for b in x['BreakdownValues'] if _num(b.get('Value'))}
            if _num(x.get('NotClassified')):
                out['nc'] = round(x['NotClassified'], 4)
            return out
    return None


def completas(posiciones: list, n: dict | None) -> bool:
    """¿Están todas? Algunos fondos solo dejan publicar unas pocas (Jupiter: 10 de 2.428); el 80 % deja margen a las
    líneas sin peso que se descartan."""
    total = (n or {}).get('total')
    return not total or len(posiciones) >= 0.8 * total


def leer_composicion(datos) -> tuple[dt.date | None, dict]:
    """Ficha de detalle → (fecha de la cartera, desgloses del X-Ray). Sin desglose publicado: (None, {})."""
    d = datos[0] if isinstance(datos, list) and datos else datos
    carteras = [p for p in (d or {}).get('Portfolios') or [] if p.get('AssetAllocations')]
    if not carteras:
        return None, {}
    p = carteras[0]
    out: dict = {'activos': {k: v for k, lado in (('neto', 'N'), ('largo', 'L'), ('corto', 'S'))
                             if (v := _desglose(p['AssetAllocations'], lado, 'MorningStarDefault'))}}
    for nombre, (bloque, tipo) in BLOQUES.items():
        if v := _desglose(p.get(bloque), 'N', tipo):
            out[nombre] = v
    if p.get('EquityStatistics'):
        out['estadisticas_rv'] = p['EquityStatistics']
    if p.get('BondStatistics'):  # TIR, cupón y precio medios, duración modificada, vencimiento efectivo…
        out['estadisticas_rf'] = p['BondStatistics']
    n = {(x.get('HoldingsType') or 'total'): x.get('NumberOfHolding')
         for x in p.get('HoldingAggregates') or [] if x.get('SalePosition') == 'N'}
    if n:
        out['n_posiciones'] = n
    out['posiciones'] = [{k: h.get(m) for k, m in POSICION.items() if h.get(m) is not None}
                         for h in p.get('PortfolioHoldings') or []]
    return _fecha(p.get('Date')), out


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
        # Si Morningstar deja de aceptar algún campo extra, se prueba con menos hasta los básicos
        for campos in (CAMPOS, CAMPOS_MINIMA, CAMPOS_PATRIMONIO):
            try:
                return pedir(campos)
            except requests.HTTPError:
                continue
        return pedir(CAMPOS_BASICOS)

    def buscar(self, isin: str) -> dict | None:
        isin = isin.strip().upper()
        for fila in self._buscador(term=isin).get('rows') or []:
            if str(fila.get('Isin', '')).upper() == isin:
                return ficha(fila)
        return None

    def composicion(self, ms_id: str) -> tuple[dt.date | None, dict]:
        """Desglose de la cartera de un fondo: ficha de detalle y posiciones completas (dos peticiones con pausa)."""
        r = self.http.get(DETALLE + ms_id, params={'viewId': 'MFsnapshot', 'idtype': 'msid', 'responseViewFormat': 'json',
                                                   'languageId': 'es-ES', 'currencyId': 'EUR'}, timeout=60)
        r.raise_for_status()
        fecha, datos = leer_composicion(r.json())
        if datos:  # todas las posiciones, en lugar de las 10 mayores; si falla, se quedan las 10
            time.sleep(self.pausa)
            try:
                p = self.http.get(POSICIONES.format(ms_id), headers={'apikey': CLAVE_WEB}, timeout=120,
                                  params={'clientId': 'MDC', 'version': '4.71.0', 'premiumNum': 10000, 'freeNum': 10000})
                p.raise_for_status()
                if todas := leer_posiciones(p.json()):
                    datos['posiciones'] = todas
                    if completas(todas, datos.get('n_posiciones')):
                        datos['posiciones_todas'] = True
            except (requests.RequestException, ValueError):
                pass
        return fecha, datos

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
