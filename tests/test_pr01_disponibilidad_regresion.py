"""Escenarios de regresión de reservas por proyecto y stock libre."""
import sqlite3
import unittest

class DisponibilidadProyecto(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript('''
          CREATE TABLE stock_cantidad(producto_id INTEGER, ubicacion_id INTEGER, cantidad INTEGER);
          CREATE TABLE stock_proyecto(proyecto_id INTEGER, producto_id INTEGER, ubicacion_id INTEGER, cantidad INTEGER);
          INSERT INTO stock_cantidad VALUES(10,1,50);
          INSERT INTO stock_proyecto VALUES(1,10,1,33),(2,10,1,12);
        ''')

    def tearDown(self):
        self.db.close()

    def disponible(self, proyecto):
        fisico = self.db.execute('SELECT cantidad FROM stock_cantidad WHERE producto_id=10 AND ubicacion_id=1').fetchone()[0]
        reservado_total = self.db.execute('SELECT COALESCE(SUM(cantidad),0) FROM stock_proyecto WHERE producto_id=10 AND ubicacion_id=1').fetchone()[0]
        propia = self.db.execute('SELECT COALESCE(SUM(cantidad),0) FROM stock_proyecto WHERE producto_id=10 AND ubicacion_id=1 AND proyecto_id=?',(proyecto,)).fetchone()[0] if proyecto is not None else 0
        return fisico - reservado_total + propia

    def test_pr01_puede_utilizar_sus_33(self):
        self.assertEqual(self.disponible(1),38)
        self.assertGreaterEqual(self.disponible(1),33)

    def test_pr02_no_puede_consumir_reserva_pr01(self):
        self.assertEqual(self.disponible(2),17)
        self.assertLess(self.disponible(2),33)

    def test_sin_proyecto_solo_stock_libre(self):
        self.assertEqual(self.disponible(None),5)

    def test_entrega_pr01_no_modifica_reserva_pr02(self):
        self.db.execute('BEGIN IMMEDIATE')
        self.db.execute('UPDATE stock_cantidad SET cantidad=cantidad-33 WHERE producto_id=10 AND ubicacion_id=1 AND cantidad>=33')
        self.db.execute('UPDATE stock_proyecto SET cantidad=cantidad-33 WHERE proyecto_id=1 AND producto_id=10 AND ubicacion_id=1 AND cantidad>=33')
        self.assertEqual(self.db.execute('SELECT cantidad FROM stock_proyecto WHERE proyecto_id=2').fetchone()[0],12)
        self.assertEqual(self.disponible(None),5)
        self.db.commit()

    def test_no_disponibilidad_negativa_si_reservas_exceden_fisico(self):
        self.db.execute('UPDATE stock_cantidad SET cantidad=20')
        self.assertLess(self.disponible(None),0)  # Detectar inconsistencia para bloquear operaciones

if __name__ == '__main__':
    unittest.main()
