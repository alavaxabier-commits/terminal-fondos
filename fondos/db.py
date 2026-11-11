"""Acceso a Postgres (Supabase) con conexión directa. La URL va en la variable DATABASE_URL."""
from __future__ import annotations

import datetime as dt
import os
import sys

from .ingesta import FondoIngesta
from .validacion import Serie


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
                   v.ultima, coalesce(v.n_anyo, 0)
            from fondos.fondo f
            left join fondos.fondo_diario d using (isin)
            left join lateral (
              select max(fecha) as ultima, count(*) filter (where fecha > current_date - 365) as n_anyo
              from fondos.valor_liquidativo where isin = f.isin) v on true
            where f.en_universo or d.isin is not null""")
        return [FondoIngesta(*f) for f in filas]

    def guardar_fondo(self, f: dict):
        self._ejecutar("""
            insert into fondos.fondo (isin, nombre, ms_id, fund_id, categoria, divisa, ter, fecha_lanzamiento, patrimonio_meur)
            values (%(isin)s, %(nombre)s, %(ms_id)s, %(fund_id)s, %(categoria)s, %(divisa)s, %(ter)s,
                    %(fecha_lanzamiento)s, %(patrimonio_meur)s)
            on conflict (isin) do update set
              nombre = excluded.nombre,
              ms_id = coalesce(excluded.ms_id, fondo.ms_id),
              fund_id = coalesce(excluded.fund_id, fondo.fund_id),
              patrimonio_meur = coalesce(excluded.patrimonio_meur, fondo.patrimonio_meur),
              categoria = coalesce(excluded.categoria, fondo.categoria),
              divisa = coalesce(excluded.divisa, fondo.divisa),
              ter = coalesce(excluded.ter, fondo.ter),
              fecha_lanzamiento = coalesce(excluded.fecha_lanzamiento, fondo.fecha_lanzamiento),
              actualizado_en = now()""", f)

    def marcar_universo(self, min_patrimonio_meur: float, min_anos: int, tope: int) -> int:
        return self._filas('select fondos.marcar_universo(%s, %s, %s)', (min_patrimonio_meur, min_anos, tope))[0][0]

    def guardar_ticker(self, isin: str, ticker: str):
        self._ejecutar('update fondos.fondo set yahoo_ticker = %s where isin = %s', (ticker, isin))

    def seguir(self, isin: str):
        self._ejecutar('insert into fondos.seguimiento (isin) values (%s) on conflict do nothing', (isin,))

    # ------------------------------------------------------------ valores
    def valores(self, isin: str, desde: dt.date) -> Serie:
        return {f: float(v) for f, v in self._filas(
            'select fecha, valor from fondos.valor_liquidativo where isin = %s and fecha >= %s', (isin, desde))}

    def guardar_valores(self, isin: str, serie: Serie, divisa: str, fuente: str):
        with self.cx.cursor() as c:
            c.executemany("""
                insert into fondos.valor_liquidativo (isin, fecha, valor, divisa, fuente) values (%s, %s, %s, %s, %s)
                on conflict (isin, fecha) do update set valor = excluded.valor, divisa = excluded.divisa, fuente = excluded.fuente""",
                [(isin, f, v, divisa, fuente) for f, v in sorted(serie.items())])

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

    # ------------------------------------------------------------ estado
    def resumen(self) -> list[tuple]:
        """Por fondo seguido: nombre, isin, nº de valores, primero, último, fuentes, días hábiles del mayor hueco."""
        return self._filas("""
            with v as (
              select isin, fecha, fuente, fecha - lag(fecha) over (partition by isin order by fecha) as salto
              from fondos.valor_liquidativo)
            select f.nombre, f.isin, count(v.fecha), min(v.fecha), max(v.fecha),
                   string_agg(distinct v.fuente, '+'), coalesce(max(v.salto), 0)
            from fondos.fondo f join fondos.fondo_diario d using (isin)
            left join v using (isin)
            group by f.nombre, f.isin order by f.nombre""")

    def errores_recientes(self, horas: int = 36) -> list[tuple]:
        return self._filas("""select ts, fuente, isin, estado, mensaje from fondos.registro_descarga
                              where estado <> 'ok' and ts > now() - make_interval(hours => %s) order by ts desc limit 50""",
                           (horas,))
