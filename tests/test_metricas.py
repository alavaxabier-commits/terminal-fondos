import datetime as dt
import math

import pytest

from fondos.nucleo.metricas import (a_eur, anualizada, captura, combinar, consistencia, desviacion_bajista,
                                    maxima_caida, media_rendimientos, metricas_fondo, percentiles, regresion,
                                    rendimientos, semanal, serie_de_rendimientos, tasa_semanal, ventana_completa,
                                    volatilidad)

D = dt.date


def serie_de(valores, desde=D(2015, 1, 9)):
    """Valores semanales (viernes) a partir de `desde` → SerieSemanal."""
    return semanal({desde + dt.timedelta(weeks=i): v for i, v in enumerate(valores)})


def test_semanal_alinea_por_semana_iso():
    s = semanal({D(2026, 10, 1): 1.0, D(2026, 10, 2): 2.0, D(2026, 10, 8): 3.0})  # jueves 8: semana festiva
    assert s == {(2026, 40): 2.0, (2026, 41): 3.0}


def test_a_eur_usa_el_tipo_del_ultimo_dia_con_dato():
    serie = {D(2026, 11, 2): 110.0, D(2026, 11, 3): 110.0}
    tipos = {D(2026, 10, 30): 1.10, D(2026, 11, 3): 1.0}   # sin tipo el lunes 2: vale el del viernes
    assert a_eur(serie, tipos) == {D(2026, 11, 2): pytest.approx(100.0), D(2026, 11, 3): pytest.approx(110.0)}


def test_rendimientos_ignoran_semanas_no_consecutivas():
    s = {(2026, 1): 100.0, (2026, 2): 110.0, (2026, 4): 121.0}
    assert rendimientos(s) == {(2026, 2): pytest.approx(0.1)}


def test_anualizada_y_volatilidad():
    s = serie_de([100 * 1.21 ** (i / 104) for i in range(105)])
    assert anualizada(s) == pytest.approx(0.10, abs=1e-9)
    assert volatilidad([0.01, -0.01] * 26) == pytest.approx(0.01 * math.sqrt(52))
    assert desviacion_bajista([0.01, -0.01] * 26) == pytest.approx(math.sqrt(0.0001 / 2) * math.sqrt(52))


def test_maxima_caida_y_recuperacion():
    assert maxima_caida(serie_de([100, 110, 88, 99, 111])) == (pytest.approx(-0.2), 3)
    assert maxima_caida(serie_de([100, 110, 88, 99])) == (pytest.approx(-0.2), None)
    assert maxima_caida(serie_de([100, 101, 102])) == (0.0, 0)


def test_regresion_alfa_y_beta():
    rb = [0.01, -0.02, 0.015, 0.0, -0.005, 0.02, 0.01, -0.01, 0.005, 0.0, 0.012, -0.007]
    rf = [2 * x + 0.001 for x in rb]
    alfa, beta = regresion(rf, rb)
    assert beta == pytest.approx(2)
    assert alfa == pytest.approx(0.052)


def test_captura():
    rb = [0.02, -0.01] * 5
    rf = [0.01, -0.02] * 5  # sube la mitad, baja el doble
    assert captura(rf, rb, True) == pytest.approx(50, rel=1e-3)
    assert captura(rf, rb, False) == pytest.approx(200, rel=1e-3)


def test_consistencia():
    ref = serie_de([100 * 1.001 ** i for i in range(6 * 52)])
    mejor = serie_de([100 * 1.002 ** i for i in range(6 * 52)])
    assert consistencia(mejor, ref) == 100
    assert consistencia(ref, mejor) == 0
    corta = serie_de([100 * 1.002 ** i for i in range(4 * 52)])
    assert consistencia(corta, ref) is None   # menos de 5 años


def test_ventana_completa():
    s = serie_de([100.0] * (3 * 52 + 1))
    assert ventana_completa(s, list(s)[-1], 3) is not None
    assert ventana_completa(s, list(s)[-1], 5) is None


