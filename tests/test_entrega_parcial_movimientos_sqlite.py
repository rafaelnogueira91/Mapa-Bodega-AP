"""Regresión SQLite de descuentos, movimientos y rollback usando SQL de la ruta."""
import re
import sqlite3
import unittest
from pathlib import Path

source = (Path(__file__).resolve().parents[1] / 'server.js').read_text(encoding='utf-8')
route = source.split("app.post('/api/solicitudes/:id/entregar-parcial'")[1].split('// LISTAR SOLICITUDES')[0]

def extract(pattern):
    match = re.search(pattern, route, re.S)
    if not match:
        raise AssertionError(f'No se encontró la sentencia real: {pattern}')
    return match.group(1)

select_stock = extract(r'const ubicaciones = await todos\(`(SELECT sc\.id.*?ORDER BY sc\.cantidad DESC, sc\.id ASC)`')
update_reserved = extract(r'const reserva = await ejecutar\(`(UPDATE stock_proyecto SET cantidad=cantidad-\?.*?cantidad>=\?)`')
update_physical = extract(r'const fisico = await ejecutar\(`(UPDATE stock_cantidad SET cantidad=cantidad-\? WHERE id=\? AND cantidad>=\?)`')
insert_movement = extract(r'await ejecutar\(`(INSERT INTO movimientos \(tipo_movimiento,producto_id,ubicacion_id,cantidad,personal_id\).*?VALUES \(\'SALIDA\',\?,\?,\?,\?\))`')
insert_detail = extract(r'await ejecutar\(`(INSERT INTO entregas_parciales_detalle \(entrega_id,producto_id,cantidad\) VALUES \(\?,\?,\?\))`')

class ParcialMovimientoSQLite(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript('''
            CREATE TABLE proyectos(id INTEGER PRIMARY KEY, bodega_numero INTEGER);
            CREATE TABLE ubicaciones(id INTEGER PRIMARY KEY, bodega INTEGER);
            CREATE TABLE stock_cantidad(id INTEGER PRIMARY KEY, ubicacion_id INTEGER, producto_id INTEGER, cantidad INTEGER CHECK(cantidad>=0));
            CREATE TABLE stock_proyecto(id INTEGER PRIMARY KEY, proyecto_id INTEGER, producto_id INTEGER, ubicacion_id INTEGER, cantidad INTEGER CHECK(cantidad>=0));
            CREATE TABLE movimientos(id INTEGER PRIMARY KEY, tipo_movimiento TEXT, producto_id INTEGER, ubicacion_id INTEGER, cantidad INTEGER, personal_id INTEGER);
            CREATE TABLE entregas_parciales(id INTEGER PRIMARY KEY, solicitud_id INTEGER, usuario_id INTEGER, personal_destino_id INTEGER);
            CREATE TABLE entregas_parciales_detalle(id INTEGER PRIMARY KEY, entrega_id INTEGER, producto_id INTEGER, cantidad INTEGER CHECK(cantidad>0));
            INSERT INTO proyectos VALUES (1,10),(2,20);
            INSERT INTO ubicaciones VALUES (1,10),(2,10),(3,20);
            INSERT INTO stock_cantidad VALUES (1,1,7,3),(2,2,7,5),(3,3,7,50);
            INSERT INTO stock_proyecto VALUES (1,1,7,1,3),(2,1,7,2,5),(3,2,7,3,50);
        ''')

    def tearDown(self):
        self.db.close()

    def snapshot(self):
        return tuple(self.db.execute(f'SELECT * FROM {table} ORDER BY id').fetchall() for table in (
            'stock_cantidad','stock_proyecto','movimientos','entregas_parciales','entregas_parciales_detalle'))

    def deliver(self, requested, fail_after_first=False):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            cab = self.db.execute('INSERT INTO entregas_parciales(solicitud_id,usuario_id,personal_destino_id) VALUES (1,1,1)').lastrowid
            remaining = requested
            for stock_id, location, physical, reserved in self.db.execute(select_stock, (1,7)).fetchall():
                if not remaining:
                    break
                quantity = min(remaining, physical, reserved)
                self.assertEqual(self.db.execute(update_reserved, (quantity,1,7,location,quantity)).rowcount, 1)
                self.assertEqual(self.db.execute(update_physical, (quantity,stock_id,quantity)).rowcount, 1)
                self.db.execute(insert_movement, (7,location,quantity,1))
                remaining -= quantity
                if fail_after_first:
                    raise RuntimeError('fallo después del primer descuento')
            if remaining:
                raise ValueError('reserva insuficiente')
            self.db.execute(insert_detail, (cab,7,requested))
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def test_entrega_distribuida_registra_movimientos_y_detalle(self):
        self.deliver(7)
        self.assertEqual(self.db.execute('SELECT ubicacion_id,cantidad FROM movimientos ORDER BY id').fetchall(), [(2,5),(1,2)])
        self.assertEqual(self.db.execute('SELECT producto_id,cantidad FROM entregas_parciales_detalle').fetchall(), [(7,7)])
        self.assertEqual(self.db.execute('SELECT SUM(cantidad) FROM stock_cantidad WHERE ubicacion_id=3').fetchone()[0], 50)
        self.assertEqual(self.db.execute('SELECT SUM(cantidad) FROM stock_proyecto WHERE proyecto_id=1').fetchone()[0], 1)

    def test_falta_reserva_revierte_cabecera_movimientos_y_stock(self):
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, 'reserva insuficiente'):
            self.deliver(9)
        self.assertEqual(self.snapshot(), before)

    def test_fallo_intermedio_revierte_todo(self):
        before = self.snapshot()
        with self.assertRaisesRegex(RuntimeError, 'primer descuento'):
            self.deliver(7, fail_after_first=True)
        self.assertEqual(self.snapshot(), before)

if __name__ == '__main__':
    unittest.main()
