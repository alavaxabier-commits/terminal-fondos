"""Órdenes de la ingesta.

  python -m fondos alta ISIN [ISIN …]   da de alta fondos (ficha de Morningstar) y los pone en seguimiento
  python -m fondos precios [--tanda N]  descarga valores liquidativos de lo que toque hoy
  python -m fondos macro                tipos de cambio y €STR del BCE
  python -m fondos diario               macro + precios (lo que lanza GitHub Actions cada mañana)
  python -m fondos universo [--limite N] actualiza las fichas del universo de Morningstar España
  python -m fondos estado               resumen para cerrar la fase 0: valores, huecos y errores recientes
  python -m fondos prueba-red ISIN      prueba cada fuente con un fondo, sin base de datos
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import sys
from zoneinfo import ZoneInfo

from . import ingesta
from .proveedores import BCE, Morningstar, Yahoo


def hoy() -> dt.date:
    return dt.datetime.now(ZoneInfo('Europe/Madrid')).date()


def resumen_github(texto: str) -> None:
    """Añade texto al resumen de la ejecución en GitHub Actions (si se está ahí)."""
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as fh:
            fh.write(texto + '\n')


def orden_alta(repo, isins: list[str]) -> int:
    ms, fallos = Morningstar(), 0
    for isin in isins:
        f = ms.buscar(isin)
        if not f:
            print(f'{isin}: no está en el buscador de Morningstar España')
            fallos += 1
            continue
        repo.guardar_fondo(f)
        repo.seguir(f['isin'])
        print(f"{f['isin']}: {f['nombre']} · {f['categoria']} · {f['divisa']} · alta y en seguimiento")
    return 1 if fallos else 0


def orden_precios(repo, tanda: int) -> int:
    c = ingesta.precios(repo, Morningstar(), Yahoo(), hoy(), tanda)
    texto = f"### Precios · {hoy()}\n\n{c['ok']} ok · {c['aviso']} con aviso · {c['error']} con error"
    print(texto)
    resumen_github(texto)
    return 1 if c['error'] and not (c['ok'] or c['aviso']) else 0  # en rojo solo si falla todo


def orden_estado(repo) -> int:
    filas = repo.resumen()
    md = ['| Fondo | ISIN | Valores | Desde | Hasta | Fuente | Mayor salto (días) |', '|---|---|---|---|---|---|---|']
    md += [f'| {n} | {i} | {c} | {a or "—"} | {b or "—"} | {fu or "—"} | {s} |' for n, i, c, a, b, fu, s in filas]
    err = repo.errores_recientes()
    if err:
        md += ['', '**Avisos y errores de las últimas 36 h**', '']
        md += [f'- {ts:%d/%m %H:%M} · {fu} · {i or "—"} · {e}: {m}' for ts, fu, i, e, m in err]
    texto = '\n'.join(md)
    print(texto)
    resumen_github('### Estado de los datos\n\n' + texto)
    return 0


def orden_universo(repo, limite: int | None) -> int:
    n = 0
    for f in Morningstar().universo(limite=limite):
        repo.guardar_fondo(f)
        n += 1
        if n % 500 == 0:
            print(f'{n} fichas…', flush=True)
    print(f'{n} fichas actualizadas')
    resumen_github(f'### Universo · {hoy()}\n\n{n} fichas de Morningstar España')
    return 0


def orden_prueba_red(isin: str) -> int:
    """Comprueba cada fuente con un fondo y lo cuenta; no toca la base de datos."""
    d, ok = hoy(), True
    ms = Morningstar()
    f = ms.buscar(isin)
    print(f'Buscador Morningstar: {f}')
    try:
        s = ms.historico(isin, f and f['ms_id'], d - dt.timedelta(days=30), d)
        print(f'Morningstar (mstarpy): {len(s)} valores; últimos {sorted(s.items())[-3:]}')
        ok &= bool(s)
    except Exception as e:  # noqa: BLE001
        print(f'Morningstar (mstarpy) falla: {e}')
        ok = False
        s = {}
    yh = Yahoo()
    cands = yh.candidatos(isin, f and f['nombre'])
    print(f'Yahoo, candidatos: {cands}')
    if s:
        print(f"Yahoo, ticker verificado: {yh.buscar_verificado(isin, f and f['nombre'], s, d)}")
    bce = BCE()
    print(f"BCE USD: {sorted(bce.tipo_cambio('USD', d - dt.timedelta(days=10)).items())[-1:]}")
    print(f'BCE €STR: {sorted(bce.estr(d - dt.timedelta(days=10)).items())[-1:]}')
    return 0 if ok else 1


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog='python -m fondos', description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='orden', required=True)
    a = sub.add_parser('alta')
    a.add_argument('isins', nargs='+')
    for nombre in ('precios', 'diario'):
        s = sub.add_parser(nombre)
        s.add_argument('--tanda', type=int, default=ingesta.TANDA)
    sub.add_parser('macro')
    sub.add_parser('estado')
    u = sub.add_parser('universo')
    u.add_argument('--limite', type=int)
    r = sub.add_parser('prueba-red')
    r.add_argument('isin')
    args = p.parse_args(argv)

    if args.orden == 'prueba-red':
        return orden_prueba_red(args.isin.upper())

    from .db import Repo
    repo = Repo()
    if args.orden == 'alta':
        return orden_alta(repo, [i.upper() for i in args.isins])
    if args.orden == 'macro':
        ingesta.macro(repo, BCE(), hoy())
        return 0
    if args.orden == 'precios':
        return orden_precios(repo, args.tanda)
    if args.orden == 'diario':
        ingesta.macro(repo, BCE(), hoy())
        codigo = orden_precios(repo, args.tanda)
        orden_estado(repo)
        return codigo
    if args.orden == 'universo':
        return orden_universo(repo, args.limite)
    if args.orden == 'estado':
        return orden_estado(repo)
    return 2


if __name__ == '__main__':
    sys.exit(main())