def test_tasa_semanal_estr():
    r = tasa_semanal({D(2026, 11, 2): 2.0, D(2026, 11, 3): 2.0})
    assert r == {(2026, 45): pytest.approx(1.02 ** (7 / 365) - 1)}


def test_media_combinar_y_encadenar():
    a = {(2026, 1): 0.01, (2026, 2): 0.02}
    b = {(2026, 1): 0.03, (2026, 2): 0.0}
    assert media_rendimientos([a, b], minimo=2) == {(2026, 1): pytest.approx(0.02), (2026, 2): pytest.approx(0.01)}
    assert media_rendimientos([a, b], minimo=3) == {}
    assert combinar([(a, 0.6), (b, 0.4)]) == {(2026, 1): pytest.approx(0.018), (2026, 2): pytest.approx(0.012)}
    assert serie_de_rendimientos(a) == {(2026, 1): pytest.approx(101), (2026, 2): pytest.approx(103.02)}


def test_percentiles_invierten_y_empatan():
    assert percentiles({'A': 0.10, 'B': 0.05, 'C': 0.20}, 'rentabilidad') == {'B': 0, 'A': 50, 'C': 100}
    assert percentiles({'A': 0.10, 'B': 0.05, 'C': 0.20}, 'volatilidad') == {'C': 0, 'A': 50, 'B': 100}
    assert percentiles({'A': -0.10, 'B': -0.30}, 'max_caida') == {'B': 0, 'A': 100}
    assert percentiles({'A': 1, 'B': 1, 'C': 2}, 'sharpe') == {'A': 25, 'B': 25, 'C': 100}
    assert percentiles({'A': 10, 'B': -1, 'C': 30}, 'recuperacion_semanas') == {'B': 0, 'C': 50, 'A': 100}
    assert percentiles({'A': 1.2, 'B': 0.8}, 'beta') == {}


def test_metricas_fondo_completo():
    hoy = D(2026, 11, 18)
    semanas = 11 * 52
    inicio = D(2026, 11, 13) - dt.timedelta(weeks=semanas - 1)
    ref = serie_de([100 * 1.001 ** i * (1 + 0.01 * (-1) ** i) for i in range(semanas)], inicio)
    fondo = serie_de([100 * 1.0015 ** i * (1 + 0.012 * (-1) ** i) for i in range(semanas)], inicio)
    rf = {k: 0.0 for k in ref}
    m = metricas_fondo(fondo, ref, rf, hoy)
    for v in ('1a', '3a', '5a', '10a'):
        for n in ('rentabilidad', 'volatilidad', 'max_caida', 'sharpe', 'sortino', 'alfa', 'beta',
                  'tracking_error', 'ratio_informacion'):
            assert (v, n) in m, (v, n)
    assert ('5a', 'captura_alcista') in m and ('10a', 'recuperacion_semanas') in m
    assert ('hist', 'consistencia') in m and ('ytd', 'rentabilidad') in m and ('2025', 'rentabilidad') in m
    assert m[('10a', 'rentabilidad')] == pytest.approx(1.0015 ** 52 - 1, abs=0.002)
    assert m[('5a', 'beta')] > 0


def test_metricas_fondo_joven_sin_ventanas_largas():
    hoy = D(2026, 11, 18)
    fondo = serie_de([100 + i for i in range(2 * 52)], D(2026, 11, 13) - dt.timedelta(weeks=2 * 52 - 1))
    m = metricas_fondo(fondo, None, {}, hoy)
    assert ('1a', 'rentabilidad') in m
    assert not any(v in ('3a', '5a', '10a') for v, _ in m)       # nunca se estima lo que no hay
    assert not any(n in ('alfa', 'beta') for _, n in m)          # sin referencia, sin alfa ni beta


def test_beta_sin_sentido_con_indice_plano():
    assert regresion([0.01, -0.01] * 6, [0.0005] * 12) == (None, None)
