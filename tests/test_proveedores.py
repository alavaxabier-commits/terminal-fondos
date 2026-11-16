import datetime as dt

from fondos.proveedores.bce import leer_csv
from fondos.proveedores.ft import leer_tabla
from fondos.proveedores.morningstar import completas, ficha, leer_composicion, leer_posiciones, leer_serie
from fondos.proveedores.yahoo import elegir_ticker

D = dt.date


def test_ficha_del_buscador():
    f = ficha({'SecId': 'F00000T4KE', 'Name': 'iShares Developed World Index Fund (IE) D Acc EUR', 'Isin': 'ie00bd0ncm55',
               'CategoryName': 'RV Global Cap. Grande Blend', 'PriceCurrency': 'EUR', 'OngoingCharge': '0.17',
               'InceptionDate': '2016-11-01T00:00:00', 'FundId': 'FS0000A1B2', 'FundTNAV': 8123456789.0,
               'InitialPurchase': '1000', 'EquityStyleBox': 2, 'AverageMarketCapital': 231738.98,
               'IndexFund': True, 'SRRI': 5})
    assert f == {'isin': 'IE00BD0NCM55', 'nombre': 'iShares Developed World Index Fund (IE) D Acc EUR', 'ms_id': 'F00000T4KE',
                 'fund_id': 'FS0000A1B2', 'patrimonio_meur': 8123.46, 'categoria':'RV Global Cap. Grande Blend', 'divisa': 'EUR', 'ter': 0.17, 'fecha_lanzamiento': D(2016, 11, 1),
                 'inversion_minima': 1000.0, 'estilo_rv': 2, 'estilo_rf': None, 'capitalizacion_media': 231738.98,
                 'duracion_efectiva': None, 'vencimiento_efectivo': None, 'calidad_media': None,
                 'gestion': 'indexada', 'srri': 5}
    assert ficha({'Isin': 'IE00BD0NCM55', 'IndexFund': False, 'SRRI': 9})['gestion'] == 'activa'
    assert ficha({'Isin': 'IE00BD0NCM55', 'SRRI': 9})['srri'] is None and ficha({'Isin': 'IE00BD0NCM55'})['gestion'] is None
    assert ficha({'Isin': 'corto'}) is None
    assert ficha({'Isin': 'IE00BD0NCM55'})['ter'] is None


def test_leer_serie_morningstar_compactjson_y_json():
    ms = int(dt.datetime(2026, 11, 2, tzinfo=dt.timezone.utc).timestamp() * 1000)
    assert leer_serie([[ms, 12.3456789], [ms + 86400000, None], ['x', 1], 'basura']) == {D(2026, 11, 2): 12.345679}
    js = {'TimeSeries': {'Security': [{'HistoryDetail': [{'EndDate': '2026-11-02', 'Value': '10.5'},
                                                         {'EndDate': '2026-11-03', 'Value': '0'}]}]}}
    assert leer_serie(js) == {D(2026, 11, 2): 10.5}
    assert leer_serie(None) == {} and leer_serie({}) == {}


def test_leer_tabla_ft():
    t = ('Date Open High Low Close Volume Thursday, November 12, 2026 Thu, Nov 12, 2026 '
         '1,234.56 1,234.56 1,234.56 1,234.56 -- Wednesday, November 11, 2026 Wed, Nov 11, 2026 12.30 12.30 12.30 12.31 --')
    assert leer_tabla(t) == {D(2026, 11, 12): 1234.56, D(2026, 11, 11): 12.31}


def test_leer_csv_bce():
    texto = 'KEY,FREQ,CURRENCY,TIME_PERIOD,OBS_VALUE\nEXR.D.USD.EUR.SP00.A,D,USD,2026-11-09,1.0712\nEXR.D.USD.EUR.SP00.A,D,USD,2026-11-10,\n'
    assert leer_csv(texto) == {D(2026, 11, 9): 1.0712}


def test_elegir_ticker_exige_coincidencia_y_dias():
    ref = {D(2026, 10, d): 100.0 + d for d in range(1, 11)}
    buena = {d: v * 1.0005 for d, v in ref.items()}           # 0,05 %: vale
    otra_clase = {d: v * 1.02 for d, v in ref.items()}         # 2 %: otra clase del fondo
    pocos = {d: v for d, v in list(ref.items())[:3]}           # exacto pero solo 3 días
    assert elegir_ticker({'MALA.F': otra_clase, 'BUENA.F': buena, 'POCOS.F': pocos}, ref) == 'BUENA.F'
    assert elegir_ticker({'MALA.F': otra_clase}, ref) is None


