"""Prueba temporal: TIR, cupón, duración modificada y posiciones completas con pocas peticiones. No toca la base."""
import json
import pathlib
import re
import sys

from mstarpy.utils import APIKEY  # clave pública de la web de Morningstar que usa mstarpy 10

from fondos.proveedores.morningstar import DETALLE, SCREENER, UNIVERSO, Morningstar

SALIDA = pathlib.Path('salida')
SALIDA.mkdir(exist_ok=True)
CLAVES = re.compile(r'"([A-Za-z_]*(?:[Yy]ield|[Cc]oupon|[Dd]uration|[Pp]rice[A-Z]?|[Mm]aturity|NumberOf)[A-Za-z_]*)"\s*:\s*("?[^,}\]]{0,25})')


def guarda(nombre, texto):
    (SALIDA / nombre).write_text(texto, encoding='utf-8')


def resumen(texto):
    """Campos con pinta de renta fija y su valor, sin repetir."""
    vistos = {}
    for k, v in CLAVES.findall(texto):
        vistos.setdefault(k, v)
    return dict(list(vistos.items())[:40])


ms = Morningstar()
fondos = [(i, ms.buscar(i)) for i in sys.argv[1:]]

# 1) Buscador: muchos nombres de campo de una vez (los que no conoce, los ignora)
CAMPOS = ('YieldToMaturity|AverageYieldToMaturity|YieldToWorst|AverageYieldToWorst|CurrentYield|AverageCurrentYield|Yield_M12|'
          'TrailingYield|SECYield|DistributionYield|AverageCoupon|AverageCouponRate|Coupon|AveragePrice|AverageBondPrice|'
          'ModifiedDuration|AverageModifiedDuration|EffectiveDuration|AverageEffectiveDuration|EffectiveMaturity|'
          'AverageEffectiveMaturity|AverageCreditQuality|AverageCreditQualityCode|BondStyleBox|NumberOfHoldings|'
          'NumberOfBondHoldings|NumberOfStockHoldings|NumberOfHoldingShort|PortfolioDate|ProspectiveDividendYield|Yield')
print('\n######## 1) BUSCADOR')
for isin, _ in fondos:
    r = ms.http.get(SCREENER, params={'outputType': 'json', 'universeIds': UNIVERSO, 'term': isin,
                                      'securityDataPoints': 'SecId|Isin|' + CAMPOS, 'pageSize': 1}, timeout=30)
    print(f'{isin}: HTTP {r.status_code} {r.text[:600]}', flush=True)

# 2) Ficha de detalle: otras vistas
print('\n######## 2) VISTAS DE LA FICHA DE DETALLE')
VISTAS = ['ITsnapshot', 'snapshot', 'ITportfolio', 'portfolio', 'ITholdings', 'holdings', 'MFsnapshot', 'FIsnapshot',
          'ITfixedincome', 'fixedincome', 'ITrisk', 'ITbond', 'ITsnapshotFI', 'ITPortfolioFI']
for isin, f in fondos:
    if not f:
        continue
    for v in VISTAS:
        try:
            r = ms.http.get(DETALLE + f['ms_id'], params={'viewId': v, 'idtype': 'msid', 'responseViewFormat': 'json',
                                                         'languageId': 'es-ES', 'currencyId': 'EUR'}, timeout=30)
            n = len(re.findall(r'"SecurityName"', r.text))
            print(f'{isin} {v}: HTTP {r.status_code}, {len(r.content)} bytes, {n} posiciones · {resumen(r.text) if r.ok else ""}', flush=True)
            if r.ok and len(r.content) > 200:
                guarda(f'{isin}_vista_{v}.json', r.text)
        except Exception as e:  # noqa: BLE001
            print(f'{isin} {v}: {e!r}')

# 3) API global de Morningstar (la que usa mstarpy), sin Chrome: clave fija en la cabecera
print('\n######## 3) API GLOBAL')
API = 'https://api-global.morningstar.com/sal-service/v1/fund/{}/{}/data'
FINALES = {'fixedIncomeStyle': ('process/fixedIncomeStyle', {}),
           'posiciones': ('portfolio/holding/v2', {'premiumNum': 10000, 'freeNum': 10000})}
for isin, f in fondos:
    if not f:
        continue
    for nombre, (ruta, extra) in FINALES.items():
        try:
            r = ms.http.get(API.format(ruta, f['ms_id']), headers={'apikey': APIKEY},
                            params={'clientId': 'MDC', 'version': '4.71.0', **extra}, timeout=60)
            n = len(re.findall(r'"securityName"', r.text))
            print(f'{isin} {nombre}: HTTP {r.status_code}, {len(r.content)} bytes, {n} posiciones · {resumen(r.text) if r.ok else r.text[:300]}', flush=True)
            if r.ok:
                guarda(f'{isin}_api_{nombre}.json', r.text)
        except Exception as e:  # noqa: BLE001
            print(f'{isin} {nombre}: {e!r}')
