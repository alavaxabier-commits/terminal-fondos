import datetime as dt

import pytest

from fondos import calculo

D = dt.date
HOY = D(2026, 11, 18)


def diaria(crec, semanas=6 * 52, ruido=0.01, fase=0):
    """Serie de viernes, `semanas` hacia atrás desde el 13/11/2026."""
    fin = D(2026, 11, 13)
    return {fin - dt.timedelta(weeks=semanas - 1 - i): 100 * (1 + crec) ** i * (1 + ruido * (-1) ** (i + fase))
            for i in range(semanas)}


def datos_base():
    fondos = {
        'PROXYWORLD01': {'categoria': 'Global Large-Cap Blend Equity', 'divisa': 'EUR', 'indice_id': None, 'en_universo': False},
        'PROXYBOND001': {'categoria': 'Global Diversified Bond - EUR Hedged', 'divisa': 'EUR', 'indice_id': None, 'en_universo': False},
        'GLOBAL000001': {'categoria': 'Global Large-Cap Blend Equity', 'divisa': 'EUR', 'indice_id': None, 'en_universo': True},
        'GLOBAL000002': {'categoria': 'Global Large-Cap Blend Equity', 'divisa': 'USD', 'indice_id': None, 'en_universo': True},
        'MIXTO0000001': {'categoria': 'EUR Flexible Allocation - Global', 'divisa': 'EUR', 'indice_id': None, 'en_universo': True},
    }
    for i in range(5):
        fondos[f'TECNO000000{i}'] = {'categoria': 'Sector Equity Technology', 'divisa': 'EUR', 'indice_id': None, 'en_universo': True}
    valores = {
        'PROXYWORLD01': diaria(0.0015),
        'PROXYBOND001': diaria(0.0003, ruido=0.002),
        'GLOBAL000001': diaria(0.0016, ruido=0.012),
        'GLOBAL000002': {f: v * 1.1 for f, v in diaria(0.0016, ruido=0.012).items()},  # en USD, tipo fijo 1,10
        'MIXTO0000001': diaria(0.001, ruido=0.006),
    }
    for i in range(5):
        valores[f'TECNO000000{i}'] = diaria(0.002 + i * 0.0002, ruido=0.015, fase=i % 2)
    tipos = {'USD': {f: 1.1 for f in valores['GLOBAL000002']}}
    estr = {D(2020, 1, 1) + dt.timedelta(days=d): 2.0 for d in range(0, 2600)}
    indices = {
        'msci-world': {'proxy_isin': 'PROXYWORLD01', 'componentes': None},
        'bbg-global-agg': {'proxy_isin': 'PROXYBOND001', 'componentes': None},
        'mixto-60-40': {'proxy_isin': None, 'componentes': [{'id': 'msci-world', 'peso': 0.6}, {'id': 'bbg-global-agg', 'peso': 0.4}]},
        'estr': {'proxy_isin': None, 'componentes': None},
    }
    categorias = {
        'Global Large-Cap Blend Equity': {'indice_id': 'msci-world', 'metodo': 'indice'},
        'Global Diversified Bond - EUR Hedged': {'indice_id': 'bbg-global-agg', 'metodo': 'indice'},
        'EUR Flexible Allocation - Global': {'indice_id': 'mixto-60-40', 'metodo': 'indice'},
        'Sector Equity Technology': {'indice_id': None, 'metodo': 'media_categoria'},
    }
    return {'fondos': fondos, 'valores': valores, 'tipos': tipos, 'estr': estr, 'indices': indices, 'categorias': categorias}


def por_clave(filas):
    return {(i, v, n): (val, p) for i, v, n, val, p in filas}


def test_referencias_de_cada_tipo():
    d = datos_base()
    filas = por_clave(calculo.calcular(d, HOY)[0])
    # índice de mercado: beta cercana a 1 frente a su sustituto
    assert filas[('GLOBAL000001', '5a', 'beta')][0] == pytest.approx(1.2, abs=0.05)
    # combinado 60/40 y media de categoría: también tienen alfa
    assert ('MIXTO0000001', '5a', 'alfa') in filas
    assert ('TECNO0000004', '5a', 'alfa') in filas
    # el sustituto no está en el universo: métricas sí, percentil no
    assert filas[('PROXYWORLD01', '5a', 'rentabilidad')][1] is None


def test_divisa_se_pasa_a_eur():
    filas = por_clave(calculo.calcular(datos_base(), HOY)[0])
    eur = filas[('GLOBAL000001', '5a', 'rentabilidad')][0]
    usd = filas[('GLOBAL000002', '5a', 'rentabilidad')][0]
    assert usd == pytest.approx(eur)   # mismo fondo en USD con tipo fijo: misma rentabilidad en EUR