def test_leer_composicion_netos_y_posiciones():
    bd = lambda lado, vals, **k: {'SalePosition': lado, 'BreakdownValues': [{'Type': t, 'Value': v} for t, v in vals.items()], **k}
    datos = [{'Portfolios': [
        {'Date': '2026-09-30T00:00:00', 'Holdings': 'Suppressed', 'TotalMarketValues': []},  # la primera no trae desgloses
        {'Date': '2026-09-30T00:00:00',
         'AssetAllocations': [
             bd('N', {'1': 44.1, '3': 23.0, '7': 32.9, '8': 0.0}, Type='MorningStarDefault'),
             bd('L', {'1': 159.0, '3': 23.0, '7': 164.9}, Type='MorningStarDefault'),
             bd('S', {'1': 114.9, '7': 132.0}, Type='MorningStarDefault'),
             bd('N', {'1': 99.0}, Type='MorningstarEUR3')],
         'RegionalExposure': [bd('L', {'1': 80.0}), bd('N', {'1': 72.7, '5': 7.97}, NotClassified=1.34)],
         'CountryExposure': [bd('N', {'USA': 70.0}, Type='Equity'), bd('N', {'DEU': 12.0}, Type='Bond')],
         'GlobalStockSectorBreakdown': [bd('N', {'311': 32.5, '103': 15.5})],
         'EquityStatistics': {'StyleBox': 2},
         'BondStatistics': {'YieldToMaturity': 2.73107, 'AverageCoupon': 3.43967, 'ModifiedDuration': 0.01},
         'BondStyleBoxBreakdown': [bd('N', {'4': 100.0, '1': 0.0})],
         'HoldingAggregates': [{'NumberOfHolding': 204, 'SalePosition': 'N'}, {'NumberOfHolding': 1, 'SalePosition': 'N', 'HoldingsType': 'Stock'},
                               {'NumberOfHolding': 9, 'SalePosition': 'S'}],
         'PortfolioHoldings': [{'SecurityName': 'NVIDIA Corp', 'ISIN': 'US67066G1040', 'Weighting': 5.73, 'DetailHoldingTypeId': 'E',
                                'GlobalSectorId': '311', 'CountryId': 'USA', 'MarketValue': 1e9}]}]}]
    fecha, x = leer_composicion(datos)
    assert fecha == D(2026, 9, 30)
    assert x['activos'] == {'neto': {'1': 44.1, '3': 23.0, '7': 32.9}, 'largo': {'1': 159.0, '3': 23.0, '7': 164.9},
                            'corto': {'1': 114.9, '7': 132.0}}
    assert x['regiones'] == {'1': 72.7, '5': 7.97, 'nc': 1.34}
    assert x['paises_rv'] == {'USA': 70.0} and x['paises_rf'] == {'DEU': 12.0}
    assert x['sectores_rv'] == {'311': 32.5, '103': 15.5}
    assert x['estadisticas_rv'] == {'StyleBox': 2}
    assert x['estadisticas_rf'] == {'YieldToMaturity': 2.73107, 'AverageCoupon': 3.43967, 'ModifiedDuration': 0.01}
    assert x['estilo_rf'] == {'4': 100.0}
    assert x['n_posiciones'] == {'total': 204, 'Stock': 1}
    assert x['posiciones'] == [{'nombre': 'NVIDIA Corp', 'isin': 'US67066G1040', 'peso': 5.73, 'tipo': 'E', 'sector': '311', 'pais': 'USA'}]
    assert 'calidad_rf' not in x
    assert leer_composicion([{'Portfolios': [{'Date': '2026-09-30'}]}]) == (None, {})
    assert leer_composicion({}) == (None, {})


def test_leer_posiciones_todas_las_paginas():
    datos = {'numberOfHolding': 3,
             'equityHoldingPage': {'holdingList': [{'securityName': 'NVIDIA Corp ', 'isin': 'US67066G1040', 'weighting': 5.72767, 'holdingTypeId': 'E',
                                                    'sector': 'Technology', 'country': 'United States'},
                                                   {'securityName': 'Intesa San', 'weighting': -0.0, 'holdingTypeId': 'E'}]},
             'boldHoldingPage': {'holdingList': [{'securityName': 'Korea 2.625%', 'isin': 'KR103502GF62', 'weighting': '4.73955', 'holdingTypeId': 'BT',
                                                  'sector': None, 'primarySectorName': 'government', 'country': 'South Korea'},
                                                 {'securityName': 'Bund future', 'weighting': -1.5, 'holdingTypeId': 'FU'}]},
             'otherHoldingPage': {'holdingList': []}}
    assert leer_posiciones(datos) == [
        {'nombre': 'NVIDIA Corp', 'isin': 'US67066G1040', 'peso': 5.7277, 'tipo': 'E', 'sector': 'Technology', 'pais': 'United States'},
        {'nombre': 'Korea 2.625%', 'isin': 'KR103502GF62', 'peso': 4.7396, 'tipo': 'BT', 'sector': 'government', 'pais': 'South Korea'},
        {'nombre': 'Bund future', 'peso': -1.5, 'tipo': 'FU'}]
    assert leer_posiciones({'numberOfHolding': 0}) is None
    assert leer_posiciones([]) is None


