"""Exploración temporal (se borra después): cómo buscar un fondo por ISIN ahora que el buscador con term= da 401."""
from __future__ import annotations

import json

from .proveedores.morningstar import CAMPOS, CAMPOS_BASICOS, DETALLE, SCREENER, UNIVERSO, Morningstar


def corto(x, n=700):
    s = json.dumps(x, ensure_ascii=False, default=str)
    return s[:n] + ('…' if len(s) > n else '')


def explorar(isin: str) -> None:
    ms = Morningstar()
    base = {'outputType': 'json', 'universeIds': UNIVERSO, 'securityDataPoints': CAMPOS_BASICOS}
    pruebas = {
        'term': {**base, 'term': isin},
        'term+page': {**base, 'term': isin, 'page': 1, 'pageSize': 10},
        'filtro Isin IN': {**base, 'filters': f'Isin:IN:{isin}', 'page': 1, 'pageSize': 10},
        'filtro ISIN EQ': {**base, 'filters': f'Isin:EQ:{isin}', 'page': 1, 'pageSize': 10},
        'campos completos + filtro': {**base, 'securityDataPoints': CAMPOS, 'filters': f'Isin:IN:{isin}', 'page': 1, 'pageSize': 10},
    }
    for nombre, params in pruebas.items():
        try:
            r = ms.http.get(SCREENER, params=params, timeout=60)
            filas = (r.json().get('rows') or []) if r.ok else r.text[:200]
            print(f'buscador {nombre}: {r.status_code} total={r.json().get("total") if r.ok else "-"} {corto(filas)}')
        except Exception as e:  # noqa: BLE001
            print(f'buscador {nombre}: {type(e).__name__} {e}')
    for idtype in ('isin', 'Isin'):
        try:
            r = ms.http.get(DETALLE + isin, params={'viewId': 'MFsnapshot', 'idtype': idtype, 'responseViewFormat': 'json',
                                                   'languageId': 'es-ES', 'currencyId': 'EUR'}, timeout=60)
            d = r.json() if r.ok else r.text[:200]
            d0 = d[0] if isinstance(d, list) and d else d
            print(f'detalle idtype={idtype}: {r.status_code} ' + (corto({k: d0.get(k) for k in ('Id', 'Isin', 'Name', 'CategoryBroadAssetClass')}) if isinstance(d0, dict) else corto(d0)))
        except Exception as e:  # noqa: BLE001
            print(f'detalle {idtype}: {type(e).__name__} {e}')
    try:
        r = ms.http.get('https://www.morningstar.es/es/util/SecuritySearch.ashx', params={'q': isin, 'limit': 5}, timeout=60)
        print(f'SecuritySearch: {r.status_code} {r.text[:400]!r}')
    except Exception as e:  # noqa: BLE001
        print(f'SecuritySearch: {type(e).__name__} {e}')
