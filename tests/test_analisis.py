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


def test_reparto_por_tipo():
    from fondos.analisis import puntuaciones
    b = {'coste': 100, 'riesgo': 0, 'consistencia': 0, 'proteccion': 0, 'rentabilidad': 0}
    assert puntuaciones(b, 'renta variable')['por tipo'] == 60
    assert puntuaciones(b, 'renta fija')['por tipo'] == 30
    assert puntuaciones(b, 'otros')['por tipo'] == puntuaciones(b, 'otros')['actual']


def test_plazos():
    from fondos.analisis import puntuaciones
    v = {'1a': {'coste': 10}, '3a': {'coste': 40}, '5a': {'coste': 70}}
    p = puntuaciones({'coste': 70}, 'renta variable', v)
    assert (p['plazo 1a'], p['plazo 3a+5a'], p['plazo 1a+3a+5a']) == (10, 55, 40)
    assert 'plazo 1a' not in puntuaciones({'coste': 70}, 'renta variable', {})


def test_repartos_y_validacion():
    from fondos.analisis import mejores, repartos, validar
    rs = repartos()
    assert len(rs) == 1001 and all(sum(r.values()) == 100 for r in rs)
    # 10 fondos de renta variable: el coste ordena igual que el futuro en todos los cortes; la rentabilidad, al revés
    fondos = {f'F{i}': {'categoria': 'Global Large-Cap Blend Equity', 'en_universo': True, 'ter': 1.0, 'fund_id': f'F{i}'} for i in range(10)}
    grupo = [[({'coste': k * 10, 'rentabilidad': 100 - k * 10}, k * 10) for k in range(10)]]
    assert mejores(grupo, {'coste': 100}) == [90, 80] and mejores(grupo, {'rentabilidad': 100}) == [0, 10]
    fotos = {}
    for c in cortes(dt.date(2019, 12, 31), dt.date(2024, 12, 31)):
        fotos[c] = {i: {'bloques': {'coste': k * 10, 'rentabilidad': 100 - k * 10, 'riesgo': 50},
                        'valores': {('1a', 'rentabilidad'): k, ('1a', 'sharpe'): k, ('1a', 'max_caida'): -k,
                                    ('3a', 'rentabilidad'): k, ('3a', 'sharpe'): k, ('3a', 'max_caida'): -k}}
                    for k, i in enumerate(fondos)}
    texto = validar(fotos, fondos, dt.date(2022, 6, 30))
    assert '| renta variable | 0 | 0 | 10 | 90 | 0 |' in texto  # sin protección en los datos: equivale a solo coste
    assert '| elegido en el entreno | 94.5 | 4/4 | 94.5 |' in texto and '| renta fija |' in texto
