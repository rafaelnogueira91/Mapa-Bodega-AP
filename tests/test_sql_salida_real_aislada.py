"""Ejecuta el UPDATE exacto de la salida por cantidad en SQLite temporal.
No inicia Express ni modifica database/bodega.db.
"""
import re
import sqlite3
import tempfile
import unittest
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1] / 'server.js'


def sql_salida():
    codigo = SERVER.read_text(encoding='utf-8')
    patron = r"const descuento = await ejecutarSalida\(`\s*(UPDATE stock_cantidad SET cantidad = cantidad - \?[\s\S]*?)`\s*,\s*\[cantidadNumerica"
    resultado = re.search(patron, codigo)
    if not resultado:
        raise AssertionError('No se encontró el UPDATE transaccional de server.js')
    return resultado.group(1)


class SalidaRealAislada(unittest.TestCase):
    def setUp(self):
        self.temporal = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporal.cleanup)
        self.ruta = str(Path(self.temporal.name) / 'prueba.db')
        with sqlite3.connect(self.ruta) as db:
            db.executescript('''
                CREATE TABLE stock_cantidad(id INTEGER PRIMARY KEY, producto_id INTEGER, ubicacion_id INTEGER, cantidad INTEGER);
                CREATE TABLE stock_proyecto(producto_id INTEGER, ubicacion_id INTEGER, cantidad INTEGER);
                CREATE TABLE movimientos(id INTEGER PRIMARY KEY, tipo_movimiento TEXT, producto_id INTEGER, ubicacion_id INTEGER, cantidad INTEGER);
                INSERT INTO stock_cantidad VALUES (1, 10, 20, 3);
                INSERT INTO stock_proyecto VALUES (10, 20, 2);
            ''')
        self.sql = sql_salida()

    def test_reserva_protegida_y_salida_permitida(self):
        with sqlite3.connect(self.ruta) as db:
            db.execute('BEGIN IMMEDIATE')
            self.assertEqual(db.execute(self.sql, (1, 1, 10, 20, 1, 1)).rowcount, 1)
            db.execute("INSERT INTO movimientos(tipo_movimiento,producto_id,ubicacion_id,cantidad) VALUES ('SALIDA',10,20,1)")
            db.commit()
            self.assertEqual(db.execute('SELECT cantidad FROM stock_cantidad').fetchone()[0], 2)
            self.assertEqual(db.execute(self.sql, (1, 1, 10, 20, 1, 1)).rowcount, 0)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0], 1)

    def test_fallo_del_movimiento_revierte_descuento(self):
        with sqlite3.connect(self.ruta) as db:
            db.execute('BEGIN IMMEDIATE')
            self.assertEqual(db.execute(self.sql, (1, 1, 10, 20, 1, 1)).rowcount, 1)
            try:
                db.execute('INSERT INTO tabla_inexistente VALUES (1)')
            except sqlite3.OperationalError:
                db.rollback()
            else:
                self.fail('Se esperaba un error al registrar movimiento')
            self.assertEqual(db.execute('SELECT cantidad FROM stock_cantidad').fetchone()[0], 3)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0], 0)

    def test_error_real_de_insert_revierte_stock_y_no_deja_movimiento(self):
        """Un trigger SQLite falla después del UPDATE real; ROLLBACK debe ser atómico."""
        with sqlite3.connect(self.ruta) as db:
            db.executescript("""
                CREATE TRIGGER rechazar_salida BEFORE INSERT ON movimientos
                WHEN NEW.tipo_movimiento = 'SALIDA'
                BEGIN SELECT RAISE(ABORT, 'Movimiento rechazado'); END;
            """)
            with self.assertRaisesRegex(sqlite3.IntegrityError, 'Movimiento rechazado'):
                try:
                    db.execute('BEGIN IMMEDIATE')
                    self.assertEqual(db.execute(self.sql, (1, 1, 10, 20, 1, 1)).rowcount, 1)
                    db.execute("INSERT INTO movimientos(tipo_movimiento,producto_id,ubicacion_id,cantidad) VALUES ('SALIDA',10,20,1)")
                    db.commit()
                except sqlite3.Error:
                    db.rollback()
                    raise
            self.assertEqual(db.execute('SELECT cantidad FROM stock_cantidad WHERE id=1').fetchone()[0], 3)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0], 0)
            self.assertEqual(db.execute('SELECT cantidad FROM stock_proyecto').fetchone()[0], 2)

    def test_stock_de_otro_producto_o_ubicacion_no_descuenta(self):
        """Un id de stock desactualizado no puede descontar otro producto/ubicación."""
        with sqlite3.connect(self.ruta) as db:
            self.assertEqual(db.execute(self.sql, (1, 1, 999, 20, 1, 1)).rowcount, 0)
            self.assertEqual(db.execute(self.sql, (1, 1, 10, 999, 1, 1)).rowcount, 0)
            self.assertEqual(db.execute('SELECT cantidad FROM stock_cantidad WHERE id=1').fetchone()[0], 3)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0], 0)

    def test_stock_corrupto_o_insuficiente_no_descuenta(self):
        with sqlite3.connect(self.ruta) as db:
            db.execute('UPDATE stock_proyecto SET cantidad=4')
            self.assertEqual(db.execute(self.sql, (1, 1, 10, 20, 1, 1)).rowcount, 0)
            self.assertEqual(db.execute('SELECT cantidad FROM stock_cantidad').fetchone()[0], 3)


    def test_reserva_negativa_no_puede_aumentar_stock_libre(self):
        """Una reserva corrupta negativa no debe permitir una salida."""
        with sqlite3.connect(self.ruta) as db:
            db.execute('UPDATE stock_proyecto SET cantidad=-5')
            self.assertEqual(db.execute(self.sql, (1, 1, 10, 20, 1, 1)).rowcount, 0)
            self.assertEqual(db.execute('SELECT cantidad FROM stock_cantidad').fetchone()[0], 3)

    def test_reserva_nula_no_se_trata_como_cero(self):
        """Una reserva NULL debe bloquear la salida hasta regularizar datos."""
        with sqlite3.connect(self.ruta) as db:
            db.execute('UPDATE stock_proyecto SET cantidad=NULL')
            self.assertEqual(db.execute(self.sql, (1, 1, 10, 20, 1, 1)).rowcount, 0)
            self.assertEqual(db.execute('SELECT cantidad FROM stock_cantidad').fetchone()[0], 3)

    def test_reserva_fraccionaria_no_autoriza_salida(self):
        """Una reserva corrupta fraccionaria no debe liberar stock."""
        with sqlite3.connect(self.ruta) as db:
            db.execute('UPDATE stock_proyecto SET cantidad=0.5')
            self.assertEqual(db.execute(self.sql, (1, 1, 10, 20, 1, 1)).rowcount, 0)
            self.assertEqual(db.execute('SELECT cantidad FROM stock_cantidad').fetchone()[0], 3)

    def test_stock_fraccionario_no_autoriza_salida(self):
        """Las unidades físicas por cantidad deben ser enteras."""
        with sqlite3.connect(self.ruta) as db:
            db.execute('UPDATE stock_cantidad SET cantidad=3.5')
            self.assertEqual(db.execute(self.sql, (1, 1, 10, 20, 1, 1)).rowcount, 0)
            self.assertEqual(db.execute('SELECT cantidad FROM stock_cantidad').fetchone()[0], 3.5)

    def test_otro_registro_stock_invalido_bloquea_salida(self):
        """Una fila corrupta del mismo producto y ubicación no debe pasar inadvertida."""
        for valor in (-1, 1.5, None):
            with self.subTest(valor=valor), sqlite3.connect(self.ruta) as db:
                db.execute('INSERT INTO stock_cantidad VALUES (2, 10, 20, ?)', (valor,))
                self.assertEqual(db.execute(self.sql, (1, 1, 10, 20, 1, 1)).rowcount, 0)
                self.assertEqual(db.execute('SELECT cantidad FROM stock_cantidad WHERE id=1').fetchone()[0], 3)
                self.assertEqual(db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0], 0)
                db.execute('DELETE FROM stock_cantidad WHERE id=2')

    def test_reservas_de_varios_proyectos_se_suman(self):
        """No se debe considerar libre una reserva repartida entre proyectos."""
        with sqlite3.connect(self.ruta) as db:
            db.execute('UPDATE stock_proyecto SET cantidad=1')
            db.execute('INSERT INTO stock_proyecto VALUES (10, 20, 1)')
            self.assertEqual(db.execute(self.sql, (1, 1, 10, 20, 1, 1)).rowcount, 1)
            self.assertEqual(db.execute(self.sql, (1, 1, 10, 20, 1, 1)).rowcount, 0)
            self.assertEqual(db.execute('SELECT SUM(cantidad) FROM stock_proyecto').fetchone()[0], 2)
            self.assertEqual(db.execute('SELECT cantidad FROM stock_cantidad').fetchone()[0], 2)

    def test_rollback_revierte_eliminacion_y_cambio_de_ubicacion(self):
        """La limpieza del stock y el estado de la ubicación deben ser atómicos."""
        with sqlite3.connect(self.ruta) as db:
            db.execute('CREATE TABLE ubicaciones(id INTEGER PRIMARY KEY, estado TEXT)')
            db.execute("INSERT INTO ubicaciones VALUES (20, 'Ocupada')")
            db.execute('DELETE FROM stock_proyecto')
            db.execute('UPDATE stock_cantidad SET cantidad=1')
            db.commit()
            try:
                db.execute('BEGIN IMMEDIATE')
                self.assertEqual(db.execute(self.sql, (1, 1, 10, 20, 1, 1)).rowcount, 1)
                db.execute('DELETE FROM stock_cantidad WHERE id=1 AND cantidad=0')
                db.execute("UPDATE ubicaciones SET estado='Disponible' WHERE id=20")
                raise sqlite3.IntegrityError('Fallo simulado antes de COMMIT')
            except sqlite3.IntegrityError:
                db.rollback()
            self.assertEqual(db.execute('SELECT cantidad FROM stock_cantidad WHERE id=1').fetchone()[0], 1)
            self.assertEqual(db.execute('SELECT estado FROM ubicaciones WHERE id=20').fetchone()[0], 'Ocupada')


if __name__ == '__main__':
    unittest.main()
