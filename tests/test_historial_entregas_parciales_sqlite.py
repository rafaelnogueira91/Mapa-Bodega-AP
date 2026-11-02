"""Verifica las consultas reales del endpoint de historial con SQLite."""
import re
import sqlite3
import unittest
from pathlib import Path

source = (Path(__file__).resolve().parents[1] / 'server.js').read_text(encoding='utf-8')
route = source.split("app.get('/api/solicitudes/:id/entregas-parciales'")[1].split('// Entrega parcial transaccional')[0]

def sql(pattern):
    match = re.search(pattern, route, re.S)
    if not match:
        raise AssertionError('No se encontró la consulta del endpoint: ' + pattern)
    return match.group(1)

lookup = sql(r'db\.get\(`(SELECT s\.id FROM solicitudes s WHERE s\.id=\? \$\{acceso\})`')
detail = sql(r'db\.all\(`(SELECT ep\.id AS entregaId.*?ORDER BY ep\.id ASC, epd\.producto_id ASC)`')

class HistorialParcialSQLite(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript('''
            CREATE TABLE personal(id INTEGER PRIMARY KEY, correo TEXT, rut TEXT);
            CREATE TABLE solicitudes(id INTEGER PRIMARY KEY, supervisor_id INTEGER);
            CREATE TABLE entregas_parciales(id INTEGER PRIMARY KEY, solicitud_id INTEGER,
                usuario_id INTEGER, personal_destino_id INTEGER, fecha TEXT);
            CREATE TABLE entregas_parciales_detalle(entrega_id INTEGER, producto_id INTEGER, cantidad INTEGER);
            INSERT INTO personal VALUES (1,'supervisor1@empresa.cl','111'),(2,'supervisor2@empresa.cl','222');
            INSERT INTO solicitudes VALUES (10,1),(20,2);
            INSERT INTO entregas_parciales VALUES
                (1,10,4,8,'2026-10-16'),(2,10,4,8,'2026-10-17'),(3,20,5,9,'2026-10-17');
            INSERT INTO entregas_parciales_detalle VALUES
                (1,7,3),(1,8,2),(2,7,4),(3,7,99);
        ''')

    def tearDown(self):
        self.db.close()

    def test_historial_ordenado_y_aislado(self):
        rows = self.db.execute(detail, (10,)).fetchall()
        self.assertEqual([(r[0],r[4],r[5]) for r in rows], [(1,7,3),(1,8,2),(2,7,4)])
        self.assertEqual(len(self.db.execute(detail, (20,)).fetchall()), 1)

    def test_supervisor_solo_ve_sus_solicitudes(self):
        access = '''AND EXISTS (
            SELECT 1 FROM personal identidad WHERE identidad.id=s.supervisor_id
            AND (LOWER(identidad.correo)=LOWER(?) OR LOWER(identidad.rut)=LOWER(?))
        )'''
        query = lookup.replace('${acceso}', access)
        self.assertEqual(self.db.execute(query,(10,'SUPERVISOR1@EMPRESA.CL','')).fetchone(), (10,))
        self.assertIsNone(self.db.execute(query,(20,'supervisor1@empresa.cl','')).fetchone())
        self.assertEqual(self.db.execute(query,(20,'','222')).fetchone(), (20,))

    def test_solicitud_ausente(self):
        self.assertIsNone(self.db.execute(lookup.replace('${acceso}', ''),(999,)).fetchone())

if __name__ == '__main__':
    unittest.main()