def test_percentiles_por_categoria():
    filas = por_clave(calculo.calcular(datos_base(), HOY)[0])
    pct = {i: filas[(i, '5a', 'rentabilidad')][1] for i in (f'TECNO000000{k}' for k in range(5))}
    assert pct['TECNO0000004'] == 100 and pct['TECNO0000000'] == 0   # más crecimiento, mejor percentil
    assert filas[('TECNO0000000', '5a', 'beta')][1] is None           # la beta no lleva percentil


def test_indice_propio_manda_sobre_la_categoria():
    d = datos_base()
    d['fondos']['TECNO0000000']['indice_id'] = 'msci-world'
    _, usa = calculo.referencias(d['fondos'], {i: calculo.m.rendimientos(calculo.m.semanal(v)) for i, v in d['valores'].items()},
                                 d['indices'], d['categorias'], {})
    assert usa['TECNO0000000'] == 'indice:msci-world' and usa['TECNO0000001'] == 'media:Sector Equity Technology'



def test_series_de_referencia_para_la_web():
    d = datos_base()
    _, refs, _, _ = calculo.calcular(d, HOY)
    lunes, sem, meses, mes = refs['indice:msci-world']
    assert all(f.weekday() == 0 for f in lunes) and len(lunes) == len(sem)
    assert all(f.day == 1 for f in meses) and len(meses) == len(mes)
    # de cierre a cierre de diciembre, como el fondo sustituto
    v = d['valores']['PROXYWORLD01']
    cierre = lambda y: v[max(f for f in v if f.year == y)]
    m = dict(zip(meses, mes))
    assert m[D(2023, 12, 1)] / m[D(2022, 12, 1)] == pytest.approx(cierre(2023) / cierre(2022))
    assert {'indice:mixto-60-40', 'indice:estr', 'media:Sector Equity Technology'} <= set(refs)


def test_una_clase_por_fondo_en_los_percentiles():
    d = datos_base()
    # otra clase del fondo TECNO0000003, más cara y un poco peor: no debe mover los percentiles de los demás
    d['fondos']['TECNO0000003'].update(fund_id='FS3', ter=0.5)
    d['fondos']['TECNO000003B'] = {'categoria': 'Sector Equity Technology', 'divisa': 'EUR', 'indice_id': None,
                                   'en_universo': True, 'fund_id': 'FS3', 'ter': 1.2}
    d['valores']['TECNO000003B'] = diaria(0.002 + 3 * 0.0002 - 0.00002, ruido=0.015, fase=1)
    filas = por_clave(calculo.calcular(d, HOY)[0])
    pct = {i: filas[(i, '5a', 'rentabilidad')][1] for i in [f'TECNO000000{k}' for k in range(5)] + ['TECNO000003B']}
    assert [pct[f'TECNO000000{k}'] for k in range(5)] == [0, 25, 50, 75, 100]  # como sin la clase de más
    assert 50 < pct['TECNO000003B'] < 75   # situada en la misma distribución, entre el 2 y el 3


def test_notas_con_percentil_en_la_categoria():
    d = datos_base()
    for k in range(5):
        d['fondos'][f'TECNO000000{k}']['ter'] = 1.0 - k * 0.1  # los mejores, también los más baratos
    filas = por_clave(calculo.calcular(d, HOY)[0])
    assert filas[('TECNO0000004', 'hoy', 'ter')] == (pytest.approx(0.6), 100)  # menos TER, mejor percentil
    notas = {i: (n, p, solo3) for i, n, p, solo3 in calculo.calcular(d, HOY)[2]}
    tecno = [notas[f'TECNO000000{k}'] for k in range(5)]
    assert [p for _, p, _ in tecno] == [0, 25, 50, 75, 100]
    assert all(0 <= n <= 100 and not solo3 for n, _, solo3 in tecno)
    assert 'PROXYWORLD01' not in notas  # fuera del universo y sin percentiles: sin nota


def test_diversificacion_por_cartera():
    d = datos_base()
    d['carteras'] = {7: ['GLOBAL000001']}
    filas = {i: (c, p) for cid, i, c, p in calculo.calcular(d, HOY)[3] if cid == 7}
    assert filas['GLOBAL000001'][0] == pytest.approx(1.0)       # consigo mismo
    assert filas['GLOBAL000002'][0] == pytest.approx(1.0)       # la misma serie en USD a tipo fijo
    assert 'PROXYWORLD01' not in filas                          # fuera del universo
    # las series de prueba alternan ±: los TECNO de fase impar van al revés (−1) y diversifican más
    assert [filas[f'TECNO000000{k}'] for k in range(5)] == [(1.0, 25.0), (-1.0, 87.5), (1.0, 25.0), (-1.0, 87.5), (1.0, 25.0)]
