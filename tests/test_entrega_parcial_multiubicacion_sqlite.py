"""Prueba de las consultas reales de distribución y descuento de entrega parcial."""
import re
import sqlite3
import unittest
from pathlib import Path

SOURCE = (Path(__file__).resolve().parents[1] / 'server.js').read_text(encoding='utf-8')
ROUTE = SOURCE.split("app.post('/api/solicitudes/:id/entregar-parcial'")[1].split('// LISTAR SOLICITUDES')[0]

def sql_real(pattern):
    match = re.search(pattern, ROUTE, re.S)
    if not match:
        raise AssertionError('No se encontró SQL esperado en la ruta real')
    return match.group(1)

SELECCION = sql_real(r'const ubicaciones = await todos\(`(SELECT sc\.id.*?ORDER BY sc\.cantidad DESC, sc\.id ASC)`')
RESERVA = sql_real(r'const reserva = await ejecutar\(`(UPDATE stock_proyecto SET cantidad=cantidad-\?.*?cantidad>=\?)`')
FISICO = sql_real(r'const fisico = await ejecutar\(`(UPDATE stock_cantidad SET cantidad=cantidad-\? WHERE id=\? AND cantidad>=\?)`')

class EntregaParcialMultiubicacion(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript('''
            CREATE TABLE proyectos(id INTEGER PRIMARY KEY, bodega_numero INTEGER);
            CREATE TABLE ubicaciones(id INTEGER PRIMARY KEY, bodega INTEGER);
            CREATE TABLE stock_cantidad(id INTEGER PRIMARY KEY, ubicacion_id INTEGER, producto_id INTEGER, cantidad INTEGER);
            CREATE TABLE stock_proyecto(id INTEGER PRIMARY KEY, proyecto_id INTEGER, producto_id INTEGER, ubicacion_id INTEGER, cantidad INTEGER);
            INSERT INTO proyectos VALUES (1, 10), (2, 20);
            INSERT INTO ubicaciones VALUES (1, 10), (2, 10), (3, 20);
            INSERT INTO stock_cantidad VALUES (1, 1, 7, 3), (2, 2, 7, 8), (3, 3, 7, 20);
            INSERT INTO stock_proyecto VALUES (1, 1, 7, 1, 3), (2, 1, 7, 2, 5), (3, 2, 7, 3, 20);
        ''')

    def tearDown(self):
        self.db.close()

    def entregar(self, cantidad):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            ubicaciones = self.db.execute(SELECCION, (1, 7)).fetchall()
            restante = cantidad
            for stock_id, ubicacion_id, fisico, reservado in ubicaciones:
                if not restante:
                    break
                tomar = min(restante, fisico, reservado)
                assert self.db.execute(RESERVA, (tomar, 1, 7, ubicacion_id, tomar)).rowcount == 1
                assert self.db.execute(FISICO, (tomar, stock_id, tomar)).rowcount == 1
                restante -= tomar
            if restante:
                raise ValueError('Reserva insuficiente')
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def cantidades(self):
        return (self.db.execute('SELECT id,cantidad FROM stock_cantidad ORDER BY id').fetchall(),
                self.db.execute('SELECT id,cantidad FROM stock_proyecto ORDER BY id').fetchall())

    def test_distribuye_en_dos_ubicaciones_sin_tocar_otra_bodega(self):
        self.entregar(7)
        self.assertEqual(self.cantidades(),
                         ([(1, 1), (2, 3), (3, 20)], [(1, 1), (2, 0), (3, 20)]))

    def test_insuficiencia_revierte_todos_los_descuentos(self):
        antes = self.cantidades()
        with self.assertRaisesRegex(ValueError, 'Reserva insuficiente'):
            self.entregar(9)
        self.assertEqual(self.cantidades(), antes)

    def test_otra_bodega_no_compensa_reserva_insuficiente(self):
        self.db.execute('UPDATE stock_proyecto SET cantidad=1 WHERE id=2')
        self.db.commit()
        antes = self.cantidades()
        with self.assertRaises(ValueError):
            self.entregar(5)
        self.assertEqual(self.cantidades(), antes)

if __name__ == '__main__':
    unittest.main()
