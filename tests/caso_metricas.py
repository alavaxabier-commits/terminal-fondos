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


# Notas del screener: percentiles de un fondo → nota (o None), para el port de la web
NOTAS = [
    ({'5a|sharpe': 80, '5a|sortino': 60, 'hist|consistencia': 40, '3a|ratio_informacion': 60, 'hoy|ter': 90,
      '5a|max_caida': 30, '5a|captura_bajista': 50, '5a|rentabilidad': 100, '5a|tracking_error': 0}, False),
    ({'5a|sharpe': 80, '5a|sortino': 60, 'hist|consistencia': 40, '3a|ratio_informacion': 60, 'hoy|ter': 90,
      '5a|max_caida': 30, '5a|captura_bajista': 50, '5a|rentabilidad': 100, '5a|tracking_error': 0}, True),
    ({'3a|rentabilidad': 50, '3a|sharpe': 50, 'hist|consistencia': 0, '3a|ratio_informacion': 100}, False),
    ({'1a|rentabilidad': 50}, False),
    # con plazo elegido en el screener
    ({'1a|rentabilidad': 40, '1a|sharpe': 60, '1a|captura_bajista': 20, '1a|ratio_informacion': 70, 'hist|consistencia': 10,
      '3a|ratio_informacion': 0, 'hoy|ter': 50, '5a|rentabilidad': 90}, False, '1a'),
    ({'10a|rentabilidad': 40, '10a|max_caida': 60, 'hist|consistencia': 10, '3a|ratio_informacion': 30, '10a|tracking_error': 80},
     False, '10a'),
    ({'10a|rentabilidad': 40, '10a|tracking_error': 80}, True, '10a'),
    ({'5a|rentabilidad': 90}, False, '10a'),
    # bloques propios: indexado (tracking difference + tracking error), monetario (13 semanas) y renta fija (TIR)
    ({'5a|rentabilidad': 40, '5a|diferencia_seguimiento': 90, '5a|tracking_error': 30, 'hoy|ter': 80}, True, None, None),
    ({'5a|rentabilidad': 40, '13s|rentabilidad': 90, 'hoy|ter': 80}, False, None, 'monetario'),
    ({'5a|rentabilidad': 40, 'hoy|tir_neta': 70, 'hoy|ter': 80}, False, None, 'renta fija', {'tir': 25}),
]


def notas():
    out = []
    for pct, indexada, *resto in NOTAS:
        ventana, tipo, extra = (resto + [None, None, None])[:3]
        pesos = {**m.PESOS_NOTA, **(extra or {})}
        b = m.bloques_nota({tuple(k.split('|')): v for k, v in pct.items()}, indexada, ventana, tipo)
        n = b and m.ponderar(b[0], pesos)
        out.append({'pct': pct, 'indexada': indexada, 'ventana': ventana, 'tipo': tipo, 'pesos': extra,
                    'nota': n, 'solo_3a': b and b[1] if n is not None else None})
    return out


def generar():
    hoy, serie, ref, rf = entrada()
    caso = {'hoy': hoy.isoformat(), 'serie': serie, 'referencia': ref,
            'rf': [[m.lunes_de(k).isoformat(), x] for k, x in rf.items()], 'esperado': calcular(hoy, serie, ref, rf),
            'notas': notas()}
    RUTA.write_text(json.dumps(caso, separators=(',', ':')))


if __name__ == '__main__':
    generar()
