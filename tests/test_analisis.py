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


def test_comparar_propios():
    from fondos.analisis import comparar_propios
    fondos = {f'F{i}': {'categoria': 'EUR Money Market', 'en_universo': True, 'ter': 0.1, 'fund_id': f'F{i}'} for i in range(10)}
    fotos = {}
    for c in cortes(dt.date(2019, 12, 31), dt.date(2023, 12, 31)):
        fotos[c] = {i: {'bloques': {'rentabilidad': k * 10}, 'sin_propios': {'rentabilidad': 100 - k * 10}, 'indexada': False,
                        'valores': {('1a', 'rentabilidad'): k, ('1a', 'sharpe'): k, ('1a', 'max_caida'): -k,
                                    ('3a', 'rentabilidad'): k, ('3a', 'sharpe'): k, ('3a', 'max_caida'): -k}}
                    for k, i in enumerate(fondos)}
    texto = comparar_propios(fotos, fondos, dt.date(2022, 6, 30))
    assert '| sin bloques propios | — | — | — | 5.5 (2) | — |' in texto
    assert '| con bloques propios | — | — | — | 94.5 (2) | — |' in texto


def test_nota_de_hoy_frente_a_la_nueva():
    from fondos.analisis import comparar_notas
    fondos = {f'F{i}': {'categoria': 'Global Large-Cap Blend Equity', 'en_universo': True, 'ter': 1.0, 'fund_id': f'F{i}'} for i in range(10)}
    c0, c1 = dt.date(2021, 6, 30), dt.date(2022, 6, 30)
    # la nueva ordena igual que el exceso futuro; la de hoy, al revés
    fotos = {c0: {i: {'bloques': {'coste': 100 - k * 10}, 'nueva': k * 10, 'valores': {}} for k, i in enumerate(fondos)},
             c1: {i: {'bloques': {}, 'nueva': None,
                      'valores': {('1a', 'diferencia_seguimiento'): (k - 5) / 100, ('1a', 'max_caida'): -0.1}}
                  for k, i in enumerate(fondos)}}
    texto = comparar_notas(fotos, fondos)
    assert '| nota de hoy | 0.0 % | -4.50 | -10.0 |  | 2 |' in texto
    assert '| nota nueva | 100.0 % | +3.50 | -10.0 | 1/1 | 2 |' in texto
    assert '| hoy · coste | 0.0 % |' in texto
    assert '| todos (sin elegir) | 40.0 % |' in texto


def test_foto_lleva_el_cuestionario_sin_tamano_ni_gestor():
    from fondos.analisis import foto
    from tests.test_calculo import datos_base
    d = datos_base()
    for f in d['fondos'].values():
        f.update(ter=1.0, patrimonio_meur=300.0, gestor_veterano=8.0)
    hoy = foto(d, dt.date(2026, 11, 13))
    assert hoy['GLOBAL000001']['cuestionario'] is not None
    # el tamaño y el gestor de hoy no se sabían entonces: no cuentan
    from fondos.calculo import calcular
    filas = {(i, v, n): x for i, v, n, x, _ in calcular({**d, 'fondos': {i: {**f, 'patrimonio_meur': None, 'gestor_veterano': None}
                                                                         for i, f in d['fondos'].items()}}, dt.date(2026, 11, 13))[0]}
    assert hoy['GLOBAL000001']['cuestionario'] == filas[('GLOBAL000001', 'cuestionario', 'nota')]


def test_fuerza_bruta_del_cuestionario_encuentra_la_pregunta_que_acierta():
    import random
    from fondos.analisis import cortes, pesos_cuestionario, repartos_cuestionario
    assert len(repartos_cuestionario()) == 8008 and all(sum(p.values()) == 100 for p in repartos_cuestionario()[:50])
    rnd = random.Random(1)
    fondos = {f'F{i:02}': {'categoria': 'Global Large-Cap Blend Equity', 'en_universo': True, 'ter': 1.0 + i / 100}
              for i in range(20)}
    cs = cortes(dt.date(2019, 6, 30), dt.date(2025, 12, 31))
    resp = {c: {i: {'p5': rnd.random(), 'p6': rnd.random()} for i in fondos} for c in cs}
    fotos = {c: {i: {'bloques': {'coste': 50}, 'respuestas': resp[c][i], 'valores': {}} for i in fondos} for c in cs}
    for c in cs:  # lo que pasa h años después lo decide la pregunta 5 del corte de partida (la 6 es ruido)
        for h in (1, 3):
            d = dt.date(c.year + h, c.month, c.day)
            if d in fotos:
                for i in fondos:
                    x = resp[c][i]['p5']
                    fotos[d][i]['valores'] |= {(f'{h}a', r): x + rnd.gauss(0, 0.1) for r in ('rentabilidad', 'sharpe', 'max_caida')}
                    fotos[d][i]['valores'][(f'{h}a', 'diferencia_seguimiento')] = x - 0.5
    texto = pesos_cuestionario(fotos, fondos, log=lambda x: None)
    elegido = next(l for l in texto.splitlines() if l.startswith('| elegido en el entreno'))
    celdas = elegido.split(' | ')
    assert int(celdas[5]) > 0 and celdas[6] == '0'  # peso a la pregunta 5, la que acierta, y nada a la 6 (ruido)
    assert '### Prueba a 1 año' in texto
