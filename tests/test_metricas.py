import datetime as dt
import math

import pytest
from fondos.nucleo import metricas as m

from fondos.nucleo.metricas import (a_eur, correlacion_media, anualizada, captura, combinar, consistencia, desviacion_bajista,
                                    maxima_caida, media_rendimientos, metricas_fondo, nota, percentiles, regresion,
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
    assert ('5a', 'captura_alcista') in m and ('1a', 'captura_bajista') in m and ('10a', 'recuperacion_semanas') in m
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


def test_calendario_exacto_con_cierres_de_diciembre():
    from fondos.nucleo.metricas import metricas_calendario
    serie = {D(2024, 12, 31): 100.0, D(2025, 1, 3): 101.0, D(2025, 12, 31): 110.0, D(2026, 1, 2): 111.0, D(2026, 11, 13): 121.0}
    r = metricas_calendario(serie, D(2026, 11, 18))
    assert r[('2025', 'rentabilidad')] == pytest.approx(0.10)
    assert r[('ytd', 'rentabilidad')] == pytest.approx(0.10)
    assert ('2024', 'rentabilidad') not in r            # sin cierre de 2023


def test_metricas_mensuales_como_morningstar():
    from statistics import stdev
    from fondos.nucleo.metricas import metricas_mensuales
    fines = []
    a, m = 2023, 10
    for _ in range(37):                                  # 37 cierres → 36 rentabilidades mensuales
        siguiente = D(a + (m // 12), m % 12 + 1, 1)
        fines.append(siguiente - dt.timedelta(days=1))
        a, m = siguiente.year, siguiente.month
    rs = [0.02 if i % 2 else -0.01 for i in range(36)]
    v, serie = 100.0, {fines[0]: 100.0}
    for f, r in zip(fines[1:], rs):
        v *= 1 + r
        serie[f] = v
    hoy = fines[-1] + dt.timedelta(days=5)
    out = metricas_mensuales(serie, {}, hoy)
    assert out[('3a', 'volatilidad_mensual')] == pytest.approx(stdev(rs) * math.sqrt(12))
    assert ('5a', 'volatilidad_mensual') not in out
    # el tipo sin riesgo es la media de las semanas del tramo (nov-2023 a oct-2026), no de toda la historia
    rf = {}
    d = D(2021, 1, 4)
    while d <= D(2026, 10, 26):
        rf[d.isocalendar()[:2]] = 0.0 if d >= D(2023, 11, 1) else 0.01
        d += dt.timedelta(days=7)
    anual = math.prod(1 + r for r in rs) ** (1 / 3) - 1
    con_rf = metricas_mensuales(serie, rf, hoy)
    assert con_rf[('3a', 'sharpe_mensual')] == pytest.approx(anual / (stdev(rs) * math.sqrt(12)))



def test_mensuales_y_tasa_mensual():
    from fondos.nucleo.metricas import mensuales, tasa_mensual
    serie = {D(2024, 12, 31): 100.0, D(2025, 1, 15): 999.0, D(2025, 1, 31): 110.0, D(2025, 3, 31): 121.0}
    assert mensuales(serie) == {(2025, 1): pytest.approx(0.1)}            # de enero a marzo falta febrero
    assert tasa_mensual({D(2025, 1, 1): 12.0, D(2025, 1, 2): 12.0}) == {(2025, 1): pytest.approx(1.12 ** (1 / 12) - 1)}


def test_caso_comun_con_la_web():
    import json
    from tests.caso_metricas import RUTA, calcular
    caso = json.loads(RUTA.read_text())
    rf = {D.fromisoformat(f).isocalendar()[:2]: x for f, x in caso['rf']}
    obtenido = calcular(D.fromisoformat(caso['hoy']), caso['serie'], caso['referencia'], rf)
    assert obtenido.keys() == caso['esperado'].keys()
    for k, x in caso['esperado'].items():
        assert obtenido[k] == pytest.approx(x, rel=1e-9), k


def test_nota_media_ponderada_de_bloques():
    pct = {('5a', 'sharpe'): 80, ('5a', 'sortino'): 60,          # riesgo 70 × 25
           ('hist', 'consistencia'): 40, ('3a', 'ratio_informacion'): 60,  # consistencia 50 × 20
           ('hoy', 'ter'): 90,                                     # coste 90 × 20
           ('5a', 'max_caida'): 30, ('5a', 'captura_bajista'): 50,  # protección 40 × 15
           ('5a', 'rentabilidad'): 100, ('5a', 'tracking_error'): 0}  # rentabilidad 100 × 10
    assert nota(pct, indexada=False) == (pytest.approx((70 * 20 + 50 * 10 + 90 * 40 + 40 * 20 + 100 * 10) / 100), False)
    # indexada: consistencia = tracking error (0)
    assert nota(pct, indexada=True)[0] == pytest.approx((70 * 20 + 0 * 10 + 90 * 40 + 40 * 20 + 100 * 10) / 100)


def test_nota_con_3a_y_bloques_sin_datos():
    pct = {('3a', 'rentabilidad'): 50, ('3a', 'sharpe'): 50, ('hist', 'consistencia'): 0, ('3a', 'ratio_informacion'): 100}
    # sin TER ni protección: su peso se reparte; con 3A no cuenta la consistencia, solo el ratio de información
    assert nota(pct, indexada=False) == (pytest.approx((50 * 20 + 100 * 10 + 50 * 10) / 40), True)
    assert nota({('1a', 'rentabilidad'): 50}, indexada=False) is None  # menos de 3 años: sin nota


def test_correlacion_media_con_la_cartera():
    semanas = [(2025, s) for s in range(1, 53)] + [(2026, s) for s in range(1, 53)]
    r = {k: math.sin(i) for i, k in enumerate(semanas)}
    igual = dict(r)
    contraria = {k: -v for k, v in r.items()}
    corta = {k: v for k, v in list(r.items())[:20]}  # sin un año común: no cuenta
    assert correlacion_media(r, [igual, contraria, corta]) == pytest.approx(0.0)
    assert correlacion_media(r, [igual]) == pytest.approx(1.0)
    assert correlacion_media(r, [corta]) is None


def test_bloques_nota_con_plazo_obligado():
    from fondos.nucleo.metricas import bloques_nota
    pct = {('5a', 'rentabilidad'): 80, ('1a', 'rentabilidad'): 20, ('1a', 'sharpe'): 40, ('1a', 'ratio_informacion'): 60,
           ('hist', 'consistencia'): 0, ('3a', 'ratio_informacion'): 10}
    assert bloques_nota(pct, False, '1a') == ({'rentabilidad': 20, 'riesgo': 40, 'consistencia': 60}, False)
    assert bloques_nota(pct, False)[0] == {'rentabilidad': 80, 'consistencia': 5}  # sin plazo: 5 años
    assert bloques_nota(pct, False, '3a') is None


def test_monetario_rendimiento_reciente():
    from fondos.nucleo.metricas import meses_antes, metricas_monetario
    assert meses_antes(D(2026, 5, 31), 1) == D(2026, 4, 30) and meses_antes(D(2026, 1, 15), 2) == D(2025, 11, 15)
    # 3 % anual compuesto día a día durante 15 meses, salvo un mes con caída; €STR plano al 2 %
    d0, diaria, v = D(2025, 8, 1), {}, 100.0
    for i in range(460):
        f = d0 + dt.timedelta(days=i)
        v *= (1.03) ** (1 / 365) * (0.995 if f == D(2026, 3, 10) else 1)
        diaria[f] = v
    estr = {f: 2.0 for f in diaria}
    out = metricas_monetario(diaria, estr)
    ultima = max(diaria)
    esperado1 = (diaria[ultima] / diaria[meses_antes(ultima, 1)]) ** 12 - 1
    assert out[('1m', 'rentabilidad')] == pytest.approx(esperado1)
    assert out[('3m', 'rentabilidad')] == pytest.approx(0.03, abs=0.002)
    assert out[('3m', 'diferencial_estr')] == pytest.approx(out[('3m', 'rentabilidad')] - 0.02)
    assert ('hoy', 'tendencia') not in out
    assert out[('12m', 'meses_negativos')] == 1
    assert metricas_monetario({D(2026, 1, 2): 1.0, D(2026, 1, 5): 1.0}, {}) == {}  # sin un mes de historia


def test_tipo_activo_y_pesos_por_tipo():
    from fondos.nucleo.metricas import PESOS_NOTA, PESOS_TIPO, tipo_activo
    assert tipo_activo('GBP Allocation 80%+ Equity') == 'mixto' and tipo_activo('EUR Money Market') == 'monetario'
    assert tipo_activo('Global Large-Cap Blend Equity') == 'renta variable' and tipo_activo('EUR Corporate Bond') == 'renta fija'
    assert tipo_activo(None) == 'otros' and set(PESOS_TIPO) == {'renta variable', 'renta fija', 'mixto', 'monetario', 'otros', 'indexados'}
    from fondos.nucleo.metricas import grupo_pesos
    assert grupo_pesos('EUR Corporate Bond', True) == 'indexados' and grupo_pesos('EUR Corporate Bond', False) == 'renta fija'
    pct = {('5a', 'rentabilidad'): 100, ('hoy', 'ter'): 0}
    assert nota(pct, False, {'coste': 1})[0] == 0 and nota(pct, False, PESOS_TIPO['renta fija']) == nota(pct, False, PESOS_NOTA)


def test_bloques_propios_por_tipo():
    from fondos.nucleo.metricas import bloques_nota
    pct = {('5a', 'rentabilidad'): 40, ('5a', 'diferencia_seguimiento'): 90, ('5a', 'tracking_error'): 30,
           ('13s', 'rentabilidad'): 80, ('hoy', 'tir_neta'): 70}
    assert bloques_nota(pct, True)[0]['consistencia'] == 60          # indexado: seguimiento del índice
    assert bloques_nota(pct, True, propios=False)[0]['consistencia'] == 30
    assert bloques_nota(pct, False, tipo='monetario')[0]['rentabilidad'] == 80
    assert bloques_nota(pct, False, tipo='renta fija')[0]['tir'] == 70
    assert 'tir' not in bloques_nota(pct, False, tipo='renta variable')[0]


def test_flujos_quitan_la_rentabilidad_y_exigen_historia():
    from fondos.nucleo import metricas as m
    d = dt.date
    patrimonio = {d(2026, 1, 4): 100.0, d(2026, 3, 1): 120.0, d(2026, 5, 3): 90.0}
    valores = {d(2026, 1, 2): 10.0, d(2026, 2, 27): 11.0, d(2026, 4, 30): 10.0}
    f = m.metricas_flujos(patrimonio, valores, d(2026, 5, 10))
    # de enero a marzo el valor sube un 10 %: de 100 a 120 son 10 de flujo; de marzo a mayo baja a 10/11: 90 − 120·10/11
    assert f[('3m', 'flujo')] == pytest.approx(10 + 90 - 120 * 10 / 11)
    assert f[('3m', 'flujo_pct')] == pytest.approx(f[('3m', 'flujo')] / 100)
    assert ('1a', 'flujo') not in f  # sin dato de hace un año
    assert m.metricas_flujos({d(2026, 5, 3): 90.0}, valores, d(2026, 5, 10)) == {}
    assert 'flujo' in m.SIN_PERCENTIL


def test_mensuales_con_curso_anade_el_mes_a_medias():
    from fondos.nucleo.metricas import mensuales, mensuales_con_curso
    serie = {dt.date(2026, 9, 30): 100.0, dt.date(2026, 10, 30): 102.0, dt.date(2026, 11, 18): 104.04}
    assert mensuales(serie) == {(2026, 10): pytest.approx(0.02)}
    assert mensuales_con_curso(serie) == {(2026, 10): pytest.approx(0.02), (2026, 11): pytest.approx(0.02)}
    # si el último dato ya es un cierre, no hay mes a medias que añadir
    cerrado = {dt.date(2026, 9, 30): 100.0, dt.date(2026, 10, 30): 102.0}
    assert mensuales_con_curso(cerrado) == mensuales(cerrado)


# ------------------------------------------------------------------ nota nueva (en validación)
def test_escalas_de_la_nota_nueva():
    assert m.escala(110, 20, 200) == 50 and m.escala(500, 20, 200) == 100 and m.escala(5, 20, 200) == 0
    assert m.bloque_coste(0.5, 'renta variable') == 75 and m.bloque_coste(1.0, 'renta fija') == 0
    assert m.bloque_coste(0.0, 'mixto') == 100
    assert m.bloque_gestor(None) == 100 and m.bloque_gestor(3) == 50 and m.bloque_gestor(0.5) == 0
    assert m.bloque_tamano(110, None) == 50 and m.bloque_tamano(200, -0.25) == 75 and m.bloque_tamano(None, None) is None


def test_suavizar_categorias_pequenas():
    assert m.suavizar(80, 40, 5) == 60 and m.suavizar(80, 40, 20) == 80
    assert m.suavizar(None, 40, 5) == 40 and m.suavizar(80, None, 5) == 80


def test_bloques_nota_nueva():
    tipo_ = {('5a', 'diferencia_seguimiento'): 90, ('3a', 'ratio_informacion'): 70, ('hist', 'consistencia'): 50,
             ('5a', 'captura_bajista'): 40, ('5a', 'caida_relativa'): 60, ('5a', 'volatilidad_relativa'): 20,
             ('5a', 'sharpe'): 40, ('5a', 'sortino'): 40}
    cat = {('5a', 'sharpe'): 80, ('5a', 'sortino'): 80}
    b, solo3 = m.bloques_nota_nueva(cat, tipo_, 5, 'renta variable', 0.5, patrimonio_meur=110)
    assert not solo3
    assert b == {'coste': 75, 'proteccion': 50, 'riesgo': 40, 'consistencia': 60, 'rentabilidad': 90,
                 'gestor': 100, 'tamano': 50}  # riesgo: media de (80·½ + 40·½) y 20
    # sin exceso sobre un índice (sin referencia) o sin 3 años: sin nota
    assert m.bloques_nota_nueva(cat, {('5a', 'sharpe'): 40}, 5, 'renta variable', 0.5) is None
    # con 3 años, la consistencia es solo el ratio de información a 3 años
    b, solo3 = m.bloques_nota_nueva({}, {('3a', 'diferencia_seguimiento'): 10, ('3a', 'ratio_informacion'): 30,
                                         ('hist', 'consistencia'): 99}, 30, 'renta fija', None)
    assert solo3 and b['consistencia'] == 30 and 'coste' not in b


def test_metricas_relativas():
    ref = {(2020 + i // 52, i % 52 + 1): 100 * (1.002 ** i) * (0.7 if 100 <= i < 120 else 1) for i in range(52 * 4)}
    fondo = {k: 100 + (v - 100) / 2 for k, v in ref.items()}  # se mueve la mitad que su índice
    r = m.metricas_relativas(fondo, ref)
    assert r[('3a', 'caida_relativa')] > 0  # cayó menos
    assert 0.3 < r[('3a', 'volatilidad_relativa')] < 0.7
    assert ('5a', 'caida_relativa') not in r  # no hay 5 años
