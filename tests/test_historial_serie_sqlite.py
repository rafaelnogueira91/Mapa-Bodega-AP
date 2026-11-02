"""Prueba de integración SQL del historial sin modificar inventario."""
import pathlib
import re
import sqlite3
import unittest

SOURCE = (pathlib.Path(__file__).resolve().parents[1] / 'routes/auditoria-inventario.js').read_text()
BLOCK = SOURCE.split("app.get('/api/admin/auditoria-inventario/historial-serie'", 1)[1].split("app.get('/api/admin/auditoria-inventario'", 1)[0]
QUERIES = re.findall(r'await all\(`(.*?)`,\[.*?\]\)', BLOCK, re.S)
assert len(QUERIES) == 3, f'Se esperaban tres consultas; hay {len(QUERIES)}'

class HistorialSerieSQLite(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
          CREATE TABLE productos (id INTEGER PRIMARY KEY, codigo TEXT);
          CREATE TABLE ubicaciones (id INTEGER PRIMARY KEY, codigo TEXT);
          CREATE TABLE productos_seriados (id INTEGER PRIMARY KEY, producto_id INTEGER, numero_serie TEXT, estado TEXT, ubicacion_id INTEGER);
          CREATE TABLE movimientos (id INTEGER PRIMARY KEY, producto_id INTEGER, numero_serie TEXT, tipo_movimiento TEXT, fecha_movimiento TEXT, cantidad INTEGER, personal_id INTEGER, ubicacion_id INTEGER);
          CREATE TABLE entregas_series_proyecto (id INTEGER PRIMARY KEY, serie_id INTEGER, proyecto_id INTEGER, personal_id INTEGER, fecha_entrega TEXT, fecha_devolucion TEXT);
          INSERT INTO productos VALUES (1,'P-01');
          INSERT INTO ubicaciones VALUES (1,'B1-P01-U01');
          INSERT INTO productos_seriados VALUES (3,1,'SER-01','SALIDA',NULL),(4,1,'SER-02','Disponible',1);
          INSERT INTO movimientos VALUES (8,1,'SER-02','ENTRADA','2026-10-09 09:00:00',1,NULL,1),
                                         (9,1,'SER-01','SALIDA','2026-10-11 10:00:00',1,5,NULL);
          INSERT INTO entregas_series_proyecto VALUES (12,3,7,5,'2026-10-10 10:00:00','2026-10-12 10:00:00'),
                                                      (13,4,8,6,'2026-10-09 09:00:00',NULL);
        ''')

    def tearDown(self):
        self.db.close()

    def test_historial_serie_aislado_y_solo_lectura(self):
        cambios = self.db.total_changes
        serie = self.db.execute(QUERIES[0], ('SER-01',)).fetchall()
        self.assertEqual(len(serie), 1)
        self.assertEqual(serie[0]['id'], 3)
        movimientos = self.db.execute(QUERIES[1], (3,)).fetchall()
        entregas = self.db.execute(QUERIES[2], (3,)).fetchall()
        self.assertEqual([r['id'] for r in movimientos], [9])
        self.assertEqual([r['id'] for r in entregas], [12])
        self.assertEqual(self.db.total_changes, cambios)

    def test_serie_inexistente_no_devuelve_datos(self):
        self.assertEqual(self.db.execute(QUERIES[0], ('NO-EXISTE',)).fetchall(), [])

if __name__ == '__main__':
    unittest.main()
