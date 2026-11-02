"""Verifica que dos conexiones no puedan confirmar la misma entrega.
Opera exclusivamente sobre una copia temporal de SQLite; no llama al servidor.
"""
import sqlite3
import tempfile
import unittest
from pathlib import Path

ORIGEN = Path(__file__).resolve().parents[1] / 'database' / 'bodega.db'


class EntregaConcurrenteAislada(unittest.TestCase):
    def test_segundo_intento_no_duplica_descuento_ni_movimiento(self):
        with tempfile.TemporaryDirectory() as temporal:
            ruta = Path(temporal) / 'inventario_prueba.db'
            with sqlite3.connect(f'file:{ORIGEN}?mode=ro', uri=True) as origen:
                with sqlite3.connect(ruta) as destino:
                    origen.backup(destino)
            with sqlite3.connect(ruta, timeout=3) as a, sqlite3.connect(ruta, timeout=3) as b:
                solicitud = a.execute("SELECT id FROM solicitudes WHERE estado='PENDIENTE' ORDER BY id LIMIT 1").fetchone()
                stock = a.execute('''SELECT s.id, s.producto_id, s.ubicacion_id, s.cantidad
                    FROM stock_cantidad s WHERE s.cantidad - COALESCE((SELECT SUM(p.cantidad)
                    FROM stock_proyecto p WHERE p.producto_id=s.producto_id
                    AND p.ubicacion_id=s.ubicacion_id),0) >= 10 ORDER BY s.id LIMIT 1''').fetchone()
                if not solicitud or not stock:
                    self.skipTest('La copia no contiene una solicitud pendiente y 10 unidades libres')
                solicitud_id = solicitud[0]
                stock_id, producto, ubicacion, inicial = stock
                movimientos_antes = a.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0]

                def intentar(conexion):
                    conexion.execute('BEGIN IMMEDIATE')
                    try:
                        actualizado = conexion.execute("UPDATE solicitudes SET estado='ENTREGADA' WHERE id=? AND estado='PENDIENTE'", (solicitud_id,))
                        if actualizado.rowcount != 1:
                            conexion.rollback()
                            return False
                        descontado = conexion.execute('''UPDATE stock_cantidad SET cantidad=cantidad-10
                            WHERE id=? AND cantidad-10 >= COALESCE((SELECT SUM(cantidad)
                            FROM stock_proyecto WHERE producto_id=? AND ubicacion_id=?),0)''', (stock_id, producto, ubicacion))
                        if descontado.rowcount != 1:
                            raise ValueError('Stock insuficiente')
                        conexion.execute("INSERT INTO movimientos(tipo_movimiento, producto_id, ubicacion_id, cantidad) VALUES('SALIDA',?,?,10)", (producto, ubicacion))
                        conexion.commit()
                        return True
                    except Exception:
                        conexion.rollback()
                        raise

                self.assertTrue(intentar(a))
                self.assertFalse(intentar(b))
                self.assertEqual(a.execute('SELECT cantidad FROM stock_cantidad WHERE id=?', (stock_id,)).fetchone()[0], inicial-10)
                self.assertEqual(a.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0], movimientos_antes+1)
                self.assertEqual(b.execute('SELECT estado FROM solicitudes WHERE id=?', (solicitud_id,)).fetchone()[0], 'ENTREGADA')


if __name__ == '__main__':
    unittest.main()
