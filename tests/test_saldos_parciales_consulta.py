import re
import sqlite3
import unittest
from pathlib import Path

SOURCE = (Path(__file__).resolve().parents[1] / 'server.js').read_text(encoding='utf-8')
ROUTE = SOURCE.split("app.get('/api/solicitudes/:id/saldos'")[1].split('// LISTAR SOLICITUDES')[0]
MATCH = re.search(r'db\.all\(`(SELECT d\.producto_id AS productoId,.*?)`, \[id\]', ROUTE, re.S)
assert MATCH, 'No se encontró la consulta real de saldos'
SQL = MATCH.group(1)

class ConsultaSaldosParciales(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript('''
            CREATE TABLE detalle_solicitudes (solicitud_id INTEGER, producto_id INTEGER, cantidad INTEGER);
            CREATE TABLE entregas_parciales (id INTEGER PRIMARY KEY, solicitud_id INTEGER);
            CREATE TABLE entregas_parciales_detalle (entrega_id INTEGER, producto_id INTEGER, cantidad INTEGER);
            INSERT INTO detalle_solicitudes VALUES (1, 10, 4), (1, 10, 6), (1, 20, 3), (2, 10, 8);
            INSERT INTO entregas_parciales VALUES (1, 1), (2, 1), (3, 2);
            INSERT INTO entregas_parciales_detalle VALUES (1, 10, 2), (2, 10, 4), (3, 10, 8);
        ''')

    def tearDown(self):
        self.db.close()

    def test_acumula_entregas_y_no_mezcla_solicitudes(self):
        self.assertEqual(self.db.execute(SQL, (1,)).fetchall(), [(10, 10, 6), (20, 3, 0)])

    def test_actualiza_total_al_registrar_otra_entrega(self):
        self.db.execute('INSERT INTO entregas_parciales VALUES (4, 1)')
        self.db.execute('INSERT INTO entregas_parciales_detalle VALUES (4, 10, 4)')
        self.db.execute('INSERT INTO entregas_parciales_detalle VALUES (4, 20, 3)')
        self.assertEqual(self.db.execute(SQL, (1,)).fetchall(), [(10, 10, 10), (20, 3, 3)])

    def test_solicitud_sin_entregas(self):
        self.db.execute('INSERT INTO detalle_solicitudes VALUES (4, 30, 7)')
        self.assertEqual(self.db.execute(SQL, (4,)).fetchall(), [(30, 7, 0)])

if __name__ == '__main__':
    unittest.main()
