import datetime as dt

from fondos import ingesta
from fondos.ingesta import FondoIngesta, accion, descargar_fondo, planificar

D = dt.date
HOY = D(2026, 11, 18)  # miércoles


def fondo(isin='IE00BD0NCM55', diaria=True, ultima=None, n=0, ticker=None):
    return FondoIngesta(isin, 'Fondo de prueba', 'F0001', ticker, 'EUR', diaria, ultima, n)


def serie_diaria(desde, hasta, valor=100.0):
    d, out = desde, {}
    while d <= hasta:
        if d.weekday() < 5:
            out[d] = valor
            valor *= 1.001
        d += dt.timedelta(days=1)
    return out


class RepoFalso:
    def __init__(self, guardado=None):
        self.guardado = dict(guardado or {})
        self.registro, self.tickers = [], {}

    def valores(self, isin, desde):
        return {f: v for f, v in self.guardado.items() if f >= desde}

    def guardar_valores(self, isin, serie, divisa, fuente):
        self.guardado.update(serie)
        self.fuente = fuente

    def guardar_ticker(self, isin, ticker):
        self.tickers[isin] = ticker

    def registrar(self, fuente, isin, estado, mensaje):
        self.registro.append((fuente, isin, estado, mensaje))


class MSFalso:
    def __init__(self, serie=None, error=None):
        self.serie, self.error, self.pedido = serie or {}, error, None

    def historico(self, isin, ms_id, desde, hasta):
        self.pedido = (desde, hasta)
        if self.error:
            raise RuntimeError(self.error)
        return {f: v for f, v in self.serie.items() if desde <= f <= hasta}


class YahooFalso:
    def __init__(self, serie=None, ticker='0P0001AINF.F'):
        self.serie, self.ticker = serie or {}, ticker

    def buscar_verificado(self, isin, nombre, referencia, hoy):
        return self.ticker if referencia else None

    def historico(self, ticker, desde, hasta):
        return {f: v for f, v in self.serie.items() if desde <= f <= hasta}


# ------------------------------------------------------------------ qué toca hoy
def test_accion():
    assert accion(fondo(ultima=None), HOY) == 'carga'
    assert accion(fondo(ultima=D(2026, 11, 17), n=250), HOY) is None              # diario al día
    assert accion(fondo(ultima=D(2026, 11, 16), n=250), HOY) == 'actualizar'
    assert accion(fondo(ultima=D(2026, 11, 17), n=52), HOY) == 'carga'            # pasó de semanal a diario
    assert accion(fondo(diaria=False, ultima=D(2026, 11, 13)), HOY) is None       # ya tiene la semana pasada
    assert accion(fondo(diaria=False, ultima=D(2026, 11, 6)), HOY) == 'actualizar'


def test_planificar_diarios_primero_y_tanda_de_cargas():
    fondos = ([fondo(f'LU{i:010d}', diaria=False) for i in range(5)] +
              [fondo('IE0000000001', diaria=True), fondo('IE0000000002', diaria=False, ultima=D(2026, 11, 6))])
    plan = planificar(fondos, HOY, tanda=3)
    assert plan[0][0].isin == 'IE0000000001'                        # diario primero
    assert plan[1] == (fondos[-1], 'actualizar')                     # luego actualizaciones
    assert sum(1 for _, a in plan if a == 'carga') == 3              # cargas limitadas a la tanda


# ------------------------------------------------------------------ descarga de un fondo
def test_carga_diaria_desde_morningstar_trae_10_anos():
    ms = MSFalso(serie_diaria(D(2016, 1, 1), D(2026, 11, 17)))
    repo = RepoFalso()
    assert descargar_fondo(fondo(), 'carga', HOY, repo, ms, YahooFalso()) == 'ok'
    assert ms.pedido == (D(2016, 11, 18), HOY)
    assert repo.fuente == 'morningstar' and min(repo.guardado) == D(2016, 11, 18)
    assert repo.registro[-1][2] == 'ok'


def test_semanal_guarda_un_valor_por_semana_cerrada():
    ms = MSFalso(serie_diaria(D(2026, 10, 1), D(2026, 11, 17)))
    repo = RepoFalso()
    descargar_fondo(fondo(diaria=False), 'carga', HOY, repo, ms, YahooFalso())
    fechas = sorted(repo.guardado)
    assert all(f.weekday() == 4 for f in fechas)                   # viernes
    assert fechas[-1] == D(2026, 11, 13)                            # la semana en curso no entra


def test_si_morningstar_falla_usa_yahoo_verificado():
    guardado = serie_diaria(D(2026, 8, 1), D(2026, 11, 10))
    repo = RepoFalso(guardado)
    yh = YahooFalso(serie_diaria(D(2026, 11, 1), D(2026, 11, 17)))
    estado = descargar_fondo(fondo(ultima=D(2026, 11, 10), n=250), 'actualizar', HOY, repo, MSFalso(error='403'), yh)
    assert estado == 'ok'
    assert repo.fuente == 'yahoo' and repo.tickers == {'IE00BD0NCM55': '0P0001AINF.F'}
    assert 'Morningstar: 403' in repo.registro[-1][3]


def test_sin_ninguna_fuente_queda_error():
    repo = RepoFalso()
    estado = descargar_fondo(fondo(), 'carga', HOY, repo, MSFalso(error='caído'), YahooFalso())
    assert estado == 'error'
    assert repo.registro == [('ingesta', 'IE00BD0NCM55', 'error', 'Morningstar: caído; Yahoo: sin ticker verificado')]


def test_salto_sospechoso_se_guarda_con_aviso():
    s = serie_diaria(D(2026, 11, 2), D(2026, 11, 17))
    s[D(2026, 11, 10)] = s[D(2026, 11, 9)] * 1.3
    repo = RepoFalso()
    assert descargar_fondo(fondo(), 'carga', HOY, repo, MSFalso(s), YahooFalso()) == 'aviso'
    assert 'salto de +30.0%' in repo.registro[-1][3]


def test_precios_cuenta_resultados():
    class RepoPlan(RepoFalso):
        def fondos_para_ingesta(self):
            return [fondo(), fondo('IE0000000002')]
    ms = MSFalso(serie_diaria(D(2026, 11, 2), D(2026, 11, 17)))
    c = ingesta.precios(RepoPlan(), ms, YahooFalso(), HOY, pausa=0, log=lambda *_: None)
    assert c == {'ok': 2, 'aviso': 0, 'error': 0}
