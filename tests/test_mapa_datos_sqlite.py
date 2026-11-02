"""Comprobaciones no destructivas de los datos que consume GET /api/ubicaciones."""
import sqlite3
import unittest
from pathlib import Path

DB = Path(__file__).resolve().parents[1] / 'database' / 'bodega.db'
CAMPOS = {'id', 'codigo', 'bodega', 'pasillo', 'ubicacion', 'estado'}


class DatosMapaTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not DB.is_file():
            raise AssertionError(f'No existe la base de datos: {DB}')
        cls.conn = sqlite3.connect(f'file:{DB.as_posix()}?mode=ro', uri=True)

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()

    def test_integridad_sqlite(self):
        self.assertEqual(self.conn.execute('PRAGMA integrity_check').fetchone()[0], 'ok')

    def test_campos_requeridos_por_endpoint(self):
        campos = {fila[1] for fila in self.conn.execute('PRAGMA table_info(ubicaciones)')}
        self.assertFalse(CAMPOS - campos, f'Faltan campos: {CAMPOS - campos}')

    def test_codigos_validos_y_unicos(self):
        rows = self.conn.execute('SELECT codigo FROM ubicaciones').fetchall()
        codigos = [str(row[0]).strip() if row[0] is not None else '' for row in rows]
        self.assertTrue(all(codigos), 'Existen códigos de ubicación vacíos')
        self.assertEqual(len(codigos), len(set(codigos)), 'Existen códigos duplicados')

    def test_ubicaciones_con_posiciones_validas(self):
        invalidas = self.conn.execute('''SELECT COUNT(*) FROM ubicaciones
            WHERE bodega IS NULL OR bodega < 1 OR pasillo IS NULL OR pasillo < 1
            OR ubicacion IS NULL OR ubicacion < 1''').fetchone()[0]
        self.assertEqual(invalidas, 0, 'Existen posiciones incompletas')

    def test_consulta_del_mapa(self):
        rows = self.conn.execute('''SELECT id,codigo,bodega,pasillo,ubicacion,estado
            FROM ubicaciones ORDER BY bodega,pasillo,ubicacion''').fetchall()
        self.assertGreater(len(rows), 0, 'No existen ubicaciones para dibujar')
        print(f'Ubicaciones disponibles para el mapa: {len(rows)}')


if __name__ == '__main__':
    unittest.main(verbosity=2)
