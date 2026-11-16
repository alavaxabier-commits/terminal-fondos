from fondos.__main__ import altas_myinvestor


class Repo:
    def __init__(self):
        self.guardados, self.registros = [], []

    def myinvestor_sin_ficha(self, tope):
        return ['ES0000000001', 'ES0000000002', 'ES0000000003'][:tope]

    def guardar_fondo(self, f):
        self.guardados.append(f['isin'])

    def registrar(self, *a):
        self.registros.append(a)


class Ms:
    def buscar(self, isin):
        if isin.endswith('2'):
            return None
        if isin.endswith('3'):
            raise ValueError('falla')
        return {'isin': isin}


def test_altas_desde_myinvestor():
    repo = Repo()
    assert altas_myinvestor(repo, Ms()) == (1, 2)
    assert repo.guardados == ['ES0000000001'] and repo.registros[0][1] == 'ES0000000003'
