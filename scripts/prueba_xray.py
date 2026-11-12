"""Prueba temporal: ¿de dónde se puede sacar el desglose de cartera (X-Ray) de un fondo? No toca la base."""
import json
import logging
import sys

from fondos.proveedores.morningstar import SCREENER, UNIVERSO, Morningstar

BASE = SCREENER.rsplit('/security/', 1)[0]  # https://lt.morningstar.com/api/rest.svc/klr5zyak8x


def muestra(titulo, x, n=4000):
    t = json.dumps(x, ensure_ascii=False, default=str) if not isinstance(x, str) else x
    print(f'\n=== {titulo} · {len(t)} caracteres\n{t[:n]}', flush=True)


def claves(x, pref='', prof=0):
    """Esquema del JSON: rutas y tipos, para ver qué bloques trae sin volcarlo entero."""
    if prof > 4:
        return
    if isinstance(x, dict):
        for k, v in x.items():
            print(f'{pref}{k}: {type(v).__name__}{f" ({len(v)})" if isinstance(v, (list, dict)) else ""}')
            claves(v, pref + '  ', prof + 1)
    elif isinstance(x, list) and x:
        claves(x[0], pref + '  [0] ', prof + 1)


ms = Morningstar()
for isin in sys.argv[1:]:
    f = ms.buscar(isin)
    print(f'\n################ {isin}: {f}', flush=True)
    if not f:
        continue
    sec = f['ms_id']

    # 1) security_details del mismo servicio que el buscador
    for vista in ('ITsnapshot', 'snapshot'):
        try:
            r = ms.http.get(f'{BASE}/security_details/{sec}', params={'viewId': vista, 'idtype': 'msid', 'responseViewFormat': 'json', 'languageId': 'es-ES', 'currencyId': 'EUR'}, timeout=30)
            print(f'\n--- security_details {vista}: HTTP {r.status_code}, {len(r.content)} bytes')
            if r.ok and r.content:
                d = r.json()
                claves(d)
                muestra(f'security_details {vista}', d, 6000)
        except Exception as e:  # noqa: BLE001
            print(f'security_details {vista} falla: {e!r}')

    # 2) campos extra en el buscador
    try:
        r = ms.http.get(SCREENER, params={'outputType': 'json', 'universeIds': UNIVERSO, 'term': isin, 'securityDataPoints': 'SecId|Isin|EquityStyleBox|BondStyleBox|AverageMarketCapital|EffectiveDuration|AverageCreditQualityCode|PortfolioDate', 'pageSize': 1}, timeout=30)
        muestra(f'buscador con campos extra: HTTP {r.status_code}', r.text, 2000)
    except Exception as e:  # noqa: BLE001
        print(f'buscador extra falla: {e!r}')

# 3) mstarpy, con el registro de urllib3 para ver URL y códigos
logging.basicConfig(level=logging.DEBUG, format='%(name)s %(message)s')
logging.getLogger('urllib3').setLevel(logging.DEBUG)
try:
    import mstarpy
    print(f'\nmstarpy {getattr(mstarpy, "__version__", "?")}')
    for isin in sys.argv[1:]:
        try:
            fu = mstarpy.Funds(term=isin, country='es')
            print(f'\n--- mstarpy {isin}: {fu.name} · {fu.code}')
        except Exception as e:  # noqa: BLE001
            print(f'mstarpy {isin} no se encuentra: {e!r}')
            continue
        for metodo in ('allocationMap', 'sector', 'regionalSector', 'holdings', 'equityStyle', 'creditQuality'):
            try:
                muestra(f'mstarpy {isin}.{metodo}()', getattr(fu, metodo)(), 3000)
            except Exception as e:  # noqa: BLE001
                print(f'mstarpy {isin}.{metodo}() falla: {e!r}')
except ImportError as e:
    print(f'sin mstarpy: {e}')
