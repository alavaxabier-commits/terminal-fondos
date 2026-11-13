import datetime as dt

from fondos.analisis import cortes, evaluar, informe, tipo


def test_cortes_semestrales():
    assert cortes(dt.date(2019, 6, 30), dt.date(2020, 11, 1)) == [dt.date(2019, 6, 30), dt.date(2019, 12, 31), dt.date(2020, 6, 30)]
    assert tipo('EUR Moderate Allocation') == 'mixto' and tipo('Global Large-Cap Blend Equity') == 'renta variable'


def test_un_bloque_que_acierta_y_otro_que_no():
    fondos = {f'F{i}': {'categoria': 'Global Large-Cap Blend Equity', 'en_universo': True, 'ter': 1.0, 'fund_id': f'F{i}'} for i in range(10)}
    # el coste ordena igual que el futuro; la rentabilidad, al revés
    antes = {i: {'bloques': {'coste': k * 10, 'rentabilidad': 100 - k * 10}, 'valores': {}} for k, i in enumerate(fondos)}
    despues = {i: {'bloques': {}, 'valores': {('3a', 'rentabilidad'): k / 100}} for k, i in enumerate(fondos)}
    # otra clase del mismo fondo (más cara): no cuenta dos veces
    fondos['F9b'] = {**fondos['F9'], 'ter': 2.0, 'fund_id': 'F9'}
    antes['F9b'], despues['F9b'] = antes['F9'], despues['F9']
    r = evaluar(antes, despues, fondos, 3, 'rentabilidad')
    c, top, n = r[('bloque coste', 'todos')]
    assert round(c, 6) == 1 and top == 94.45 and n == 10  # el top 20 % son los dos mejores: percentiles 100 y 88,9
    assert round(r[('bloque rentabilidad', 'renta variable')][0], 6) == -1
    assert '| bloque coste | +1.00 | 94.5 | 1/1 |' in informe({(dt.date(2020, 6, 30), 3, 'rentabilidad'): r})
