import datetime as dt

from fondos.validacion import a_semanal, avisos, dias_habiles_entre, hace_anos, ultimo_habil_anterior

D = dt.date


def test_dias_habiles_entre():
    assert dias_habiles_entre(D(2026, 11, 6), D(2026, 11, 9)) == 0      # viernes → lunes
    assert dias_habiles_entre(D(2026, 11, 2), D(2026, 11, 6)) == 3      # lunes → viernes
    assert dias_habiles_entre(D(2026, 11, 2), D(2026, 11, 16)) == 9     # dos semanas
    assert dias_habiles_entre(D(2026, 11, 2), D(2026, 11, 2)) == 0


def test_avisos_hueco_y_salto():
    serie = {D(2026, 10, 1): 100.0, D(2026, 10, 2): 101.0, D(2026, 10, 20): 101.5, D(2026, 10, 21): 120.0}
    av = avisos(serie)
    assert any('hueco de 11 días hábiles' in a for a in av)
    assert any('salto de +18.2%' in a for a in av)
    assert avisos({D(2026, 10, 1): 100.0, D(2026, 10, 2): 101.0}) == []


def test_avisos_semanal():
    # viernes → jueves de la semana siguiente (festivo): semanas seguidas, sin aviso
    assert avisos({D(2026, 10, 2): 100.0, D(2026, 10, 8): 100.0}, semanal=True) == []
    # falta la semana del 5 al 9 de octubre
    assert avisos({D(2026, 10, 2): 100.0, D(2026, 10, 16): 100.0}, semanal=True) == ['1 semana(s) sin dato entre 2026-10-02 y 2026-10-16']
    # en semanales el umbral de salto es 20 %: 18 % no avisa, 25 % sí
    assert avisos({D(2026, 10, 2): 100.0, D(2026, 10, 9): 118.0}, semanal=True) == []
    assert avisos({D(2026, 10, 2): 100.0, D(2026, 10, 9): 125.0}, semanal=True) == ['salto de +25.0% el 2026-10-09']


def test_a_semanal_toma_el_ultimo_de_cada_semana_cerrada():
    serie = {D(2026, 11, 2): 1.0, D(2026, 11, 6): 2.0,        # semana cerrada: se queda el viernes
             D(2026, 11, 12): 3.0,                           # jueves sin viernes (festivo): se queda
             D(2026, 11, 16): 4.0, D(2026, 11, 17): 5.0}     # semana en curso: fuera
    assert a_semanal(serie, D(2026, 11, 18)) == {D(2026, 11, 6): 2.0, D(2026, 11, 12): 3.0}


def test_fechas():
    assert ultimo_habil_anterior(D(2026, 11, 16)) == D(2026, 11, 13)  # lunes → viernes
    assert ultimo_habil_anterior(D(2026, 11, 18)) == D(2026, 11, 17)
    assert hace_anos(D(2028, 2, 29), 10) == D(2018, 2, 28)
