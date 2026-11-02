"""Comprueba el flujo de estado, stock y movimiento en una copia SQLite.
No invoca endpoints del servidor ni altera el inventario original.
"""
import sqlite3
import tempfile
import unittest
from pathlib import Path

ORIGEN = Path(__file__).resolve().parents[1] / 'database' / 'bodega.db'


class FlujoSolicitudAislado(unittest.TestCase):
    def setUp(self):
        self.temporal = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporal.cleanup)
        destino = Path(self.temporal.name) / 'copia.db'
        self.ruta_copia = destino
        with sqlite3.connect(f'file:{ORIGEN}?mode=ro', uri=True) as original:
            with sqlite3.connect(destino) as copia:
                original.backup(copia)
        self.db = sqlite3.connect(destino)
        self.addCleanup(self.db.close)
        self.db.execute('PRAGMA foreign_keys=ON')

    def preparar(self):
        solicitud = self.db.execute("SELECT id FROM solicitudes WHERE estado='PENDIENTE' ORDER BY id LIMIT 1").fetchone()
        stock = self.db.execute('''SELECT s.id, s.producto_id, s.ubicacion_id, s.cantidad
             FROM stock_cantidad s WHERE s.cantidad >= 10 AND s.cantidad -
             COALESCE((SELECT SUM(p.cantidad) FROM stock_proyecto p
             WHERE p.producto_id=s.producto_id AND p.ubicacion_id=s.ubicacion_id),0) >= 10
             ORDER BY s.id LIMIT 1''').fetchone()
        if not solicitud or not stock:
            self.skipTest('Se necesita solicitud pendiente y 10 unidades libres en la copia')
        return solicitud[0], stock

    def registrar_entrega(self, solicitud_id, stock, provocar_error=False):
        stock_id, producto, ubicacion, _ = stock
        self.db.execute('BEGIN IMMEDIATE')
        try:
            cursor = self.db.execute("UPDATE solicitudes SET estado='ENTREGADA' WHERE id=? AND estado='PENDIENTE'", (solicitud_id,))
            if cursor.rowcount != 1:
                self.db.rollback()
                return False
            cursor = self.db.execute('''UPDATE stock_cantidad SET cantidad=cantidad-10
                WHERE id=? AND cantidad-10 >= COALESCE((SELECT SUM(cantidad) FROM stock_proyecto
                WHERE producto_id=? AND ubicacion_id=?),0)''', (stock_id, producto, ubicacion))
            if cursor.rowcount != 1:
                raise ValueError('Stock libre insuficiente')
            self.db.execute("INSERT INTO movimientos(tipo_movimiento, producto_id, ubicacion_id, cantidad) VALUES('SALIDA',?,?,10)", (producto, ubicacion))
            if provocar_error:
                raise RuntimeError('Falla simulada antes del COMMIT')
            self.db.commit()
            return True
        except Exception:
            self.db.rollback()
            raise

    def test_entrega_cambia_estado_descuenta_y_registra_una_salida(self):
        solicitud, stock = self.preparar()
        movimientos = self.db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0]
        self.assertTrue(self.registrar_entrega(solicitud, stock))
        self.assertEqual(self.db.execute('SELECT estado FROM solicitudes WHERE id=?', (solicitud,)).fetchone()[0], 'ENTREGADA')
        self.assertEqual(self.db.execute('SELECT cantidad FROM stock_cantidad WHERE id=?', (stock[0],)).fetchone()[0], stock[3]-10)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0], movimientos+1)
        self.assertFalse(self.registrar_entrega(solicitud, stock))
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0], movimientos+1)

    def test_entrega_persiste_tras_reabrir_base_y_no_duplica(self):
        solicitud, stock = self.preparar()
        movimientos_antes = self.db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0]
        self.assertTrue(self.registrar_entrega(solicitud, stock))
        self.db.close()
        self.db = sqlite3.connect(self.ruta_copia)
        self.db.execute('PRAGMA foreign_keys=ON')
        self.assertEqual(self.db.execute('SELECT estado FROM solicitudes WHERE id=?', (solicitud,)).fetchone()[0], 'ENTREGADA')
        self.assertEqual(self.db.execute('SELECT cantidad FROM stock_cantidad WHERE id=?', (stock[0],)).fetchone()[0], stock[3] - 10)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0], movimientos_antes + 1)
        self.assertFalse(self.registrar_entrega(solicitud, stock))
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0], movimientos_antes + 1)

    def test_error_revierte_estado_stock_y_movimiento(self):
        solicitud, stock = self.preparar()
        movimientos = self.db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0]
        with self.assertRaisesRegex(RuntimeError, 'Falla simulada'):
            self.registrar_entrega(solicitud, stock, provocar_error=True)
        self.assertEqual(self.db.execute('SELECT estado FROM solicitudes WHERE id=?', (solicitud,)).fetchone()[0], 'PENDIENTE')
        self.assertEqual(self.db.execute('SELECT cantidad FROM stock_cantidad WHERE id=?', (stock[0],)).fetchone()[0], stock[3])
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0], movimientos)


if __name__ == '__main__':
    unittest.main()
