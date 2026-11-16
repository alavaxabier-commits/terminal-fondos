"""Morningstar (no oficial).

- Fichas y búsqueda: el buscador público de Morningstar España (universo FOESP$$ALL, fondos registrados en España).
- Histórico de valor liquidativo: su servicio público de series (sin navegador). mstarpy 10 da 401 en su API de
  gráficos, así que ya no se usa.

Son endpoints no oficiales: si Morningstar cambia algo, falla aquí y la ingesta prueba con Yahoo.
"""
from __future__ import annotations

import datetime as dt
import re
import time

import requests

from ..validacion import Serie

SCREENER = 'https://lt.morningstar.com/api/rest.svc/klr5zyak8x/security/screener'
UNIVERSO = 'FOESP$$ALL'
CAMPOS_BASICOS = 'SecId|Name|Isin|CategoryName|PriceCurrency|OngoingCharge|InceptionDate'
CAMPOS_PATRIMONIO = CAMPOS_BASICOS + '|FundId|FundTNAV'  # FundTNAV: patrimonio del fondo, en su divisa
CAMPOS_MINIMA = CAMPOS_PATRIMONIO + '|InitialPurchase'    # inversión mínima de la clase, en su divisa
# Estadísticas de cartera que la ficha de detalle no trae (duración, calidad media, cajas de estilo)
CAMPOS = CAMPOS_MINIMA + '|EquityStyleBox|BondStyleBox|AverageMarketCapital|EffectiveDuration|EffectiveMaturity|AverageCreditQualityCode|IndexFund|SRRI'
DETALLE = SCREENER.rsplit('/security/', 1)[0] + '/security_details/'
# Posiciones completas: API de la web de Morningstar, con su clave pública (la misma que publica mstarpy 10)
POSICIONES = 'https://api-global.morningstar.com/sal-service/v1/fund/portfolio/holding/v2/{}/data'
# El buscador responde 401 a todo desde noviembre de 2026 (y el nuevo de global.morningstar.com tiene protección anti-bots):
# las fichas salen de la ficha de detalle y, de la API de la web, del resumen de cotización (quote/v7: patrimonio del
# fondo, categoría y gastos) y, en un alta, del resumen del fondo (parentSummary: FundId; sus cifras son de la gestora)
SAL = 'https://api-global.morningstar.com/sal-service/v1/fund/{}/{}/data'
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
        'gestion': {True: 'indexada', False: 'activa'}.get(fila.get('IndexFund')),
        'srri': srri if (srri := _entero(fila.get('SRRI'))) in range(1, 8) else None,
    }


def estadisticas_cartera(detalle) -> dict:
    """Ficha de detalle → cajas de estilo, duración, vencimiento y calidad media de la última cartera publicada (lo que
    antes traía el buscador). La capitalización media no: el X-Ray la da en otra divisa que el buscador."""
    d = detalle[0] if isinstance(detalle, list) and detalle else detalle
    p = next((x for x in (d or {}).get('Portfolios') or [] if x.get('EquityStatistics') or x.get('BondStatistics')), {}) \
        if isinstance(d, dict) else {}
    rv, rf = p.get('EquityStatistics') or {}, p.get('BondStatistics') or {}
    out = {'estilo_rv': _entero(rv.get('StyleBox')), 'estilo_rf': _entero(rf.get('StyleBox')),
           'duracion_efectiva': _num(rf.get('ModifiedDuration')), 'vencimiento_efectivo': _num(rf.get('EffectiveMaturity')),
           'calidad_media': rf.get('AverageCreditQualityCode') or None}
    for k in ('estilo_rv', 'estilo_rf'):
        if out[k] not in range(1, 10):
            out[k] = None
    return out


def leer_quote(q) -> dict:
    """Resumen de cotización de la API de la web → patrimonio del fondo (todas sus clases, millones de su divisa),
    categoría y gastos corrientes (los más recientes)."""
    q = q if isinstance(q, dict) else {}
    categoria = q.get('categoryName')
    if categoria:  # «EAA Fund Global Flexible Bond - EUR Hedged» → como en el buscador
        categoria = re.sub(r'^EAA (Fund|OE) ', '', categoria)
    tamano, ter = _num(q.get('fundSize')), _num(q.get('onGoingCharge'))
    return {'patrimonio_meur': round(tamano / 1e6, 2) if tamano else None, 'categoria': categoria or None,
            'ter': round(ter * 100, 4) if ter is not None else None}  # viene en tanto por uno


