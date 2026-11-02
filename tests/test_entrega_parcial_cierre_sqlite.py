"""Comprueba cierre y saldo acumulado con SQL extraído de la ruta real."""
import re
import sqlite3
import unittest
from pathlib import Path

source = (Path(__file__).resolve().parents[1] / 'server.js').read_text(encoding='utf-8')
route = source.split("app.post('/api/solicitudes/:id/entregar-parcial'")[1].split('// LISTAR SOLICITUDES')[0]

def statement(pattern):
    match = re.search(pattern, route, re.S)
    if not match:
        raise AssertionError('No se encontró SQL esperado en la ruta: ' + pattern)
    return match.group(1)

query_detail = statement(r'const detalle = await todos\(`(SELECT d\.producto_id AS productoId.*?GROUP BY d\.producto_id)`')
insert_delivery = statement(r'const cabecera = await ejecutar\(`(INSERT INTO entregas_parciales .*?VALUES \(\?,\?,\?\))`')
insert_detail = statement(r'await ejecutar\(`(INSERT INTO entregas_parciales_detalle .*?VALUES \(\?,\?,\?\))`')
close_request = statement(r'const cierre = await ejecutar\(`(UPDATE solicitudes SET estado=\'ENTREGADA\'.*?estado=\'EN PREPARACIÓN\')`')
insert_history = statement(r'await ejecutar\(`(INSERT INTO historial_solicitudes .*?VALUES \(\?, \'ENTREGA\', \?\))`')

class CierreParcialSQLite(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript('''
            CREATE TABLE solicitudes(id INTEGER PRIMARY KEY, estado TEXT);
            CREATE TABLE productos(id INTEGER PRIMARY KEY, tipo_control TEXT);
            CREATE TABLE detalle_solicitudes(id INTEGER PRIMARY KEY, solicitud_id INTEGER, producto_id INTEGER, cantidad INTEGER);
            CREATE TABLE entregas_parciales(id INTEGER PRIMARY KEY, solicitud_id INTEGER, usuario_id INTEGER, personal_destino_id INTEGER);
            CREATE TABLE entregas_parciales_detalle(id INTEGER PRIMARY KEY, entrega_id INTEGER, producto_id INTEGER, cantidad INTEGER);
            CREATE TABLE historial_solicitudes(id INTEGER PRIMARY KEY, solicitud_id INTEGER, accion TEXT, usuario_id INTEGER);
            INSERT INTO solicitudes VALUES (1,'EN PREPARACIÓN'),(2,'EN PREPARACIÓN');
            INSERT INTO productos VALUES (7,'CANTIDAD'),(8,'CANTIDAD');
            INSERT INTO detalle_solicitudes VALUES (1,1,7,10),(2,1,8,3),(3,2,7,100);
        ''')

    def tearDown(self):
        self.db.close()

    def saldos(self):
        rows = self.db.execute(query_detail, (1,)).fetchall()
        return {product: requested-delivered for product, requested, delivered, _ in rows}

    def deliver(self, items, fail=False):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            pending = self.saldos()
            for product, quantity in items.items():
                if product not in pending or quantity <= 0 or quantity > pending[product]:
                    raise ValueError('cantidad fuera del saldo')
                pending[product] -= quantity
            delivery_id = self.db.execute(insert_delivery, (1,1,1)).lastrowid
            for product, quantity in items.items():
                self.db.execute(insert_detail, (delivery_id,product,quantity))
            if fail:
                raise RuntimeError('fallo antes del cierre')
            if all(value == 0 for value in pending.values()):
                if self.db.execute(close_request, (1,)).rowcount != 1:
                    raise RuntimeError('no se pudo cerrar')
                self.db.execute(insert_history, (1,1))
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def test_parcial_no_cierra_y_final_cierra_una_vez(self):
        self.deliver({7:6,8:3})
        self.assertEqual(self.saldos(), {7:4,8:0})
        self.assertEqual(self.db.execute('SELECT estado FROM solicitudes WHERE id=1').fetchone()[0], 'EN PREPARACIÓN')
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM historial_solicitudes').fetchone()[0], 0)
        self.deliver({7:4})
        self.assertEqual(self.saldos(), {7:0,8:0})
        self.assertEqual(self.db.execute('SELECT estado FROM solicitudes WHERE id=1').fetchone()[0], 'ENTREGADA')
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM historial_solicitudes').fetchone()[0], 1)
        self.assertEqual(self.db.execute('SELECT estado FROM solicitudes WHERE id=2').fetchone()[0], 'EN PREPARACIÓN')

    def test_entrega_excesiva_no_modifica_registros(self):
        self.deliver({7:6})
        with self.assertRaises(ValueError):
            self.deliver({7:5})
        self.assertEqual(self.saldos(), {7:4,8:3})
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM entregas_parciales').fetchone()[0], 1)

    def test_fallo_revierte_detalle_y_cierre(self):
        self.deliver({7:6,8:3})
        with self.assertRaises(RuntimeError):
            self.deliver({7:4}, fail=True)
        self.assertEqual(self.saldos(), {7:4,8:0})
        self.assertEqual(self.db.execute('SELECT estado FROM solicitudes WHERE id=1').fetchone()[0], 'EN PREPARACIÓN')
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM historial_solicitudes').fetchone()[0], 0)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM entregas_parciales').fetchone()[0], 1)

if __name__ == '__main__':
    unittest.main()
