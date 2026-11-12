"""Prueba temporal: las dos llamadas del X-Ray (ficha MFsnapshot + posiciones completas) con fondos al azar.
Mide tiempo, tamaño descargado y lo que ocuparía guardado. No toca la base. Argumentos: ISIN:SecId …"""
import json
import sys
import time
import zlib

from mstarpy.utils import APIKEY  # clave pública de la web de Morningstar (la que usa mstarpy 10)

from fondos.proveedores.morningstar import Morningstar

API = 'https://api-global.morningstar.com/sal-service/v1/fund/portfolio/holding/v2/{}/data'
ms = Morningstar()
tot = {'kb_ficha': 0, 'kb_comp': 0, 'kb_pos': 0, 'kb_pos01': 0, 's': 0.0, 'n': 0}
print('ISIN | ficha (s, KB, X-Ray KB) | posiciones (s, KB, n) | guardado completo KB / con ≥0,1 % KB (comprimido)')
for par in sys.argv[1:]:
    isin, sec = par.split(':')
    t0 = time.time()
    try:
        r = ms.http.get('https://lt.morningstar.com/api/rest.svc/klr5zyak8x/security_details/' + sec,
                        params={'viewId': 'MFsnapshot', 'idtype': 'msid', 'responseViewFormat': 'json', 'languageId': 'es-ES', 'currencyId': 'EUR'}, timeout=60)
        r.raise_for_status()
        from fondos.proveedores.morningstar import leer_composicion
        fecha, comp = leer_composicion(r.json())
        kb_comp = len(json.dumps(comp, separators=(',', ':'))) / 1024
        ficha = f'{time.time() - t0:.1f} s, {len(r.content) / 1024:.0f} KB, X-Ray {kb_comp:.1f} KB, cartera {fecha}, rf {bool(comp.get("estadisticas_rf"))}'
    except Exception as e:  # noqa: BLE001
        ficha, kb_comp, r = f'ERROR {e!r}'[:120], 0, None
    time.sleep(1)
    t1 = time.time()
    try:
        p = ms.http.get(API.format(sec), headers={'apikey': APIKEY},
                        params={'clientId': 'MDC', 'version': '4.71.0', 'premiumNum': 10000, 'freeNum': 10000}, timeout=120)
        p.raise_for_status()
        filas = [[h.get('securityName'), h.get('isin'), round(h['weighting'], 4), h.get('sector') or h.get('superSectorName'), h.get('country')]
                 for v in p.json().values() if isinstance(v, dict) and isinstance(v.get('holdingList'), list)
                 for h in v['holdingList'] if h.get('weighting')]
        z = lambda f: len(zlib.compress(json.dumps(f, separators=(',', ':')).encode())) / 1024
        g, g01 = z(filas), z([f for f in filas if abs(f[2]) >= 0.1])
        pos = f'{time.time() - t1:.1f} s, {len(p.content) / 1024:.0f} KB, {len(filas)} posiciones ({sum(abs(f[2]) >= 0.1 for f in filas)} ≥0,1 %)'
    except Exception as e:  # noqa: BLE001
        pos, g, g01, p = f'ERROR {e!r}'[:120], 0, 0, None
    print(f'{isin} | {ficha} | {pos} | {g:.0f} / {g01:.0f}', flush=True)
    tot['kb_ficha'] += len(r.content) / 1024 if r is not None else 0
    tot['kb_comp'] += kb_comp
    tot['kb_pos'] += g
    tot['kb_pos01'] += g01
    tot['s'] += time.time() - t0
    tot['n'] += 1
    time.sleep(1)
n = tot['n']
print(f"\nMEDIA por fondo: {tot['s'] / n:.1f} s (con pausas) · X-Ray {tot['kb_comp'] / n:.1f} KB · posiciones completas "
      f"{tot['kb_pos'] / n:.1f} KB · con ≥0,1 % {tot['kb_pos01'] / n:.1f} KB (comprimido)")
for u in (4400,):
    print(f"Universo de {u}: X-Ray {tot['kb_comp'] / n * u / 1024:.0f} MB · posiciones completas {tot['kb_pos'] / n * u / 1024:.0f} MB · "
          f"≥0,1 % {tot['kb_pos01'] / n * u / 1024:.0f} MB · tiempo {tot['s'] / n * u / 3600:.1f} h al mes")