def test_completas_si_trae_casi_todas():
    diez = [{'peso': 1}] * 10
    assert not completas(diez, {'total': 2428, 'Stock': 1814})  # fondo que solo publica las 10 mayores
    assert completas(diez, {'total': 10})
    assert completas([{'peso': 1}] * 8, {'total': 9})          # alguna línea sin peso descartada
    assert completas(diez, None) and completas(diez, {})        # sin recuento: se da por buena


def test_myinvestor_token_y_filas():
    from fondos.proveedores.myinvestor import filas, token
    js = 'let e={tipo:t,token:"a2e8e18ad26a079c576038f0ad4fa18ce0d9__"};get("/cperf-server/rest/public/fondos/find-fondos",{query:e})'
    assert token(js) == 'a2e8e18ad26a079c576038f0ad4fa18ce0d9__'
    assert token('const token:"a2e8e18ad26a079c576038f0ad4fa18ce0d9__"') is None  # otro script, sin find-fondos
    cat = [{'codigoIsin': 'LU0826452848', 'nombre': 'DWS Hi Conv LC', 'entidadGestora': 'DWS', 'ter': 1.6,
            'impMinPrimeraSubs': '1 EUR', 'sinRetrocesion': False, 'status': 'OPEN', 'tipoProductoEnum': 'FONDOS_INVERSION'},
           {'codigoIsin': 'X1', 'nombre': 'Cerrado', 'status': 'SOFT_CLOSED', 'tipoProductoEnum': 'FONDOS_INDEXADOS'},
           {'codigoIsin': 'N5572', 'nombre': 'Plan', 'status': 'OPEN', 'tipoProductoEnum': 'PENSIONES'}]
    assert filas(cat) == [{'isin': 'LU0826452848', 'nombre': 'DWS Hi Conv LC', 'gestora': 'DWS', 'ter': 1.6, 'minimo': '1 EUR',
                           'sin_retrocesion': False, 'abierto': True},
                          {'isin': 'X1', 'nombre': 'Cerrado', 'gestora': None, 'ter': None, 'minimo': None,
                           'sin_retrocesion': None, 'abierto': False}]


def test_sesion_intervalo_minimo_y_freno(monkeypatch):
    import pytest
    import requests
    from fondos.proveedores import morningstar as m

    reloj, esperas, codigos = [100.0], [], [200, 200, 403, 200, 429, 403, 429]

    class R:
        def __init__(self, c):
            self.status_code, self.url = c, 'https://x/y?z=1'

    def peticion(self, *a, **k):
        reloj[0] += 0.4  # la respuesta tarda 0,4 s
        return R(codigos.pop(0))

    def dormir(s):
        esperas.append(round(s, 2))
        reloj[0] += s

    monkeypatch.setattr(requests.Session, 'request', peticion)
    monkeypatch.setattr(m.time, 'monotonic', lambda: reloj[0])
    monkeypatch.setattr(m.time, 'sleep', dormir)
    s = m.Sesion(intervalo=1.5, espera=30, max_rechazos=3)
    s.get('a'); s.get('a')
    assert esperas == [0.0, 1.1]          # solo lo que falta hasta 1,5 s, no 1,5 s más
    s.get('a'); s.get('a')                # un 403 suelto: espera y el siguiente correcto pone el contador a cero
    assert esperas[2:] == [1.1, 30, 0.0] and s.rechazos == 0  # tras la espera de 30 s ya no hace falta más
    s.get('a'); s.get('a')
    with pytest.raises(m.Bloqueo, match='429 3 veces'):
        s.get('a')


def test_gestora_y_equipo_gestor():
    from fondos.proveedores.morningstar import cambio_gestores, leer_gestion
    d = [{'BrandingCompanyName': 'BNY Mellon', 'ProviderCompany': {'Name': 'BNY Mellon Fund Management (Lux) S.A.'},
          'ManagerList': [{'GivenName': 'Shaun', 'FamilyName': 'Casey', 'StartDate': '2021-12-03T00:00:00'},
                          {'GivenName': 'Harvey', 'FamilyName': 'Bradley', 'StartDate': '2021-12-03T00:00:00'},
                          {'GivenName': ' ', 'FamilyName': None}]}]
    g = leer_gestion(d)
    assert g == {'gestora': 'BNY Mellon', 'gestores': [{'nombre': 'Harvey Bradley', 'desde': '2021-12-03'},
                                                      {'nombre': 'Shaun Casey', 'desde': '2021-12-03'}]}
    assert leer_gestion({'ProviderCompany': {'Name': 'X S.A.'}}) == {'gestora': 'X S.A.', 'gestores': None}
    assert leer_gestion(None) == {'gestora': None, 'gestores': None}
    nuevo = [{'nombre': 'Harvey Bradley'}, {'nombre': 'Harry Jones'}]
    assert cambio_gestores(g['gestores'], nuevo) == (['Harry Jones'], ['Shaun Casey'])
    assert cambio_gestores(g['gestores'], g['gestores']) is None
    assert cambio_gestores(None, nuevo) is None and cambio_gestores(nuevo, None) is None
