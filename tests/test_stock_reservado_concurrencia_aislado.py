"""Regresión SQLite aislada: reservas y salidas simultáneas.

Comprueba la estrategia transaccional, NO las rutas Express. Nunca escribe en bodega.db.
"""
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path

ORIGINAL = Path(__file__).resolve().parents[1] / 'database' / 'bodega.db'


class StockReservadoConcurrencia(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'aislada.db'
        with sqlite3.connect(f'file:{ORIGINAL}?mode=ro', uri=True) as origen:
            with sqlite3.connect(self.path) as destino:
                origen.backup(destino)
        with sqlite3.connect(self.path) as db:
            fila = db.execute('SELECT id, producto_id, ubicacion_id FROM stock_cantidad ORDER BY id LIMIT 1').fetchone()
            if not fila:
                self.skipTest('Sin filas de stock para preparar la prueba')
            self.stock_id, self.producto_id, self.ubicacion_id = fila
            db.execute('DELETE FROM stock_proyecto WHERE producto_id=? AND ubicacion_id=?', (self.producto_id, self.ubicacion_id))
            db.execute('UPDATE stock_cantidad SET cantidad=3 WHERE id=?', (self.stock_id,))
            # Simula una reserva de dos unidades; sólo queda una libre.
            proyecto = db.execute('SELECT id FROM proyectos LIMIT 1').fetchone()
            if not proyecto:
                self.skipTest('Sin proyectos para crear reserva aislada')
            db.execute('INSERT INTO stock_proyecto(proyecto_id,producto_id,ubicacion_id,cantidad) VALUES(?,?,?,2)',
                       (proyecto[0], self.producto_id, self.ubicacion_id))
            db.commit()

    def _salida(self, conexion):
        conexion.execute('BEGIN IMMEDIATE')
        fisico = conexion.execute('SELECT cantidad FROM stock_cantidad WHERE id=?', (self.stock_id,)).fetchone()[0]
        reservado = conexion.execute('SELECT COALESCE(SUM(cantidad),0) FROM stock_proyecto WHERE producto_id=? AND ubicacion_id=?',
                                    (self.producto_id, self.ubicacion_id)).fetchone()[0]
        if fisico - reservado < 1:
            conexion.rollback()
            return False
        resultado = conexion.execute('UPDATE stock_cantidad SET cantidad=cantidad-1 WHERE id=? AND cantidad>=1', (self.stock_id,))
        if resultado.rowcount != 1:
            conexion.rollback()
            return False
        conexion.execute('INSERT INTO movimientos(tipo_movimiento,producto_id,ubicacion_id,cantidad) VALUES(?,?,?,?)',
                         ('SALIDA', self.producto_id, self.ubicacion_id, 1))
        conexion.commit()
        return True

    def test_dos_salidas_compiten_por_una_unidad_libre(self):
        with sqlite3.connect(self.path) as db:
            movimientos_antes = db.execute('SELECT COUNT(*) FROM movimientos WHERE tipo_movimiento=? AND producto_id=? AND ubicacion_id=?', ('SALIDA', self.producto_id, self.ubicacion_id)).fetchone()[0]
        barrera = threading.Barrier(2)
        resultados = []
        lock = threading.Lock()

        def worker():
            with sqlite3.connect(self.path, timeout=8) as db:
                barrera.wait(timeout=5)
                ok = self._salida(db)
                with lock:
                    resultados.append(ok)

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=12)
        self.assertTrue(all(not thread.is_alive() for thread in threads))
        self.assertEqual(sorted(resultados), [False, True])
        with sqlite3.connect(self.path) as db:
            self.assertEqual(db.execute('SELECT cantidad FROM stock_cantidad WHERE id=?', (self.stock_id,)).fetchone()[0], 2)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM movimientos WHERE tipo_movimiento=? AND producto_id=? AND ubicacion_id=?',
                                        ('SALIDA', self.producto_id, self.ubicacion_id)).fetchone()[0], movimientos_antes + 1)

    def test_error_al_insertar_movimiento_revierte_descuento(self):
        with sqlite3.connect(self.path) as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('UPDATE stock_cantidad SET cantidad=cantidad-1 WHERE id=?', (self.stock_id,))
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute('INSERT INTO movimientos(tipo_movimiento,producto_id,ubicacion_id,cantidad) VALUES(NULL,?,?,?)',
                           (self.producto_id, self.ubicacion_id, 1))
            db.rollback()
            self.assertEqual(db.execute('SELECT cantidad FROM stock_cantidad WHERE id=?', (self.stock_id,)).fetchone()[0], 3)


if __name__ == '__main__':
    unittest.main()
