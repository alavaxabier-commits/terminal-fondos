"""Órdenes de la ingesta.

  python -m fondos alta ISIN [ISIN …]   da de alta fondos (ficha de Morningstar) y los pone en seguimiento
  python -m fondos precios [--tanda N]  descarga valores liquidativos de lo que toque hoy
  python -m fondos macro                tipos de cambio y €STR del BCE
  python -m fondos diario               macro + precios (lo que lanza GitHub Actions cada mañana)
  python -m fondos universo             fichas de Morningstar España; universo = ≥ 50 M€, ≥ 3 años, ≤ 100 por categoría
  python -m fondos metricas             calcula las métricas y percentiles de todos los fondos
  python -m fondos estado               resumen para cerrar la fase 0: valores, huecos y errores recientes
  python -m fondos composicion [--tanda N]   desglose de cartera (X-Ray) de los fondos que toca
  python -m fondos prueba-red ISIN      prueba cada fuente con un fondo, sin base de datos
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import sys
from zoneinfo import ZoneInfo

from . import ingesta
from .proveedores import BCE, FT, Morningstar, Yahoo


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
    c = ingesta.precios(repo, Morningstar(), Yahoo(), FT(), hoy(), tanda)
    texto = f"### Precios · {hoy()}\n\n{c['ok']} ok · {c['aviso']} con aviso · {c['error']} con error"
    print(texto)
    resumen_github(texto)
    return 1 if c['error'] and not (c['ok'] or c['aviso']) else 0  # en rojo solo si falla todo


def orden_composicion(repo, tanda: int) -> int:
    import time
    ms, c = Morningstar(), {'ok': 0, 'aviso': 0, 'error': 0}
    for isin, ms_id in repo.fondos_para_composicion(tanda):
        try:
            fecha, datos = ms.composicion(ms_id)
            repo.guardar_composicion(isin, fecha, datos)  # sin desglose también se guarda: no se reintenta hasta el mes que viene
            estado = 'ok' if datos else 'aviso'
            repo.registrar('morningstar', isin, estado, f'composición: cartera a {fecha}' if datos else 'composición: sin desglose publicado')
        except Exception as e:  # noqa: BLE001
            estado = 'error'
            repo.registrar('morningstar', isin, estado, f'composición: {type(e).__name__}: {e}'[:500])
        c[estado] += 1
        time.sleep(ms.pausa)
    texto = f"### Composición · {hoy()}\n\n{c['ok']} ok · {c['aviso']} sin desglose · {c['error']} con error"
    print(texto)
    resumen_github(texto)
    return 1 if c['error'] and not (c['ok'] or c['aviso']) else 0


def orden_metricas(repo) -> int:
    import time
    from . import calculo
    t0 = time.time()
    datos = repo.datos_metricas()
    t1 = time.time()
    filas = calculo.calcular(datos, hoy())
    t2 = time.time()
    repo.guardar_metricas(filas)
    fondos = len({f[0] for f in filas})
    texto = (f'### Métricas · {hoy()}\n\n{len(filas)} métricas de {fondos} fondos · '
             f'carga {t1 - t0:.0f} s, cálculo {t2 - t1:.0f} s, guardado {time.time() - t2:.0f} s')
    print(texto)
    resumen_github(texto)
    return 0


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


def orden_universo(repo, limite: int | None, min_patrimonio: float, min_anos: int, tope: int, max_minima: float) -> int:
    n, lote = 0, []
    for f in Morningstar().universo(limite=limite):
        lote.append(f)
        n += 1
        if len(lote) == 500:
            repo.guardar_fondos(lote)
            lote = []
            print(f'{n} fichas…', flush=True)
    repo.guardar_fondos(lote)
    dentro = repo.marcar_universo(min_patrimonio, min_anos, tope, max_minima)
    borrados = repo.limpiar_valores()
    con_minima, fichas = repo.resumen_minimas()
    mb = dentro * 52 * ingesta.ANOS * 100 / 1e6  # ~100 bytes por valor semanal, con su índice
    texto = (f'### Universo · {hoy()}\n\n{n} fichas de Morningstar España · {dentro} fondos en el universo '
             f'(patrimonio ≥ {min_patrimonio:g} M€, ≥ {min_anos} años, como mucho {tope} por categoría, una clase por fondo) · '
             f'unos {mb:.0f} MB de valores semanales · inversión mínima conocida en {con_minima} de {fichas} fichas · '
             f'{borrados} valores borrados de fondos que salen')
    print(texto)
    resumen_github(texto)
    return 0


def orden_prueba_red(isin: str) -> int:
    """Comprueba cada fuente con un fondo y lo cuenta; no toca la base de datos."""
    d, ok = hoy(), True
    ms = Morningstar()
    f = ms.buscar(isin)
    print(f'Buscador Morningstar: {f}')
    try:
        s = ms.historico(isin, f and f['ms_id'], d - dt.timedelta(days=30), d, f and f['divisa'])
        print(f'Morningstar (series): {len(s)} valores; últimos {sorted(s.items())[-3:]}')
        ok &= bool(s)
    except Exception as e:  # noqa: BLE001
        print(f'Morningstar (series) falla: {e}')
        ok = False
        s = {}
    try:
        ref = FT().historico(isin, f and f['divisa'])
        print(f'FT: {len(ref)} valores; últimos {sorted(ref.items())[-3:]}')
    except Exception as e:  # noqa: BLE001
        print(f'FT falla: {e}')
        ref = {}
    yh = Yahoo()
    cands = yh.candidatos(isin, f and f['nombre'])
    print(f'Yahoo, candidatos: {cands}')
    if s or ref:
        print(f"Yahoo, ticker verificado: {yh.buscar_verificado(isin, f and f['nombre'], s or ref, d)}")
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
    s = sub.add_parser('composicion')
    s.add_argument('--tanda', type=int, default=1200, help='fondos como mucho (1200: el universo entero en un mes)')
    sub.add_parser('macro')
    sub.add_parser('metricas')
    sub.add_parser('estado')
    u = sub.add_parser('universo')
    u.add_argument('--limite', type=int, help='solo las primeras N fichas (pruebas)')
    u.add_argument('--min-patrimonio', type=float, default=50, help='patrimonio mínimo, millones (50)')
    u.add_argument('--min-anos', type=int, default=3, help='años mínimos de historia (3)')
    u.add_argument('--tope', type=int, default=100, help='máximo de fondos por categoría (100)')
    u.add_argument('--max-minima', type=float, default=10000, help='inversión mínima máxima de la clase elegida (10000)')
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
        orden_metricas(repo)
        orden_estado(repo)
        return codigo
    if args.orden == 'metricas':
        return orden_metricas(repo)
    if args.orden == 'universo':
        return orden_universo(repo, args.limite, args.min_patrimonio, args.min_anos, args.tope, args.max_minima)
    if args.orden == 'estado':
        return orden_estado(repo)
    if args.orden == 'composicion':
        return orden_composicion(repo, args.tanda)
    return 2


if __name__ == '__main__':
    sys.exit(main())
