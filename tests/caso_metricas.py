"""Caso común de métricas para Python y la web (web/src/calculo/caso_metricas.json).

Las carteras se calculan en la web con un port de `nucleo/metricas.py`; los dos lados pasan este mismo caso, así que
si una fórmula cambia en uno y no en el otro, falla un test. Para regenerarlo tras un cambio querido:
    python -m tests.caso_metricas
"""
import datetime as dt
import json
import math
from pathlib import Path

from fondos.nucleo import metricas as m

RUTA = Path(__file__).parent.parent / 'web' / 'src' / 'calculo' / 'caso_metricas.json'
D = dt.date


def entrada():
    hoy, dias, serie, ref, v, r = D(2026, 11, 18), [], [], [], 100.0, 100.0
    f = D(2018, 1, 2)
    i = 0
    while f <= D(2026, 11, 13):
        if f.weekday() < 5:
            v *= 1 + 0.0003 + 0.012 * math.sin(i * 1.7) - (0.03 if D(2020, 3, 2) <= f <= D(2020, 3, 20) else 0)
            r *= 1 + 0.0003 + 0.010 * math.sin(i * 1.7 + 0.4) - (0.025 if D(2020, 3, 2) <= f <= D(2020, 3, 20) else 0)
            serie.append([f.isoformat(), v])
            ref.append([f.isoformat(), r])
            i += 1
        f += dt.timedelta(days=1)
    rf = {k: 0.0002 + 0.00001 * (k[1] % 7) for k in m.semanal({D.fromisoformat(a): b for a, b in serie})}
    return hoy, serie, ref, rf


def calcular(hoy, serie, ref, rf):
    s = {D.fromisoformat(a): b for a, b in serie}
    out = m.metricas_fondo(m.semanal(s), m.semanal({D.fromisoformat(a): b for a, b in ref}), rf, hoy, s)
    return {f'{v}|{n}': x for (v, n), x in sorted(out.items())}


# Notas del screener: Python guarda los bloques en metrica (calculo.filas_nota) y la web solo los lee y pondera con los
# pesos por defecto de su grupo. El caso: bloques calculados aquí → filas → lo que la web debe leer y la nota esperada.
TIPO_ACTIVO = {('5a', 'diferencia_seguimiento'): 90, ('3a', 'diferencia_seguimiento'): 70, ('3a', 'ratio_informacion'): 70,
               ('hist', 'consistencia'): 50, ('5a', 'captura_bajista'): 40, ('5a', 'caida_relativa'): 60,
               ('5a', 'volatilidad_relativa'): 20, ('5a', 'sharpe'): 40, ('5a', 'sortino'): 40, ('3a', 'sharpe'): 10}
CATEGORIA = {('5a', 'sharpe'): 80, ('5a', 'sortino'): 80, ('3a', 'sharpe'): 30, ('5a', 'rentabilidad'): 40,
             ('3a', 'rentabilidad'): 60, ('5a', 'tracking_error'): 30, ('5a', 'diferencia_seguimiento'): 90,
             ('hoy', 'ter'): 80, ('13s', 'rentabilidad'): 90, ('hoy', 'tir_neta'): 70, ('5a', 'max_caida'): 20}


def casos_nota():
    yield 'renta variable', {v: m.bloques_nota_nueva(CATEGORIA, TIPO_ACTIVO, 5, 'renta variable', 0.5, None, 110, -0.2, v)
                             for v in (None, '3a', '5a', '1a')}
    yield 'renta fija', {v: m.bloques_nota_nueva(CATEGORIA, {k: x for k, x in TIPO_ACTIVO.items() if k[0] != '5a'}, 30,
                                                 'renta fija', 0.4, 2.0, None, None, v) for v in (None, '3a')}
    yield 'renta variable', {None: m.bloques_nota_nueva(CATEGORIA, {}, 5, 'renta variable', 0.5)}  # sin referencia
    yield 'indexados', {v: m.bloques_nota(CATEGORIA, True, v) for v in (None, '5a', '3a')}
    yield 'monetario', {v: m.bloques_nota(CATEGORIA, False, v, 'monetario') for v in (None, '5a')}


def notas():
    from fondos.calculo import filas_nota
    out = []
    for grupo, por in casos_nota():
        por = {v: b for v, b in por.items() if b}
        pct = {f'{v}|{n}': p for _, v, n, _, p in filas_nota('X', por)}
        for plazo in (None, '1a', '3a', '5a'):
            b = por.get(plazo)
            n = b and m.ponderar(b[0], m.PESOS_GRUPO[grupo])
            out.append({'pct': pct, 'grupo': grupo, 'plazo': plazo, 'nota': n,
                        'solo_3a': b[1] if n is not None else None})
    return out


def generar():
    hoy, serie, ref, rf = entrada()
    caso = {'hoy': hoy.isoformat(), 'serie': serie, 'referencia': ref,
            'rf': [[m.lunes_de(k).isoformat(), x] for k, x in rf.items()], 'esperado': calcular(hoy, serie, ref, rf),
            'notas': notas()}
    RUTA.write_text(json.dumps(caso, separators=(',', ':')))


if __name__ == '__main__':
    generar()