def ficha_detalle(detalle, quote: dict | None = None, resumen: dict | None = None) -> dict | None:
    """Ficha de detalle + resumen de cotización (+ resumen del fondo, para el FundId de un alta) → ficha como `ficha()`.
    Lo que no trae (si es indexado, capitalización media) va en None: al guardar se conserva lo que ya hubiera."""
    d = detalle[0] if isinstance(detalle, list) and detalle else detalle
    if not isinstance(d, dict) or not d.get('Id') or len(str(d.get('Isin') or '')) != 12:
        return None
    q = leer_quote(quote)
    compra = next((x for x in d.get('PurchaseDetails') or [] if (x.get('InitialInvestment') or {}).get('Unit') == 1), {})
    srri = _entero((d.get('CollectedSRRI') or {}).get('Rank'))
    return {
        'isin': str(d['Isin']).upper(), 'nombre': d.get('Name') or d['Isin'], 'ms_id': d['Id'],
        'fund_id': (resumen or {}).get('fundId'), 'patrimonio_meur': q['patrimonio_meur'], 'categoria': q['categoria'],
        'divisa': ((d.get('Currency') or {}).get('Id') or '').upper()[:3] or None,
        'ter': q['ter'] if q['ter'] is not None else _num(d.get('OngoingCharge')),
        'fecha_lanzamiento': _fecha(d.get('InceptionDate')),
        'inversion_minima': _num((compra.get('InitialInvestment') or {}).get('Value')),
        'capitalizacion_media': None, 'gestion': None, 'srri': srri if srri in range(1, 8) else None,
        **estadisticas_cartera(d),
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


def leer_gestion(datos) -> dict:
    """Ficha de detalle → {'gestora': marca de la gestora, 'gestores': [{nombre, desde}] por nombre, o None}."""
    d = datos[0] if isinstance(datos, list) and datos else datos
    if not isinstance(d, dict):
        return {'gestora': None, 'gestores': None}
    gestores = []
    for g in d.get('ManagerList') or []:
        nombre = ' '.join(x.strip() for x in (g.get('GivenName'), g.get('FamilyName')) if x and x.strip())
        if nombre:
            desde = _fecha(g.get('StartDate'))
            gestores.append({'nombre': nombre, 'desde': desde.isoformat() if desde else None})
    gestora = d.get('BrandingCompanyName') or (d.get('ProviderCompany') or {}).get('Name')
    return {'gestora': gestora or None, 'gestores': sorted(gestores, key=lambda g: g['nombre']) or None}


def cambio_gestores(antes: list[dict] | None, ahora: list[dict] | None) -> tuple[list[str], list[str]] | None:
    """(entran, salen) por nombre si el equipo ha cambiado; None si no hay cambio o falta uno de los dos (el primer
    equipo que se guarda no es un cambio, y una ficha sin equipo no dice que se hayan ido todos)."""
    if not antes or not ahora:
        return None
    a, b = {g['nombre'] for g in antes}, {g['nombre'] for g in ahora}
    return (sorted(b - a), sorted(a - b)) if a != b else None


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


class Bloqueo(BaseException):
    """Morningstar rechaza peticiones seguidas (429 o 403): se para la tarea en lugar de insistir.
    Hereda de BaseException para que no lo absorban los `except Exception` que pasan a Yahoo o FT."""


class Sesion(requests.Session):
    """Peticiones con un intervalo mínimo entre una y otra (cuenta desde que empezó la anterior, así que no se
    espera de más si la respuesta ya ha tardado) y un freno: tras un 429 o 403 se espera cada vez más y al
    tercero seguido se para."""

    def __init__(self, intervalo: float = 1.5, espera: float = 30, max_rechazos: int = 3):
        super().__init__()
        self.intervalo, self.espera, self.max_rechazos = intervalo, espera, max_rechazos
        self.ultima, self.rechazos = 0.0, 0

    def request(self, *args, **kwargs):
        time.sleep(max(0.0, self.ultima + self.intervalo - time.monotonic()))
        self.ultima = time.monotonic()
        r = super().request(*args, **kwargs)
        if r.status_code not in (403, 429):
            self.rechazos = 0
            return r
        self.rechazos += 1
        if self.rechazos >= self.max_rechazos:
            raise Bloqueo(f'Morningstar responde {r.status_code} {self.rechazos} veces seguidas ({r.url.split("?")[0]}): se para la tarea')
        time.sleep(self.espera * self.rechazos)
        return r


class Morningstar:
    nombre = 'morningstar'

    def __init__(self):
        self.http = Sesion()
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
        """Ficha de un fondo por ISIN. El buscador responde 401 a todo desde noviembre de 2026: ficha de detalle por
        ISIN, resumen de cotización y resumen del fondo (tres peticiones)."""
        isin = isin.strip().upper()
        r = self.http.get(DETALLE + isin, params={'viewId': 'MFsnapshot', 'idtype': 'isin', 'responseViewFormat': 'json',
                                                  'languageId': 'es-ES', 'currencyId': 'EUR'}, timeout=60)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        d = r.json()
        d0 = d[0] if isinstance(d, list) and d else d
        if not isinstance(d0, dict) or not d0.get('Id'):
            return None
        return ficha_detalle(d, self._sal('quote/v7', d0['Id']), self._sal('parent/parentSummary', d0['Id']))

    def _sal(self, ruta: str, ms_id: str) -> dict:
        """Una respuesta de la API de la web de Morningstar ({} si falla)."""
        try:
            x = self.http.get(SAL.format(ruta, ms_id), headers={'apikey': CLAVE_WEB}, timeout=60,
                              params={'clientId': 'MDC', 'version': '4.71.0', 'languageId': 'es', 'locale': 'es'})
            return x.json() if x.ok and isinstance(x.json(), dict) else {}
        except (requests.RequestException, ValueError):
            return {}

    def composicion(self, ms_id: str) -> tuple[dt.date | None, dict, dict, dict | None]:
        """Desglose de la cartera de un fondo, gestora y equipo gestor y su ficha al día (lo que daba el buscador): ficha
        de detalle, posiciones completas y resumen de cotización (tres peticiones)."""
        r = self.http.get(DETALLE + ms_id, params={'viewId': 'MFsnapshot', 'idtype': 'msid', 'responseViewFormat': 'json',
                                                   'languageId': 'es-ES', 'currencyId': 'EUR'}, timeout=60)
        r.raise_for_status()
        fecha, datos = leer_composicion(r.json())
        gestion = leer_gestion(r.json())
        ficha_ = ficha_detalle(r.json(), self._sal('quote/v7', ms_id))
        if datos:  # todas las posiciones, en lugar de las 10 mayores; si falla, se quedan las 10
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
        return fecha, datos, gestion, ficha_

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
