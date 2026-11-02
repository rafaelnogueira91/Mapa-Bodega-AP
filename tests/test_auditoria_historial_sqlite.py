"""Prueba de integración SQL del historial: aislamiento por serie y solo lectura."""
import pathlib
import re
import sqlite3
import unittest

SOURCE = (pathlib.Path(__file__).resolve().parents[1] / 'routes/auditoria-inventario.js').read_text()
HISTORIAL = SOURCE.split("app.get('/api/admin/auditoria-inventario/historial-serie'", 1)[1].split("app.get('/api/admin/auditoria-inventario'", 1)[0]
SQL = re.findall(r'await all\(`(.*?)`,\[(.*?)\]\)', HISTORIAL, re.S)
assert len(SQL) == 3, f'Se esperaban 3 consultas de historial, encontradas: {len(SQL)}'

class HistorialSqliteReal(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript('''
            CREATE TABLE productos(id INTEGER PRIMARY KEY, codigo TEXT);
            CREATE TABLE ubicaciones(id INTEGER PRIMARY KEY, codigo TEXT);
            CREATE TABLE productos_seriados(id INTEGER PRIMARY KEY,producto_id INTEGER,numero_serie TEXT,estado TEXT,ubicacion_id INTEGER);
            CREATE TABLE movimientos(id INTEGER PRIMARY KEY,producto_id INTEGER,numero_serie TEXT,tipo_movimiento TEXT,fecha_movimiento TEXT,cantidad INTEGER,personal_id INTEGER,ubicacion_id INTEGER);
            CREATE TABLE entregas_series_proyecto(id INTEGER PRIMARY KEY,serie_id INTEGER,proyecto_id INTEGER,personal_id INTEGER,fecha_entrega TEXT,fecha_devolucion TEXT);
            INSERT INTO productos VALUES (1,'TALADRO');
            INSERT INTO ubicaciones VALUES (1,'B1-P01-U01');
            INSERT INTO productos_seriados VALUES (3,1,'SER-01','SALIDA',NULL),(4,1,'SER-02','Disponible',1);
            INSERT INTO movimientos VALUES (9,1,'SER-01','SALIDA','2026-10-11 10:00:00',1,20,NULL),
                                          (10,1,'SER-02','ENTRADA','2026-10-11 11:00:00',1,NULL,1);
            INSERT INTO entregas_series_proyecto VALUES (12,3,7,20,'2026-10-10 10:00:00','2026-10-12 10:00:00'),
                                                        (13,4,8,21,'2026-10-10 10:00:00',NULL);
        ''')

    def tearDown(self):
        self.db.close()

    def test_historial_separado_y_sin_modificaciones(self):
        before = self.db.total_changes
        herramienta = self.db.execute(SQL[0][0], ('SER-01',)).fetchall()
        movimientos = self.db.execute(SQL[1][0], (3,)).fetchall()
        entregas = self.db.execute(SQL[2][0], (3,)).fetchall()
        self.assertEqual(len(herramienta), 1)
        self.assertEqual(herramienta[0][1], 'SER-01')
        self.assertEqual([r[0] for r in movimientos], [9])
        self.assertEqual([r[0] for r in entregas], [12])
        self.assertEqual(before, self.db.total_changes)

    def test_serie_inexistente_no_se_confunde_con_otra(self):
        self.assertEqual(self.db.execute(SQL[0][0], ('NO-EXISTE',)).fetchall(), [])

if __name__ == '__main__':
    unittest.main()
