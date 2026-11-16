"""Acceso a Postgres (Supabase) con conexión directa. La URL va en la variable DATABASE_URL."""
from __future__ import annotations

import datetime as dt
import re
import os
import sys

from .ingesta import FondoIngesta
from .validacion import Serie


def reducir(serie: Serie) -> Serie:
    """Último dato de cada semana ISO y de cada mes: lo que usan las métricas (los días intermedios no)."""
    semana: dict[tuple, dt.date] = {}
    mes: dict[tuple, dt.date] = {}
    for f in sorted(serie):
        semana[f.isocalendar()[:2]] = f
        mes[(f.year, f.month)] = f
    return {f: serie[f] for f in sorted(set(semana.values()) | set(mes.values()))}


class Repo:
    def __init__(self, url: str | None = None):
        import psycopg
        url = url or os.environ.get('DATABASE_URL')
        if not url:
            sys.exit('Falta DATABASE_URL (cadena de conexión de Supabase, «Session pooler»).')
        # prepare_threshold=None: funciona también tras el pooler de Supabase en modo transacción
        self.cx = psycopg.connect(url, autocommit=True, prepare_threshold=None)

    def _filas(self, sql, params=()):
        with self.cx.cursor() as c:
            c.execute(sql, params)
            return c.fetchall()

    def _ejecutar(self, sql, params=()):
        with self.cx.cursor() as c:
            c.execute(sql, params)

    # ------------------------------------------------------------ fondos
    def fondos_para_ingesta(self) -> list[FondoIngesta]:
        filas = self._filas("""
            select f.isin, f.nombre, f.ms_id, f.yahoo_ticker, f.divisa, d.isin is not null,
                   v.ultima, coalesce(v.n_anyo, 0), f.historico_diario
            from fondos.fondo f
            left join fondos.fondo_diario d using (isin)
            left join lateral (
              select max(fecha) as ultima, count(*) filter (where fecha > current_date - 365) as n_anyo
              from fondos.valor_liquidativo where isin = f.isin) v on true
            where f.en_universo or d.isin is not null""")
        return [FondoIngesta(*f) for f in filas]

    def guardar_fondo(self, f: dict):
        self.guardar_fondos([f])

    def guardar_fondos(self, fichas: list[dict]):
        """Muchas fichas en un solo viaje a la base (fila a fila, el universo tarda horas)."""
        if not fichas:
            return
        with self.cx.cursor() as c:
            c.executemany(self._SQL_FONDO, fichas)

    _SQL_FONDO = ("""
            insert into fondos.fondo (isin, nombre, ms_id, fund_id, categoria, divisa, ter, fecha_lanzamiento, patrimonio_meur,
                                      inversion_minima, estilo_rv, estilo_rf, capitalizacion_media, duracion_efectiva,
                                      vencimiento_efectivo, calidad_media, gestion, srri)
            values (%(isin)s, %(nombre)s, %(ms_id)s, %(fund_id)s, %(categoria)s, %(divisa)s, %(ter)s,
                    %(fecha_lanzamiento)s, %(patrimonio_meur)s, %(inversion_minima)s, %(estilo_rv)s, %(estilo_rf)s,
                    %(capitalizacion_media)s, %(duracion_efectiva)s, %(vencimiento_efectivo)s, %(calidad_media)s, %(gestion)s, %(srri)s)
            on conflict (isin) do update set
              nombre = excluded.nombre,
              ms_id = coalesce(excluded.ms_id, fondo.ms_id),
              fund_id = coalesce(excluded.fund_id, fondo.fund_id),
              patrimonio_meur = coalesce(excluded.patrimonio_meur, fondo.patrimonio_meur),
              inversion_minima = coalesce(excluded.inversion_minima, fondo.inversion_minima),
              categoria = coalesce(excluded.categoria, fondo.categoria),
              divisa = coalesce(excluded.divisa, fondo.divisa),
              ter = coalesce(excluded.ter, fondo.ter),
              fecha_lanzamiento = coalesce(excluded.fecha_lanzamiento, fondo.fecha_lanzamiento),
              estilo_rv = coalesce(excluded.estilo_rv, fondo.estilo_rv),
              estilo_rf = coalesce(excluded.estilo_rf, fondo.estilo_rf),
              capitalizacion_media = coalesce(excluded.capitalizacion_media, fondo.capitalizacion_media),
              duracion_efectiva = coalesce(excluded.duracion_efectiva, fondo.duracion_efectiva),
              vencimiento_efectivo = coalesce(excluded.vencimiento_efectivo, fondo.vencimiento_efectivo),
              calidad_media = coalesce(excluded.calidad_media, fondo.calidad_media),
              gestion = coalesce(excluded.gestion, fondo.gestion),
              srri = coalesce(excluded.srri, fondo.srri),
              actualizado_en = now()""")

    # ------------------------------------------------------------ composición (X-Ray)
    def fondos_para_composicion(self, tanda: int) -> list[tuple[str, str]]:
        """(isin, ms_id) que toca descargar: los míos una vez al mes y el resto del universo cada dos meses,
        primero los que nunca se han descargado y luego los más antiguos."""
        return self._filas("""
            select f.isin, f.ms_id
            from fondos.fondo f
            left join fondos.fondo_diario d using (isin)
            left join fondos.composicion c using (isin)
            where (f.en_universo or d.isin is not null) and f.ms_id is not null
              and (c.isin is null or c.descargada_en < now() - case when d.isin is null then interval '55 days' else interval '27 days' end)
            order by d.isin is null, c.descargada_en nulls first, f.isin
            limit %s""", (tanda,))

    def guardar_composicion(self, isin: str, fecha: dt.date | None, datos: dict):
        from psycopg.types.json import Jsonb
        self._ejecutar("""
            insert into fondos.composicion (isin, fecha_cartera, datos) values (%s, %s, %s)
            on conflict (isin) do update set fecha_cartera = excluded.fecha_cartera, datos = excluded.datos,
                                             descargada_en = now()""", (isin, fecha, Jsonb(datos)))
        self.guardar_historial_rf(isin, fecha, datos)

    def guardar_historial_rf(self, isin: str, fecha: dt.date | None, datos: dict):
        """Estadísticas de renta fija de la cartera publicada en historial_rf (composicion solo guarda la última)."""
        s = datos.get('estadisticas_rf')
        if not fecha or not isinstance(s, dict):
            return
        self._ejecutar("""
            insert into fondos.historial_rf (fondo_id, fecha_cartera, tir, rendimiento, duracion, vencimiento, calidad)
            select id, %s, %s, %s, %s, %s, %s from fondos.fondo where isin = %s
            on conflict (fondo_id, fecha_cartera) do update set tir = excluded.tir, rendimiento = excluded.rendimiento,
              duracion = excluded.duracion, vencimiento = excluded.vencimiento, calidad = excluded.calidad""",
            (fecha, s.get('YieldToMaturity'), s.get('CurrentYield'), s.get('ModifiedDuration'), s.get('EffectiveMaturity'),
             s.get('AverageCreditQualityCode'), isin))

    def guardar_gestion(self, isin: str, gestion: dict):
        """Gestora y equipo gestor en la ficha; si el equipo cambia, una línea en cambio_gestor."""
        from psycopg.types.json import Jsonb
        from .proveedores.morningstar import cambio_gestores
        filas = self._filas('select id, gestores from fondos.fondo where isin = %s', (isin,))
        if not filas:
            return
        fondo_id, antes = filas[0]
        if cambio := cambio_gestores(antes, gestion.get('gestores')):
            self._ejecutar("""
                insert into fondos.cambio_gestor (fondo_id, fecha, entran, salen) values (%s, current_date, %s, %s)
                on conflict (fondo_id, fecha) do update set entran = excluded.entran, salen = excluded.salen""",
                (fondo_id, *cambio))
        self._ejecutar("""
            update fondos.fondo set gestora = coalesce(%s, gestora), gestores = coalesce(%s, gestores) where id = %s""",
            (gestion.get('gestora'), Jsonb(gestion['gestores']) if gestion.get('gestores') else None, fondo_id))

    def guardar_historial_patrimonio(self):
        """Patrimonio de hoy de los fondos del universo (y diarios) en historial_patrimonio, solo si ha cambiado."""
        self._ejecutar("""
            insert into fondos.historial_patrimonio (fondo_id, fecha, patrimonio_meur)
            select f.id, current_date, f.patrimonio_meur
            from fondos.fondo f
            left join lateral (select h.patrimonio_meur from fondos.historial_patrimonio h where h.fondo_id = f.id
                               order by h.fecha desc limit 1) u on true
            where f.patrimonio_meur is not null and (f.en_universo or f.isin in (select isin from fondos.fondo_diario))
              and u.patrimonio_meur is distinct from f.patrimonio_meur
            on conflict (fondo_id, fecha) do update set patrimonio_meur = excluded.patrimonio_meur""")

    def guardar_myinvestor(self, filas: list[dict]):
        """Sustituye el catálogo de MyInvestor entero, en una transacción."""
        with self.cx.transaction(), self.cx.cursor() as c:
            c.execute('delete from fondos.myinvestor')
            c.executemany('insert into fondos.myinvestor (isin, nombre, gestora, ter, minimo, sin_retrocesion, abierto) '
                          'values (%(isin)s, %(nombre)s, %(gestora)s, %(ter)s, %(minimo)s, %(sin_retrocesion)s, %(abierto)s)',
                          filas)

    def resumen_myinvestor(self) -> tuple[int, int]:
        """(fondos del catálogo de MyInvestor con ficha de Morningstar, de ellos en el universo)."""
        return self._filas('select count(f.isin), count(*) filter (where f.en_universo) '
                           'from fondos.myinvestor m left join fondos.fondo f using (isin)')[0]

    def marcar_universo(self, min_patrimonio_meur: float, min_anos: int, tope: int, max_minima: float) -> int:
        return self._filas('select fondos.marcar_universo(%s, %s, %s, %s)',
                           (min_patrimonio_meur, min_anos, tope, max_minima))[0][0]

    def limpiar_valores(self) -> int:
        """Borra los valores de los fondos que ya no están en el universo ni se siguen a diario."""
        return self._filas('select fondos.limpiar_valores()')[0][0]

    def resumen_minimas(self) -> tuple:
        """(fichas con inversión mínima, fichas en total): para saber si Morningstar da el dato."""
        return self._filas('select count(inversion_minima), count(*) from fondos.fondo')[0]

    def marcar_historico_diario(self, isin: str):
        self._ejecutar('update fondos.fondo set historico_diario = true where isin = %s', (isin,))

    def guardar_ticker(self, isin: str, ticker: str):
        self._ejecutar('update fondos.fondo set yahoo_ticker = %s where isin = %s', (ticker, isin))

    def seguir(self, isin: str):
        self._ejecutar('insert into fondos.seguimiento (isin) values (%s) on conflict do nothing', (isin,))

    # ------------------------------------------------------------ valores
    def valores(self, isin: str, desde: dt.date) -> Serie:
        return {f: float(v) for f, v in self._filas(
            'select fecha, valor from fondos.valor_liquidativo where isin = %s and fecha >= %s', (isin, desde))}

    def guardar_valores(self, isin: str, serie: Serie, divisa: str, fuente: str):
        """Mezcla la serie en los paquetes anuales del fondo (la divisa es la de su ficha)."""
        fechas = sorted(serie)
        self._ejecutar('select fondos.guardar_valores(%s, %s::date[], %s::double precision[], %s)',
                       (isin, fechas, [float(serie[f]) for f in fechas], fuente))

    def registrar(self, fuente: str, isin: str | None, estado: str, mensaje: str):
        self._ejecutar('insert into fondos.registro_descarga (fuente, isin, estado, mensaje) values (%s, %s, %s, %s)',
                       (fuente, isin, estado, mensaje[:2000]))

    # ------------------------------------------------------------ BCE
    def divisas(self) -> list[str]:
        return [d for (d,) in self._filas("""
            select distinct f.divisa from fondos.fondo f left join fondos.fondo_diario d using (isin)
            where f.divisa is not null and f.divisa <> 'EUR' and (f.en_universo or d.isin is not null)""")]

    def ultima_fecha_tipo(self, divisa: str) -> dt.date | None:
        return self._filas('select max(fecha) from fondos.tipo_cambio where divisa = %s', (divisa,))[0][0]

    def guardar_tipos(self, divisa: str, serie: dict):
        with self.cx.cursor() as c:
            c.executemany('insert into fondos.tipo_cambio (fecha, divisa, por_eur) values (%s, %s, %s) '
                          'on conflict (fecha, divisa) do update set por_eur = excluded.por_eur',
                          [(f, divisa, v) for f, v in sorted(serie.items())])

    def ultima_fecha_estr(self) -> dt.date | None:
        return self._filas('select max(fecha) from fondos.tipo_interes')[0][0]

    def guardar_estr(self, serie: dict):
        with self.cx.cursor() as c:
            c.executemany('insert into fondos.tipo_interes (fecha, estr) values (%s, %s) '
                          'on conflict (fecha) do update set estr = excluded.estr', sorted(serie.items()))

    # ------------------------------------------------------------ métricas
    def datos_metricas(self) -> dict:
        """Todo lo que necesita calculo.calcular: fondos (universo, diarios y sustitutos), valores, tipos, €STR…"""
        fondos = {isin: {'categoria': cat, 'divisa': div, 'indice_id': iid, 'en_universo': uni, 'fund_id': fid,
                         'ter': None if ter is None else float(ter), 'gestion': ges}
                  for isin, cat, div, iid, uni, fid, ter, ges in self._filas("""
            select f.isin, f.categoria, f.divisa, f.indice_id, f.en_universo, f.fund_id, f.ter, f.gestion
            from fondos.fondo f
            where f.en_universo or f.isin in (select isin from fondos.fondo_diario)""")}
        valores: dict[str, dict] = {}
        # Paquetes anuales en streaming (cursor con nombre): cada fondo se reduce a su último dato de cada semana y de
        # cada mes antes de pasar al siguiente, para no tener en memoria los ~11 millones de valores diarios.
        # los monetarios guardan además sus últimos ~15 meses diarios: su rendimiento reciente (1M) necesita días
        diarios: dict[str, dict] = {}
        desde = dt.date.today() - dt.timedelta(days=460)

        def guardar(isin, dias):
            valores[isin] = reducir(dias)
            if re.search('money market', fondos.get(isin, {}).get('categoria') or '', re.I):
                diarios[isin] = {f: v for f, v in dias.items() if f >= desde}

        actual, dias = None, {}
        with self.cx.transaction(), self.cx.cursor(name='paquetes') as c:
            c.itersize = 500
            c.execute("""select f.isin, a.ano, a.dias, a.valores from fondos.valor_anual a
                         join fondos.fondo f on f.id = a.fondo_id
                         where f.en_universo or f.isin in (select isin from fondos.fondo_diario)
                         order by f.isin, a.ano""")
            for isin, ano, ds, vs in c:
                if isin != actual:
                    if actual:
                        guardar(actual, dias)
                    actual, dias = isin, {}
                inicio = dt.date(ano, 1, 1)
                for d, v in zip(ds, vs):
                    dias[inicio + dt.timedelta(days=d)] = float(v)
            if actual:
                guardar(actual, dias)
        tipos: dict[str, dict] = {}
        for fecha, divisa, por_eur in self._filas('select fecha, divisa, por_eur from fondos.tipo_cambio'):
            tipos.setdefault(divisa, {})[fecha] = float(por_eur)
        estr = {f: float(v) for f, v in self._filas('select fecha, estr from fondos.tipo_interes')}
        indices = {i: {'proxy_isin': p, 'componentes': c}
                   for i, p, c in self._filas('select id, proxy_isin, componentes from fondos.indice')}
        categorias = {cat: {'indice_id': iid, 'metodo': met}
                      for cat, iid, met in self._filas('select categoria, indice_id, metodo from fondos.categoria_referencia')}
        carteras: dict[int, list[str]] = {}
        for cid, isin in self._filas('''select cf.cartera_id, cf.isin from fondos.cartera_fondo cf
                                        join fondos.cartera c on c.id = cf.cartera_id where not c.archivada'''):
            carteras.setdefault(cid, []).append(isin)
        return {'fondos': fondos, 'valores': valores, 'diarios': diarios, 'tipos': tipos, 'estr': estr,
                'indices': indices, 'categorias': categorias, 'carteras': carteras}

    def guardar_metricas(self, filas: list[tuple], refs: dict[str, tuple]):
        """Sustituye todas las métricas y las series de referencia de una vez, en una transacción: nunca se ven a medias
        (truncate no deja filas muertas; mientras dura la carga, las lecturas esperan unos segundos)."""
        with self.cx.transaction(), self.cx.cursor() as c:
            c.execute('truncate fondos.metrica, fondos.referencia_serie')
            with c.copy('copy fondos.metrica (isin, ventana, nombre, valor, percentil) from stdin') as cp:
                for fila in filas:
                    cp.write_row(fila)
            c.executemany('insert into fondos.referencia_serie (clave, semanas, valores_semana, meses, valores_mes) '
                          'values (%s, %s, %s, %s, %s)', [(k, *v) for k, v in refs.items()])

    # ------------------------------------------------------------ estado
    def resumen(self) -> list[tuple]:
        """Por fondo seguido: nombre, isin, nº de valores, primero, último, fuentes, días hábiles del mayor hueco."""
        return self._filas("""
            with v as (
              select isin, fecha, fuente, fecha - lag(fecha) over (partition by isin order by fecha) as salto
              from fondos.valor_liquidativo where isin in (select isin from fondos.fondo_diario))
            select f.nombre, f.isin, count(v.fecha), min(v.fecha), max(v.fecha),
                   string_agg(distinct v.fuente, '+'), coalesce(max(v.salto), 0)
            from fondos.fondo f join fondos.fondo_diario d using (isin)
            left join v using (isin)
            group by f.nombre, f.isin order by f.nombre""")

    # ------------------------------------------------------------ vigilancia (fondos/vigilancia.py)
    def descargas_por_fuente(self, desde: dt.datetime) -> dict[str, int]:
        """Descargas de precios buenas (ok o aviso) por fuente desde `desde`: si Morningstar falla, crece el respaldo."""
        return dict(self._filas("""
            select fuente, count(*)::int from fondos.registro_descarga
            where ts >= %s and estado in ('ok', 'aviso') and fuente in ('morningstar', 'yahoo', 'ft')
              and mensaje not like 'composición%%' group by fuente""", (desde,)))

    def ultimos_precios_carteras(self) -> list[tuple[str, dt.date | None]]:
        """(nombre, fecha del último precio) de cada fondo de mis carteras sin archivar."""
        return self._filas("""
            select f.nombre, (select max(v.fecha) from fondos.valor_liquidativo v where v.isin = f.isin)
            from fondos.fondo f
            where f.isin in (select cf.isin from fondos.cartera_fondo cf join fondos.cartera c on c.id = cf.cartera_id
                             where not c.archivada)
            order by f.nombre""")

    def sin_dato_universo(self) -> tuple[float, float]:
        """Parte del universo sin TER y sin categoría."""
        a, b = self._filas("""select coalesce(avg((ter is null)::int), 0), coalesce(avg((categoria is null)::int), 0)
                              from fondos.fondo where en_universo""")[0]
        return float(a), float(b)

    def ultimo_mensaje(self, fuente: str, prefijo: str) -> str | None:
        f = self._filas("""select mensaje from fondos.registro_descarga where fuente = %s and mensaje like %s
                           order by ts desc limit 1""", (fuente, prefijo + '%'))
        return f[0][0] if f else None

    def borrar_registro_antiguo(self):
        """registro_descarga solo guarda 90 días."""
        self._ejecutar("delete from fondos.registro_descarga where ts < now() - interval '90 days'")

    def guardar_notas(self, lunes: dt.date, notas: list[tuple]):
        """Las notas de la semana del lunes dado (sustituye las que hubiera); se guardan 13 meses."""
        with self.cx.transaction(), self.cx.cursor() as c:
            c.execute('delete from fondos.nota_semanal where fecha = %s or fecha < %s',
                      (lunes, lunes - dt.timedelta(days=400)))
            with c.copy('copy fondos.nota_semanal (fecha, isin, nota, percentil, solo_3a) from stdin') as cp:
                for fila in notas:
                    cp.write_row((lunes, *fila))

    def guardar_diversificacion(self, filas: list[tuple], carteras: dict[int, list[str]]):
        """Sustituye la diversificación de todas las carteras y anota con qué fondos de cada una se calculó (la web
        avisa si la cartera ha cambiado desde entonces). En una transacción, con truncate: mientras dura la carga, las
        lecturas esperan unos segundos."""
        with self.cx.transaction(), self.cx.cursor() as c:
            c.execute('truncate fondos.diversificacion, fondos.diversificacion_base')
            with c.copy('copy fondos.diversificacion (cartera_id, isin, correlacion, percentil) from stdin') as cp:
                for fila in filas:
                    cp.write_row(fila)
            c.executemany('insert into fondos.diversificacion_base (cartera_id, isins) values (%s, %s)',
                          [(cid, sorted(isins)) for cid, isins in carteras.items()])

    def n_metricas(self) -> int:
        return self._filas('select count(*)::int from fondos.metrica')[0][0]

    def errores_recientes(self, horas: int = 36) -> list[tuple]:
        return self._filas("""select ts, fuente, isin, estado, mensaje from fondos.registro_descarga
                              where estado <> 'ok' and ts > now() - make_interval(hours => %s) order by ts desc limit 50""",
                           (horas,))
