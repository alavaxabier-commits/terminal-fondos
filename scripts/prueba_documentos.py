"""Prueba temporal: documentos de un fondo en la ficha de detalle de Morningstar y cómo se descargan.
Uso: python scripts/prueba_documentos.py MS_ID ...  (no toca la base de datos)"""
import sys
import time

import requests

from fondos.proveedores.morningstar import DETALLE, UA

http = requests.Session()
http.headers['User-Agent'] = UA


def bajar(url):
    time.sleep(1)
    try:
        r = http.get(url, timeout=40, allow_redirects=True)
        print(f'      {r.status_code} · {r.headers.get("content-type", "")[:30]} · {len(r.content)} B · {r.content[:5]!r} · {r.url[:110]}')
        return r.ok and r.content[:4] == b'%PDF'
    except requests.RequestException as e:
        print(f'      falla {e.__class__.__name__}')
        return False


probado = False
for ms_id in sys.argv[1:]:
    r = http.get(DETALLE + ms_id, params={'viewId': 'MFsnapshot', 'idtype': 'msid', 'responseViewFormat': 'json', 'languageId': 'es-ES'}, timeout=60)
    docs = r.json()[0].get('Documents', [])
    print(f'\n=== {ms_id}: {len(docs)} documentos')
    for d in docs:
        print(f"  tipos {d.get('DocumentTypes')} attr {d.get('DocumentTypeAttributes')} · idioma {d.get('Languages')} · mercado {d.get('Markets')} · "
              f"efectivo {d.get('EffectiveDate', '')[:10]} · {d.get('Format')} · id {d.get('DocumentId')} / {d.get('EncodedDocumentId')} · "
              f"otras claves {sorted(set(d) - {'DocumentId', 'EncodedDocumentId', 'EffectiveDate', 'FilingDate', 'Format', 'DocumentTypes', 'Languages', 'DocumentTypeAttributes', 'Markets'})}")
    if docs and not probado:
        d = docs[0]
        e, i = d['EncodedDocumentId'], d['DocumentId']
        print('  descarga del primero:')
        for url in (f'https://doc.morningstar.com/document/{e}.msdoc',
                    f'https://doc.morningstar.com/document/{e}.msdoc/?clientid=klr5zyak8x',
                    f'https://doc.morningstar.com/Document/{e}.msdoc',
                    f'https://doc.morningstar.com/document/{i}.msdoc',
                    f'https://doc.morningstar.com/Document/{e}.pdf',
                    f'https://lt.morningstar.com/api/rest.svc/klr5zyak8x/document/{e}',
                    f'https://lt.morningstar.com/api/rest.svc/klr5zyak8x/document/{i}',
                    f'https://lt.morningstar.com/api/rest.svc/document/klr5zyak8x/{e}'):
            print(f'    {url}')
            if bajar(url):
                print('    ^ PDF')
        probado = True
