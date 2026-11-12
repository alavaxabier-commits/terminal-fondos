import datetime as dt

from fondos.proveedores.bce import leer_csv
from fondos.proveedores.ft import leer_tabla
from fondos.proveedores.morningstar import ficha, leer_serie
from fondos.proveedores.yahoo import elegir_ticker

D = dt.date


def test_ficha_del_buscador():
    f = ficha({'SecId': 'F00000T4KE', 'Name': 'iShares Developed World Index Fund (IE) D Acc EUR', 'Isin': 'ie00bd0ncm55',
               'CategoryName': 'RV Global Cap. Grande Blend', 'PriceCurrency': 'EUR', 'OngoingCharge': '0.17',
               'InceptionDate': '2016-11-01T00:00:00', 'FundId': 'FS0000A1B2', 'FundTNAV': 8123456789.0,
               'InitialPurchase': '1000'})
    assert f == {'isin': 'IE00BD0NCM55', 'nombre': 'iShares Developed World Index Fund (IE) D Acc EUR', 'ms_id': 'F00000T4KE',
                 'fund_id': 'FS0000A1B2', 'patrimonio_meur': 8123.46, 'categoria':'RV Global Cap. Grande Blend', 'divisa': 'EUR', 'ter': 0.17, 'fecha_lanzamiento': D(2016, 11, 1),
                 'inversion_minima': 1000.0}
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
