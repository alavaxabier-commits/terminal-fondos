"""Prueba temporal: ¿de dónde se pueden bajar la ficha mensual y el documento de datos fundamentales de un fondo?
Uso: python scripts/prueba_documentos.py ISIN:MS_ID ...  (no toca la base de datos)"""
import json
import re
import sys
import time

import requests

from fondos.proveedores.morningstar import CLAVE_WEB, DETALLE, UA

http = requests.Session()
http.headers['User-Agent'] = UA
ENLACE = re.compile(r'https?://[^\s"\'<>]+?(?:\.pdf|doc\.morningstar\.com[^\s"\'<>]*|api\.fundinfo\.com/document/[^\s"\'<>]*)', re.I)


def ver(nombre, url, **kw):
    time.sleep(1)
    try:
        r = http.get(url, timeout=40, **kw)
    except requests.RequestException as e:
        print(f'  {nombre}: falla {e.__class__.__name__}')
        return None
    tipo = r.headers.get('content-type', '')
    enlaces = sorted(set(ENLACE.findall(r.text)))[:15] if 'pdf' not in tipo else []
    print(f'  {nombre}: {r.status_code} · {tipo[:40]} · {len(r.content)} B · {len(enlaces)} enlaces')
    for e in enlaces:
        print(f'      {e}')
    return r


def claves_doc(x, ruta=''):
    """Claves de un JSON cuyo nombre o valor huele a documento."""
    if isinstance(x, dict):
        for k, v in x.items():
            if re.search(r'doc|pdf|kiid|kid|factsheet|literat|prospect', k, re.I):
                print(f'      {ruta}{k} = {json.dumps(v, ensure_ascii=False)[:300]}')
            claves_doc(v, f'{ruta}{k}.')
    elif isinstance(x, list):
        for i, v in enumerate(x[:3]):
            claves_doc(v, f'{ruta}{i}.')


for arg in sys.argv[1:]:
    isin, ms_id = arg.split(':')
    print(f'\n=== {isin} ({ms_id})')
    r = ver('MFsnapshot', DETALLE + ms_id, params={'viewId': 'MFsnapshot', 'idtype': 'msid', 'responseViewFormat': 'json', 'languageId': 'es-ES'})
    if r is not None and r.ok:
        claves_doc(r.json())
    for vista in ('Documents', 'MFdocuments', 'ITdocuments', 'Literature'):
        ver(f'security_details {vista}', DETALLE + ms_id, params={'viewId': vista, 'idtype': 'msid', 'responseViewFormat': 'json', 'languageId': 'es-ES'})
    base = 'https://api-global.morningstar.com/sal-service/v1/fund/'
    for ruta in ('documents/{}/data', 'documents/v2/{}/data', 'securityDocuments/{}/data', 'parentFund/documents/{}/data'):
        r = ver(f'api-global {ruta}', base + ruta.format(ms_id), headers={'apikey': CLAVE_WEB},
                params={'clientId': 'MDC', 'version': '4.71.0', 'languageId': 'es-ES', 'locale': 'es-ES'})
        if r is not None and r.ok and 'json' in r.headers.get('content-type', ''):
            print('      ' + r.text[:600])
    ver('morningstar.es documentos', f'https://www.morningstar.es/es/funds/snapshot/snapshot.aspx?id={ms_id}&tab=12')
    ver('global.morningstar.com documentos', f'https://global.morningstar.com/es/inversiones/fondos/{ms_id}/documentos')
    ver('fundinfo', f'https://www.fundinfo.com/es/ES-priv/LandingPage?query={isin}')
    ver('fundinfo api', f'https://www.fundinfo.com/api/search?query={isin}&profile=ES-priv')
