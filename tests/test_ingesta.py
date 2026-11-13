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

    def historico(self, isin, ms_id, desde, hasta, divisa=None):
        self.pedido = (desde, hasta)
        if self.error:
            raise RuntimeError(self.error)
        return {f: v for f, v in self.serie.items() if desde <= f <= hasta}


class YahooFalso:
    def __init__(self, serie=None, ticker='0P0001AINF.F'):
        self.serie, self.ticker, self.referencia = serie or {}, ticker, None

    def buscar_verificado(self, isin, nombre, referencia, hoy):
        self.referencia = referencia
        return self.ticker if len(referencia) >= 5 else None

    def historico(self, ticker, desde, hasta):
        return {f: v for f, v in self.serie.items() if desde <= f <= hasta}


class FTFalso:
    def __init__(self, serie=None, error=None):
        self.serie, self.error, self.llamadas = serie or {}, error, 0

    def historico(self, isin, divisa):
        self.llamadas += 1
        if self.error:
            raise RuntimeError(self.error)
        return dict(self.serie)


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
    assert descargar_fondo(fondo(), 'carga', HOY, repo, ms, YahooFalso(), FTFalso()) == 'ok'
    assert ms.pedido == (D(2016, 11, 18), HOY)
    assert repo.fuente == 'morningstar' and min(repo.guardado) == D(2016, 11, 18)
    assert repo.registro[-1][2] == 'ok'


def test_universo_guarda_todos_los_dias():
    ms = MSFalso(serie_diaria(D(2026, 10, 1), D(2026, 11, 17)))
    repo = RepoFalso()
    descargar_fondo(fondo(diaria=False), 'carga', HOY, repo, ms, YahooFalso(), FTFalso())
    assert repo.guardado == ms.serie                                # nada se reduce al guardar


def test_si_morningstar_falla_usa_yahoo_verificado():
    guardado = serie_diaria(D(2026, 8, 1), D(2026, 11, 10))
    repo = RepoFalso(guardado)
    yh = YahooFalso(serie_diaria(D(2026, 11, 1), D(2026, 11, 17)))
    estado = descargar_fondo(fondo(ultima=D(2026, 11, 10), n=250), 'actualizar', HOY, repo, MSFalso(error='403'), yh, FTFalso())
    assert estado == 'ok'
    assert repo.fuente == 'yahoo' and repo.tickers == {'IE00BD0NCM55': '0P0001AINF.F'}
    assert 'Morningstar: 403' in repo.registro[-1][3]


def test_sin_ninguna_fuente_queda_error():
    repo = RepoFalso()
    estado = descargar_fondo(fondo(), 'carga', HOY, repo, MSFalso(error='caído'), YahooFalso(), FTFalso())
    assert estado == 'error'
    assert repo.registro == [('ingesta', 'IE00BD0NCM55', 'error',
                              'Morningstar: caído; Yahoo: sin ticker verificado (sin referencia)')]


def test_salto_sospechoso_se_guarda_con_aviso():
    s = serie_diaria(D(2026, 11, 2), D(2026, 11, 17))
    s[D(2026, 11, 10)] = s[D(2026, 11, 9)] * 1.3
    repo = RepoFalso()
    assert descargar_fondo(fondo(), 'carga', HOY, repo, MSFalso(s), YahooFalso(), FTFalso()) == 'aviso'
    assert 'salto de +30.0%' in repo.registro[-1][3]


def test_precios_cuenta_resultados():
    class RepoPlan(RepoFalso):
        def fondos_para_ingesta(self):
            return [fondo(), fondo('IE0000000002')]
    ms = MSFalso(serie_diaria(D(2026, 11, 2), D(2026, 11, 17)))
    c = ingesta.precios(RepoPlan(), ms, YahooFalso(), FTFalso(), HOY, log=lambda *_: None)
    assert c == {'ok': 2, 'aviso': 0, 'error': 0}


def test_carga_sin_morningstar_verifica_yahoo_contra_el_ft():
    ft = FTFalso(serie_diaria(D(2026, 10, 19), D(2026, 11, 17)))
    yh = YahooFalso(serie_diaria(D(2016, 11, 18), D(2026, 11, 17)))
    repo = RepoFalso()
    assert descargar_fondo(fondo(), 'carga', HOY, repo, MSFalso(error='401'), yh, ft) == 'ok'
    assert repo.fuente == 'yahoo' and yh.referencia == ft.serie         # sin nada guardado, la referencia es el FT
    assert min(repo.guardado) == D(2016, 11, 18)


def test_actualizar_con_ft_si_fallan_morningstar_y_yahoo():
    ft = FTFalso(serie_diaria(D(2026, 10, 19), D(2026, 11, 17)))
    repo = RepoFalso()
    f = fondo(ultima=D(2026, 11, 13), n=250)
    yh = YahooFalso(ticker=None)
    assert descargar_fondo(f, 'actualizar', HOY, repo, MSFalso(error='401'), yh, ft) == 'ok'
    assert repo.fuente == 'ft' and min(repo.guardado) == D(2026, 11, 6)   # desde la última fecha menos 7 días
    assert ft.llamadas == 1                                             # una sola visita al FT por fondo


def test_carga_no_usa_ft_como_historico():
    repo = RepoFalso()
    ft = FTFalso(serie_diaria(D(2026, 10, 19), D(2026, 11, 17)))
    assert descargar_fondo(fondo(), 'carga', HOY, repo, MSFalso(error='401'), YahooFalso(ticker=None), ft) == 'error'


def test_serie_semanal_antigua_se_recarga_una_vez_con_todos_los_dias():
    f = FondoIngesta('LU0000000001', 'Fondo', 'F1', None, 'EUR', False, D(2026, 11, 13), 52, historico_diario=False)
    assert accion(f, HOY) == 'carga'

    class RepoMarca(RepoFalso):
        marcados = []
        def marcar_historico_diario(self, isin):
            self.marcados.append(isin)

    repo = RepoMarca()
    descargar_fondo(f, 'carga', HOY, repo, MSFalso(serie_diaria(D(2026, 8, 3), D(2026, 11, 17))), YahooFalso(), FTFalso())
    assert repo.marcados == ['LU0000000001']
    assert D(2026, 9, 30) in repo.guardado and D(2026, 11, 11) in repo.guardado   # miércoles: todos los días
    f.historico_diario = True
    f.ultima = D(2026, 11, 13)
    assert accion(f, HOY) is None                                                # ya al día hasta el lunes que viene


def test_reducir_para_metricas():
    from fondos.db import reducir
    serie = serie_diaria(D(2026, 9, 28), D(2026, 11, 17))
    r = reducir(serie)
    assert D(2026, 9, 30) in r                       # cierre de septiembre (miércoles)
    assert D(2026, 10, 2) in r and D(2026, 10, 1) not in r   # viernes sí, jueves no
    assert D(2026, 11, 17) in r                      # el último dato siempre
