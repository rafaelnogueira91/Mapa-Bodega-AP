"""Prueba la exclusión entre una salida y una reserva concurrentes con SQL real.
Solo crea una base temporal; nunca abre database/bodega.db.
"""
import sqlite3
import tempfile
import unittest
from pathlib import Path
from test_sql_salida_real_aislada import sql_salida

class ReservaConcurrenteSalida(unittest.TestCase):
    def test_reserva_no_puede_intercalarse_durante_salida(self):
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = str(Path(carpeta) / 'aislada.db')
            with sqlite3.connect(ruta) as db:
                db.executescript('''
                    CREATE TABLE stock_cantidad(id INTEGER PRIMARY KEY, producto_id INTEGER, ubicacion_id INTEGER, cantidad INTEGER);
                    CREATE TABLE stock_proyecto(producto_id INTEGER, ubicacion_id INTEGER, cantidad INTEGER);
                    CREATE TABLE movimientos(tipo_movimiento TEXT, producto_id INTEGER, ubicacion_id INTEGER, cantidad INTEGER);
                    INSERT INTO stock_cantidad VALUES (1,10,20,3);
                    INSERT INTO stock_proyecto VALUES (10,20,2);
                ''')
            salida = sqlite3.connect(ruta, timeout=0.1, isolation_level=None)
            reserva = sqlite3.connect(ruta, timeout=0.1, isolation_level=None)
            self.addCleanup(salida.close)
            self.addCleanup(reserva.close)
            salida.execute('BEGIN IMMEDIATE')
            self.assertEqual(salida.execute(sql_salida(), (1,1,10,20,1,1)).rowcount, 1)
            # La reserva concurrente debe esperar o fallar por bloqueo, nunca adelantarse.
            with self.assertRaises(sqlite3.OperationalError):
                reserva.execute('INSERT INTO stock_proyecto VALUES (10,20,1)')
            salida.execute("INSERT INTO movimientos VALUES ('SALIDA',10,20,1)")
            salida.execute('COMMIT')
            self.assertEqual(reserva.execute('SELECT cantidad FROM stock_cantidad').fetchone()[0], 2)
            self.assertEqual(reserva.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0], 1)
            # El descuento siguiente no puede utilizar las dos unidades reservadas.
            self.assertEqual(reserva.execute(sql_salida(), (1,1,10,20,1,1)).rowcount, 0)

if __name__ == '__main__':
    unittest.main()
