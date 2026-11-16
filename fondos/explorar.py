"""Exploración temporal (se borra después): el buscador de Morningstar da 401; alternativas."""
from __future__ import annotations

import json

from .proveedores.morningstar import CAMPOS, DETALLE, UNIVERSO, Morningstar


def corto(x, n=600):
    s = json.dumps(x, ensure_ascii=False, default=str)
    return s[:n] + ('…' if len(s) > n else '')


def explorar(isin: str) -> None:
    ms = Morningstar()
    params = {'outputType': 'json', 'universeIds': UNIVERSO, 'securityDataPoints': CAMPOS, 'page': 1, 'pageSize': 3,
              'sortOrder': 'Name asc'}
    urls = ['https://lt.morningstar.com/api/rest.svc/klr5zyak8x/security/screener',
            'https://tools.morningstar.es/api/rest.svc/klr5zyak8x/security/screener',
            'https://lt.morningstar.com/api/rest.svc/2nhcdckzon/security/screener',
            'https://tools.morningstar.es/api/rest.svc/2nhcdckzon/security/screener']
    cabeceras = {'sin': {}, 'referer': {'Referer': 'https://www.morningstar.es/', 'Origin': 'https://www.morningstar.es'},
                 'referer global': {'Referer': 'https://global.morningstar.com/', 'Origin': 'https://global.morningstar.com'}}
    for u in urls:
        for nc, h in cabeceras.items():
            try:
                r = ms.http.get(u, params=params, headers=h, timeout=60)
                print(f'buscador {u.split("/")[2]} {u.split("/")[5]} {nc}: {r.status_code} '
                      + (f'total={r.json().get("total")} {corto((r.json().get("rows") or [])[:1])}' if r.ok else r.text[:150]))
            except Exception as e:  # noqa: BLE001
                print(f'buscador {u} {nc}: {type(e).__name__} {e}')
    r = ms.http.get(DETALLE + isin, params={'viewId': 'MFsnapshot', 'idtype': 'isin', 'responseViewFormat': 'json',
                                           'languageId': 'es-ES', 'currencyId': 'EUR'}, timeout=60)
    d = r.json()
    d0 = d[0] if isinstance(d, list) else d
    for k in ('Id', 'Isin', 'Name', 'InceptionDate', 'OngoingCharge', 'Currency', 'TradingCurrency', 'CollectedSRRI', 'FundAttributes',
              'NetAssetValues', 'PurchaseDetails', 'CategoryBroadAssetClass', 'IMASector', 'LegalStructure', 'FundBenchmark'):
        print(f'detalle {k}: {corto(d0.get(k), 500)}')
    rr = d0.get('RiskAndRating')
    print(f'detalle RiskAndRating: {corto(rr, 800)}')
    p = (d0.get('Portfolios') or [{}])[0]
    print(f'detalle Portfolios[0] claves: {list(p)}')
    for k, v in d0.items():
        if 'categ' in k.lower() or 'asset' in k.lower() and k != 'NetAssetValues':
            print(f'detalle {k}: {corto(v, 300)}')
    def buscar(o, ruta=''):
        if isinstance(o, dict):
            for k, v in o.items():
                if any(x in k.lower() for x in ('categor', 'tnav', 'fundsize', 'netasset', 'indexfund', 'minimum', 'initial')):
                    print(f'  clave {ruta}{k}: {corto(v, 200)}')
                buscar(v, ruta + k + '.')
        elif isinstance(o, list):
            for v in o[:2]:
                buscar(v, ruta + '[].')
    buscar({k: v for k, v in d0.items() if k not in ('Portfolios', 'HistoricalPerformanceSeries', 'GrowthOf10K')})
