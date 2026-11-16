"""Exploración temporal (se borra después): qué campos de Morningstar traen la gestora y el equipo gestor."""
from __future__ import annotations

import json

from .proveedores.morningstar import CAMPOS_BASICOS, CLAVE_WEB, DETALLE, SCREENER, UNIVERSO, Morningstar

CANDIDATOS = ['BrandingCompanyName', 'BrandingCompanyId', 'ProviderCompanyName', 'ProviderCompanyId', 'ManagementCompanyName',
              'FundManagerName', 'ManagerName', 'Managers', 'ManagerTenure', 'ManagerStartDate', 'LegalName', 'FundTNAVDate',
              'FundNetFlow', 'EstimatedFundFlow', 'FundEstimatedNetFlow', 'YieldToMaturity']
SAL = 'https://api-global.morningstar.com/sal-service/v1/fund/{}/{}/data'
RUTAS = ['people', 'parent/parentSummary', 'parent/mstarRating', 'portfolio/v2/sector', 'securityMetaData']


def corto(x, n=1500):
    s = json.dumps(x, ensure_ascii=False, default=str)
    return s[:n] + ('…' if len(s) > n else '')


def buscar_claves(x, patron=('manag', 'provider', 'company', 'branding', 'people', 'tenure', 'flow', 'gestor')):
    out = {}
    def rec(o, ruta):
        if isinstance(o, dict):
            for k, v in o.items():
                if any(p in k.lower() for p in patron):
                    out[ruta + k] = v
                rec(v, ruta + k + '.')
        elif isinstance(o, list):
            for i, v in enumerate(o[:3]):
                rec(v, f'{ruta}{i}.')
    rec(x, '')
    return out


def explorar(isin: str) -> None:
    ms = Morningstar()
    sec = 'F00000P777'  # BNY Mellon Absolute Return Bond (el buscador con term= da 401)
    print(f'== {isin} {sec}')
    for c in CANDIDATOS:
        try:
            r = ms.http.get(SCREENER, params={'outputType': 'json', 'universeIds': UNIVERSO, 'page': 1, 'pageSize': 3, 'sortOrder': 'Name asc',
                                              'securityDataPoints': CAMPOS_BASICOS + '|' + c}, timeout=60)
            filas = r.json().get('rows') or [] if r.ok else []
            print(f'buscador {c}: {r.status_code} {corto([x.get(c) for x in filas], 300)}')
        except Exception as e:  # noqa: BLE001
            print(f'buscador {c}: {type(e).__name__} {e}')
    try:
        r = ms.http.get(DETALLE + sec, params={'viewId': 'MFsnapshot', 'idtype': 'msid', 'responseViewFormat': 'json',
                                               'languageId': 'es-ES', 'currencyId': 'EUR'}, timeout=60)
        d = r.json()
        d0 = d[0] if isinstance(d, list) and d else d
        print(f'detalle: {r.status_code} claves {list(d0)[:80] if isinstance(d0, dict) else type(d0)}')
        print(f'detalle, claves de gestión: {corto(buscar_claves(d0), 3000)}')
    except Exception as e:  # noqa: BLE001
        print(f'detalle: {type(e).__name__} {e}')
    for ruta in RUTAS:
        try:
            r = ms.http.get(SAL.format(ruta, sec), headers={'apikey': CLAVE_WEB}, timeout=60,
                            params={'clientId': 'MDC', 'version': '4.71.0', 'languageId': 'es', 'locale': 'es'})
            print(f'sal {ruta}: {r.status_code} {corto(r.json() if r.ok else r.text, 2500)}')
        except Exception as e:  # noqa: BLE001
            print(f'sal {ruta}: {type(e).__name__} {e}')
