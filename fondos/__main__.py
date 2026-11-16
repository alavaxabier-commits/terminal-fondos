"""Órdenes de la ingesta.

  python -m fondos alta ISIN [ISIN …]   da de alta fondos (ficha de Morningstar) y los pone en seguimiento
  python -m fondos precios [--tanda N]  descarga valores liquidativos de lo que toque hoy
  python -m fondos macro                tipos de cambio y €STR del BCE
  python -m fondos diario               macro + precios (lo que lanza GitHub Actions cada mañana)
  python -m fondos universo             fichas de Morningstar España y catálogo de MyInvestor; universo = ≥ 50 M€,
                                        ≥ 3 años, ≤ 100 por categoría, con preferencia por las clases de MyInvestor
  python -m fondos myinvestor           solo el catálogo de MyInvestor (sin marcar el universo)
  python -m fondos metricas             calcula las métricas y percentiles de todos los fondos (y la nota de la semana)
  python -m fondos notas --semanas 52   carga inicial de nota_semanal: las notas de las semanas anteriores
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

import requests

from . import ingesta, vigilancia
from .validacion import lunes
from .proveedores import BCE, FT, Morningstar, MyInvestor, Yahoo
from .proveedores.morningstar import Bloqueo


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
            print(f'{isin}: no está en Morningstar')
            fallos += 1
            continue
        repo.guardar_fondo(f)
        repo.seguir(f['isin'])
        print(f"{f['isin']}: {f['nombre']} · {f['categoria']} · {f['divisa']} · alta y en seguimiento")
    return 1 if fallos else 0


def avisar(repo, tarea: str, alarmas: list[str]) -> int:
    """Deja el resultado de la vigilancia en el registro (la web lo enseña en Inicio). Con alarmas, la tarea acaba en rojo
    y GitHub avisa por correo."""
    for a in alarmas:
        repo.registrar('vigilancia', None, 'error', a)
    if not alarmas:
        repo.registrar('vigilancia', None, 'ok', f'{tarea}: sin alarmas')
        return 0
    texto = f'### Alarmas · {tarea}\n\n' + '\n'.join(f'- {a}' for a in alarmas)
    print(texto)
    resumen_github(texto)
    return 1


def vigilar_precios(repo, cuenta: dict, desde: dt.datetime) -> list[str]:
    from .validacion import dias_habiles_entre
    sin_precio = [(n, None if f is None else dias_habiles_entre(f, hoy())) for n, f in repo.ultimos_precios_carteras()]
    return vigilancia.precios(cuenta, repo.descargas_por_fuente(desde), sin_precio)


def orden_precios(repo, tanda: int) -> int:
    desde = dt.datetime.now(dt.timezone.utc)
    c = ingesta.precios(repo, Morningstar(), Yahoo(), FT(), hoy(), tanda)
    texto = f"### Precios · {hoy()}\n\n{c['ok']} ok · {c['aviso']} con aviso · {c['error']} con error"
    print(texto)
    resumen_github(texto)
    return avisar(repo, 'precios', vigilar_precios(repo, c, desde))


def orden_composicion(repo, tanda: int) -> int:
    ms, c, completas = Morningstar(), {'ok': 0, 'aviso': 0, 'error': 0}, 0
    for isin, ms_id in repo.fondos_para_composicion(tanda):
        try:
            fecha, datos, gestion, ficha = ms.composicion(ms_id)
            repo.guardar_composicion(isin, fecha, datos)  # sin desglose también se guarda: no se reintenta hasta el mes que viene
            repo.guardar_gestion(isin, gestion)
            if ficha and ficha['isin'] == isin:  # TER, patrimonio, categoría, SRRI, estilos… (lo que daba el buscador)
                repo.guardar_fondo(ficha)
            estado = 'ok' if datos else 'aviso'
            completas += bool(datos.get('posiciones_todas'))
            repo.registrar('morningstar', isin, estado, f"composición: cartera a {fecha}, {len(datos.get('posiciones', []))} posiciones" if datos else 'composición: sin desglose publicado')
        except Exception as e:  # noqa: BLE001
            estado = 'error'
            repo.registrar('morningstar', isin, estado, f'composición: {type(e).__name__}: {e}'[:500])
        c[estado] += 1
    texto = f"### Composición · {hoy()}\n\n{c['ok']} ok ({completas} con todas sus posiciones) · {c['aviso']} sin desglose · {c['error']} con error"
    print(texto)
    resumen_github(texto)
    return avisar(repo, 'composición', vigilancia.composicion(c, completas))


def orden_metricas(repo) -> int:
    import time
    from . import calculo
    t0 = time.time()
    datos = repo.datos_metricas()
    t1 = time.time()
    filas, refs, notas, diversificacion = calculo.calcular(datos, hoy())
    t2 = time.time()
    anterior = repo.n_metricas()
    repo.guardar_metricas(filas, refs)
    repo.guardar_notas(lunes(hoy()), notas)
    repo.guardar_diversificacion(diversificacion, datos['carteras'])
    fondos = len({f[0] for f in filas})
    texto = (f'### Métricas · {hoy()}\n\n{len(filas)} métricas de {fondos} fondos, {len(notas)} notas, {len(diversificacion)} correlaciones con {len(datos["carteras"])} carteras '
             f'y {len(refs)} referencias · '
             f'carga {t1 - t0:.0f} s, cálculo {t2 - t1:.0f} s, guardado {time.time() - t2:.0f} s')
    print(texto)
    resumen_github(texto)
    return avisar(repo, 'métricas', vigilancia.metricas(len(filas), anterior))


def orden_notas(repo, semanas: int) -> int:
    """Notas de las semanas anteriores (carga inicial de nota_semanal), con el TER y la gestión de hoy: para cada
    semana se recortan las series a su domingo y se calcula todo como si fuera ese día."""
    from . import calculo
    datos = repo.datos_metricas()
    for k in range(1, semanas + 1):
        dia = lunes(hoy()) - dt.timedelta(weeks=k)
        corte = dia + dt.timedelta(days=6)
        recortados = {**datos, 'carteras': {}, 'valores': {i: {d: v for d, v in s.items() if d <= corte} for i, s in datos['valores'].items()}}
        notas = calculo.calcular(recortados, corte)[2]
        repo.guardar_notas(dia, notas)
        print(f'{dia}: {len(notas)} notas', flush=True)
    resumen_github(f'### Notas · {hoy()}\n\n{semanas} semanas anteriores calculadas')
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


def descargar_myinvestor(repo) -> tuple[list[dict], list[str]]:
    """Catálogo de MyInvestor; con un catálogo raro o sin él no se guarda y el universo usa el anterior."""
    try:
        mi, fallo = MyInvestor().catalogo(), None
    except Exception as e:  # noqa: BLE001
        mi, fallo = [], f'{type(e).__name__}: {e}'[:300]
    alarmas = vigilancia.myinvestor(len(mi), fallo)
    if not alarmas:
        repo.guardar_myinvestor(mi)
        repo.registrar('myinvestor', None, 'ok', f'catálogo: {len(mi)} fondos')
    return mi, alarmas


def orden_universo(repo, limite: int | None, min_patrimonio: float, min_anos: int, tope: int, max_minima: float) -> int:
    """Fichas, catálogo de MyInvestor y marca del universo. El buscador de Morningstar responde 401 desde noviembre de
    2026: si sigue así, las fichas se refrescan con la composición (cada uno o dos meses) y los fondos nuevos de
    MyInvestor se dan de alta aquí por ISIN."""
    ms, n, lote, cerrado = Morningstar(), 0, [], False
    try:
        for f in ms.universo(limite=limite):
            lote.append(f)
            n += 1
            if len(lote) == 500:
                repo.guardar_fondos(lote)
                lote = []
                print(f'{n} fichas…', flush=True)
    except requests.HTTPError as e:
        cerrado = True
        print(f'Buscador de Morningstar cerrado ({e.response.status_code if e.response is not None else e}): '
              'las fichas se refrescan con la composición', flush=True)
    repo.guardar_fondos(lote)
    anteriores = None if cerrado else repo.ultimo_mensaje('universo', 'fichas: ')
    repo.borrar_registro_antiguo()
    if not limite and not cerrado:  # una prueba con pocas fichas no cuenta como referencia para la semana siguiente
        repo.registrar('universo', None, 'ok', f'fichas: {n}')
    mi, alarmas_mi = descargar_myinvestor(repo)
    nuevos, fallidos = altas_myinvestor(repo, ms)
    dentro = repo.marcar_universo(min_patrimonio, min_anos, tope, max_minima)
    if not limite:
        repo.guardar_historial_patrimonio()
    mi_ficha, mi_dentro = repo.resumen_myinvestor()
    borrados = repo.limpiar_valores()
    con_minima, fichas = repo.resumen_minimas()
    texto = (f'### Universo · {hoy()}\n\n'
             + ('buscador de Morningstar cerrado: fichas refrescadas con la composición · ' if cerrado else f'{n} fichas de Morningstar España · ')
             + f'{dentro} fondos en el universo '
             f'(patrimonio ≥ {min_patrimonio:g} M€, ≥ {min_anos} años, como mucho {tope} por categoría; '
             f'una clase por fondo, o todas las de MyInvestor si vende alguna) · '
             f'MyInvestor: {len(mi) or "sin descargar"} fondos, {mi_ficha} con ficha ({nuevos} nuevas), {mi_dentro} en el universo · '
             f'inversión mínima conocida en {con_minima} de {fichas} fichas · '
             f'{borrados} valores borrados de fondos que salen')
    print(texto)
    resumen_github(texto)
    alarmas = alarmas_mi + vigilancia.universo(n, int(anteriores.split()[-1]) if anteriores else None, *repo.sin_dato_universo())
    if fallidos > max(5, nuevos):
        alarmas.append(f'universo: {fallidos} fondos nuevos de MyInvestor sin ficha de Morningstar ({nuevos} dados de alta)')
    if limite:  # una prueba con pocas fichas no se compara con la semana anterior
        alarmas = [a for a in alarmas if 'fichas' not in a]
    return avisar(repo, 'universo', alarmas)


def altas_myinvestor(repo, ms, tope: int = 150) -> tuple[int, int]:
    """Fondos del catálogo de MyInvestor sin ficha: se buscan por ISIN (tres peticiones cada uno) y se guardan; el universo
    decide después si entran. Devuelve (dados de alta, sin ficha)."""
    nuevos = fallidos = 0
    for isin in repo.myinvestor_sin_ficha(tope):
        try:
            f = ms.buscar(isin)
        except Bloqueo:
            raise
        except Exception as e:  # noqa: BLE001
            f = None
            repo.registrar('morningstar', isin, 'error', f'alta desde MyInvestor: {type(e).__name__}: {e}'[:500])
        if f:
            repo.guardar_fondo(f)
            nuevos += 1
        else:
            fallidos += 1
    return nuevos, fallidos


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
    s.add_argument('--tanda', type=int, default=600, help='fondos como mucho (600 por semana: el universo entero en dos meses)')
    sub.add_parser('macro')
    sub.add_parser('metricas')
    n = sub.add_parser('notas')
    n.add_argument('--semanas', type=int, default=52, help='semanas anteriores a calcular (52)')
    sub.add_parser('estado')
    sub.add_parser('analisis', help='análisis de los pesos de la nota con cortes pasados (no escribe nada)')
    sub.add_parser('myinvestor')
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
    try:
        return ejecutar(args, repo)
    except Bloqueo as e:  # Morningstar rechaza seguido: se para y se avisa (tarea en rojo y aviso en Inicio)
        return avisar(repo, args.orden, [vigilancia.bloqueo(args.orden, str(e))])


def ejecutar(args, repo) -> int:
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
        codigo |= orden_metricas(repo)
        orden_estado(repo)
        return codigo
    if args.orden == 'metricas':
        return orden_metricas(repo)
    if args.orden == 'notas':
        return orden_notas(repo, args.semanas)
    if args.orden == 'analisis':
        from .analisis import analizar
        texto = analizar(repo.datos_metricas(), hoy(), log=lambda x: print(x, flush=True))
        print(texto)
        resumen_github(texto)
        return 0
    if args.orden == 'universo':
        return orden_universo(repo, args.limite, args.min_patrimonio, args.min_anos, args.tope, args.max_minima)
    if args.orden == 'estado':
        return orden_estado(repo)
    if args.orden == 'myinvestor':
        mi, alarmas = descargar_myinvestor(repo)
        print(f'MyInvestor: {len(mi)} fondos en el catálogo')
        return avisar(repo, 'myinvestor', alarmas)
    if args.orden == 'composicion':
        return orden_composicion(repo, args.tanda)
    return 2


if __name__ == '__main__':
    sys.exit(main())
