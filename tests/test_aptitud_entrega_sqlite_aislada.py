"""Prueba SQLite aislada del bloqueo previo a entrega y reversión de escritura.
No abre ni modifica database/bodega.db; no sustituye pruebas HTTP de extremo a extremo.
"""
import re
import sqlite3
import unittest
from datetime import date, timedelta
from pathlib import Path

SERVER = (Path(__file__).resolve().parents[1] / 'server.js').read_text(encoding='utf-8')
MATCH = re.search(r'function verificarAptitudSerie\(serieId, callback\)\s*\{\s*db\.get\(`(SELECT .*?WHERE ps\.id = \?)`', SERVER, re.S)
if not MATCH:
    raise RuntimeError('No se encontró la consulta real de verificarAptitudSerie')
QUERY = MATCH.group(1)

class AptitudEntregaSQLite(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript('''
            CREATE TABLE productos_seriados (id INTEGER PRIMARY KEY, estado TEXT);
            CREATE TABLE inventario_vencimientos_series (serie_id INTEGER, fecha_vencimiento TEXT);
            CREATE TABLE inventario_revisiones_series (id INTEGER PRIMARY KEY, serie_id INTEGER, resultado TEXT, fecha_revision TEXT);
            CREATE TABLE movimientos (id INTEGER PRIMARY KEY, serie_id INTEGER, tipo_movimiento TEXT);
            INSERT INTO productos_seriados VALUES (42, 'DISPONIBLE');
        ''')
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def validar(self):
        fila = self.db.execute(QUERY, (42, 42)).fetchone()
        if not fila:
            raise ValueError('Serie inexistente')
        vencimiento, revision = fila
        return revision in ('RECHAZADA', 'OBSERVADA') or bool(vencimiento and vencimiento[:10] < date.today().isoformat())

    def intentar_salida(self):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            if self.validar():
                self.db.rollback()
                return False
            self.db.execute("UPDATE productos_seriados SET estado='SALIDA' WHERE id=42")
            self.db.execute("INSERT INTO movimientos(serie_id,tipo_movimiento) VALUES(42,'SALIDA')")
            self.db.commit()
            return True
        except Exception:
            self.db.rollback()
            raise

    def test_inspecciones_bloqueadas_no_escriben(self):
        for resultado in ('RECHAZADA', 'OBSERVADA'):
            with self.subTest(resultado=resultado):
                self.db.execute('DELETE FROM inventario_revisiones_series')
                self.db.execute('INSERT INTO inventario_revisiones_series VALUES (1,42,?,?)', (resultado, '2026-10-23'))
                self.db.commit()
                self.assertFalse(self.intentar_salida())
                self.assertEqual(self.db.execute('SELECT estado FROM productos_seriados WHERE id=42').fetchone()[0], 'DISPONIBLE')
                self.assertEqual(self.db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0], 0)

    def test_vencimiento_bloquea_sin_descontar(self):
        ayer = (date.today() - timedelta(days=1)).isoformat()
        self.db.execute('INSERT INTO inventario_vencimientos_series VALUES (42,?)', (ayer,))
        self.db.commit()
        self.assertFalse(self.intentar_salida())
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0], 0)
        self.assertEqual(self.db.execute('SELECT estado FROM productos_seriados WHERE id=42').fetchone()[0], 'DISPONIBLE')

    def test_ultima_inspeccion_prevalece(self):
        self.db.execute("INSERT INTO inventario_revisiones_series VALUES (1,42,'RECHAZADA','2026-10-21')")
        self.db.execute("INSERT INTO inventario_revisiones_series VALUES (2,42,'APROBADA','2026-10-22')")
        self.db.commit()
        self.assertTrue(self.intentar_salida())
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0], 1)

    def test_fallo_posterior_revierte_serie_y_movimiento(self):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            self.assertFalse(self.validar())
            self.db.execute("UPDATE productos_seriados SET estado='SALIDA' WHERE id=42")
            self.db.execute("INSERT INTO movimientos(serie_id,tipo_movimiento) VALUES(42,'SALIDA')")
            raise RuntimeError('Fallo simulado antes de confirmar')
        except RuntimeError:
            self.db.rollback()
        self.assertEqual(self.db.execute('SELECT estado FROM productos_seriados WHERE id=42').fetchone()[0], 'DISPONIBLE')
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0], 0)

if __name__ == '__main__':
    unittest.main()
