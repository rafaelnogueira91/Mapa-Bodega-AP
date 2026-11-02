"""Prueba de concurrencia de stock sobre copia SQLite. No ejecuta Express."""
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path

DB = Path(__file__).resolve().parents[1] / 'database' / 'bodega.db'


class SalidasConcurrentesSQLite(unittest.TestCase):
    def test_dos_salidas_no_consumen_la_misma_unidad(self):
        with tempfile.TemporaryDirectory() as temp:
            ruta = Path(temp) / 'bodega-prueba.db'
            with sqlite3.connect(f'file:{DB}?mode=ro', uri=True) as original:
                with sqlite3.connect(ruta) as copia:
                    original.backup(copia)
            with sqlite3.connect(ruta) as db:
                fila = db.execute('SELECT id, cantidad FROM stock_cantidad ORDER BY id LIMIT 1').fetchone()
                if not fila:
                    self.skipTest('La copia no tiene filas de stock')
                stock_id, original_qty = fila
                db.execute('UPDATE stock_cantidad SET cantidad=1 WHERE id=?', (stock_id,))
                db.commit()
            barrera = threading.Barrier(2)
            resultados = []
            candado = threading.Lock()

            def intentar_salida():
                conexion = sqlite3.connect(ruta, timeout=5)
                try:
                    barrera.wait(timeout=5)
                    conexion.execute('BEGIN IMMEDIATE')
                    resultado = conexion.execute(
                        'UPDATE stock_cantidad SET cantidad=cantidad-1 WHERE id=? AND cantidad>=1',
                        (stock_id,)
                    )
                    conexion.commit()
                    with candado:
                        resultados.append(resultado.rowcount)
                finally:
                    conexion.close()

            hilos = [threading.Thread(target=intentar_salida) for _ in range(2)]
            for hilo in hilos:
                hilo.start()
            for hilo in hilos:
                hilo.join(timeout=10)
            self.assertTrue(all(not hilo.is_alive() for hilo in hilos))
            self.assertEqual(sorted(resultados), [0, 1])
            with sqlite3.connect(ruta) as db:
                self.assertEqual(db.execute('SELECT cantidad FROM stock_cantidad WHERE id=?', (stock_id,)).fetchone()[0], 0)
            self.assertGreaterEqual(original_qty, 0)


if __name__ == '__main__':
    unittest.main()
