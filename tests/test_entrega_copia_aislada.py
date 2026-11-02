"""Prueba de descuento y movimiento en copia temporal, nunca en la base real."""
import sqlite3
import tempfile
import unittest
from pathlib import Path

ORIGEN = Path(__file__).resolve().parents[1] / 'database' / 'bodega.db'

class EntregaCopiaAislada(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = Path(self.temp.name) / 'bodega-prueba.db'
        # SQLite backup preserva una instantánea consistente, incluso si hay WAL activo.
        with sqlite3.connect(f'file:{ORIGEN}?mode=ro', uri=True) as fuente:
            with sqlite3.connect(self.db) as destino:
                fuente.backup(destino)
        self.con = sqlite3.connect(self.db)
        self.con.execute('PRAGMA foreign_keys=ON')

    def tearDown(self):
        self.con.close()
        self.temp.cleanup()

    def test_entrega_controlada_y_saldo(self):
        fila = self.con.execute('''SELECT s.id, s.producto_id, s.ubicacion_id, s.cantidad,
                   COALESCE((SELECT SUM(p.cantidad) FROM stock_proyecto p
                             WHERE p.producto_id=s.producto_id AND p.ubicacion_id=s.ubicacion_id),0)
                   FROM stock_cantidad s WHERE s.cantidad >= 10 ORDER BY s.id LIMIT 1''').fetchone()
        if fila is None:
            self.skipTest('No hay ubicación con al menos 10 unidades en la copia')
        stock_id, producto, ubicacion, inicial, reservado = fila
        if inicial - reservado < 10:
            self.skipTest('No hay 10 unidades libres en la ubicación seleccionada')
        movimientos_antes = self.con.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0]
        self.con.execute('BEGIN IMMEDIATE')
        cursor = self.con.execute('''UPDATE stock_cantidad SET cantidad=cantidad-10
             WHERE id=? AND cantidad-10 >= COALESCE((SELECT SUM(cantidad) FROM stock_proyecto
             WHERE producto_id=? AND ubicacion_id=?),0)''', (stock_id, producto, ubicacion))
        self.assertEqual(cursor.rowcount, 1)
        self.con.execute('''INSERT INTO movimientos(tipo_movimiento, producto_id, ubicacion_id, cantidad)
             VALUES('SALIDA', ?, ?, 10)''', (producto, ubicacion))
        self.con.commit()
        self.assertEqual(self.con.execute('SELECT cantidad FROM stock_cantidad WHERE id=?',(stock_id,)).fetchone()[0], inicial-10)
        self.assertEqual(self.con.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0], movimientos_antes+1)

    def test_descuento_imposible_no_altera_stock(self):
        fila = self.con.execute('SELECT id, producto_id, ubicacion_id, cantidad FROM stock_cantidad ORDER BY id LIMIT 1').fetchone()
        if fila is None:
            self.skipTest('No hay stock para probar')
        stock_id, producto, ubicacion, inicial = fila
        cursor = self.con.execute('''UPDATE stock_cantidad SET cantidad=cantidad-?
            WHERE id=? AND cantidad >= ?''', (inicial+1, stock_id, inicial+1))
        self.assertEqual(cursor.rowcount, 0)
        self.assertEqual(self.con.execute('SELECT cantidad FROM stock_cantidad WHERE id=?',(stock_id,)).fetchone()[0], inicial)

if __name__ == '__main__':
    unittest.main()
