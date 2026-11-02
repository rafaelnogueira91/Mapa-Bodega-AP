"""Regresión SQLite: una entrega parcial requiere una reserva individual suficiente."""
import sqlite3
import unittest

SQL = '''SELECT sc.id, sc.ubicacion_id, sc.cantidad FROM stock_cantidad sc
 JOIN ubicaciones u ON u.id=sc.ubicacion_id
 JOIN proyectos p ON p.id=? AND p.bodega_numero=u.bodega
 WHERE sc.producto_id=? AND sc.cantidad>=?
 AND EXISTS (SELECT 1 FROM stock_proyecto sp
             WHERE sp.proyecto_id=? AND sp.producto_id=sc.producto_id
               AND sp.ubicacion_id=sc.ubicacion_id AND sp.cantidad>=?)
 ORDER BY sc.cantidad DESC LIMIT 1'''

class ReservaIndividual(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript('''
            CREATE TABLE stock_cantidad(id INTEGER PRIMARY KEY, ubicacion_id INTEGER, producto_id INTEGER, cantidad INTEGER);
            CREATE TABLE ubicaciones(id INTEGER PRIMARY KEY, bodega INTEGER);
            CREATE TABLE proyectos(id INTEGER PRIMARY KEY, bodega_numero INTEGER);
            CREATE TABLE stock_proyecto(id INTEGER PRIMARY KEY, proyecto_id INTEGER, producto_id INTEGER, ubicacion_id INTEGER, cantidad INTEGER);
            INSERT INTO ubicaciones VALUES (1,1),(2,2);
            INSERT INTO proyectos VALUES (1,1);
            INSERT INTO stock_cantidad VALUES (1,1,5,20),(2,2,5,30);
            INSERT INTO stock_proyecto VALUES (1,1,5,1,3),(2,1,5,1,4);
        ''')

    def test_no_confunde_suma_de_reservas_con_una_reserva(self):
        self.assertIsNone(self.db.execute(SQL,(1,5,6,1,6)).fetchone())

    def test_reserva_individual_suficiente(self):
        self.db.execute('UPDATE stock_proyecto SET cantidad=6 WHERE id=2')
        self.assertEqual(self.db.execute(SQL,(1,5,6,1,6)).fetchone()[0],1)

    def test_no_utiliza_otra_bodega(self):
        self.db.execute('INSERT INTO stock_proyecto VALUES (3,1,5,2,30)')
        self.assertIsNone(self.db.execute(SQL,(1,5,10,1,10)).fetchone())

if __name__ == '__main__':
    unittest.main()
