from fondos import vigilancia as v


def test_precios_en_orden():
    assert v.precios({'ok': 90, 'aviso': 5, 'error': 5}, {'morningstar': 93, 'yahoo': 2}, [('iShares', 0), ('DWS', 4)]) == []


def test_precios_alarmas():
    a = v.precios({'ok': 50, 'aviso': 0, 'error': 50}, {'morningstar': 10, 'yahoo': 30, 'ft': 10},
                  [('iShares', 5), ('Nuevo', None)])
    assert len(a) == 4
    assert '50 de 100 fondos con error (50 %)' in a[0]
    assert 'Morningstar solo ha dado 10 de 50 descargas; el resto, del respaldo (ft 10, yahoo 30)' in a[1]
    assert a[2] == 'precios: iShares sin precio desde hace 5 días hábiles' and a[3] == 'precios: Nuevo sin precio todavía'


def test_pocas_descargas_no_cuentan():
    assert v.precios({'ok': 1, 'aviso': 0, 'error': 2}, {'yahoo': 1}, []) == []


def test_universo():
    assert v.universo(20000, 20500, 0.02, 0.0) == []
    assert v.universo(20000, None, 0.02, 0.0) == []                       # primera vez: nada con qué comparar
    assert v.universo(9000, 20000, 0.5, 0.3) == [
        'universo: 9000 fichas, frente a 20000 la vez anterior',
        'universo: el 50 % del universo sin TER', 'universo: el 30 % del universo sin categoría']
    assert v.universo(0, None, 0.0, 0.0, 0.4) == ['universo: el 40 % del universo con la ficha sin refrescar desde hace más de 90 días']


def test_composicion_y_metricas():
    assert v.composicion({'ok': 1100, 'aviso': 90, 'error': 10}, 800) == []
    assert v.composicion({'ok': 100, 'aviso': 0, 'error': 0}, 0) == ['composición: ningún fondo con todas sus posiciones (de 100 descargados)']
    assert v.composicion({'ok': 10, 'aviso': 0, 'error': 0}, 5, 3) == []
    assert v.composicion({'ok': 10, 'aviso': 0, 'error': 0}, 5, 8) == [
        'composición: 8 de 10 fondos sin resumen de cotización (TER, patrimonio y categoría): ¿ha cambiado la API de la web de Morningstar?']
    assert v.metricas(200000, 210000) == [] and v.metricas(100000, 210000) == ['métricas: 100000, frente a 210000 la vez anterior']
    assert v.metricas(5, 0) == []


def test_myinvestor():
    assert v.myinvestor(2483, None) == []
    assert 'solo 12 fondos' in v.myinvestor(12, None)[0]
    assert 'no se ha podido descargar el catálogo (HTTPError: 403)' in v.myinvestor(0, 'HTTPError: 403')[0]


def test_bloqueo_con_la_tarea_delante():
    assert v.bloqueo('diario', 'Morningstar responde 429') == 'precios: Morningstar responde 429'
    assert v.bloqueo('composicion', 'x') == 'composición: x'
    assert v.bloqueo('universo', 'x') == 'universo: x'
