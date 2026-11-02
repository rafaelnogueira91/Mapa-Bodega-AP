"""Regresión transaccional en copia temporal; no altera el inventario real."""
import sqlite3
import tempfile
import unittest
from pathlib import Path

DB = Path(__file__).resolve().parents[1] / 'database' / 'bodega.db'

class TransaccionEntregaAislada(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.ruta = Path(self.temp.name) / 'copia.db'
        with sqlite3.connect(f'file:{DB}?mode=ro', uri=True) as origen:
            with sqlite3.connect(self.ruta) as copia:
                origen.backup(copia)
        self.db = sqlite3.connect(self.ruta)
        self.db.execute('PRAGMA foreign_keys=ON')
        self.stock = self.db.execute('SELECT id, producto_id, ubicacion_id, cantidad FROM stock_cantidad WHERE cantidad > 0 ORDER BY id LIMIT 1').fetchone()

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def test_rollback_no_deja_salida_ni_descuento(self):
        if not self.stock:
            self.skipTest('No hay stock para la prueba')
        sid, producto, ubicacion, inicial = self.stock
        antes = self.db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0]
        try:
            self.db.execute('BEGIN IMMEDIATE')
            self.db.execute('UPDATE stock_cantidad SET cantidad=cantidad-1 WHERE id=?', (sid,))
            self.db.execute("INSERT INTO movimientos(tipo_movimiento, producto_id, ubicacion_id, cantidad) VALUES('SALIDA',?,?,1)", (producto, ubicacion))
            raise RuntimeError('Fallo simulado antes del COMMIT')
        except RuntimeError:
            self.db.rollback()
        self.assertEqual(self.db.execute('SELECT cantidad FROM stock_cantidad WHERE id=?', (sid,)).fetchone()[0], inicial)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0], antes)

    def test_stock_insuficiente_no_crea_movimiento(self):
        if not self.stock:
            self.skipTest('No hay stock para la prueba')
        sid, producto, ubicacion, inicial = self.stock
        antes = self.db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0]
        self.db.execute('BEGIN IMMEDIATE')
        resultado = self.db.execute('UPDATE stock_cantidad SET cantidad=cantidad-? WHERE id=? AND cantidad>=?', (inicial+1, sid, inicial+1))
        self.assertEqual(resultado.rowcount, 0)
        self.db.rollback()
        self.assertEqual(self.db.execute('SELECT cantidad FROM stock_cantidad WHERE id=?', (sid,)).fetchone()[0], inicial)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0], antes)

if __name__ == '__main__':
    unittest.main()
