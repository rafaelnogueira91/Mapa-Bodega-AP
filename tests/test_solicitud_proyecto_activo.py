"""Comprueba la condición SQL de creación de solicitudes vinculadas a proyectos."""
import sqlite3
import unittest


class SolicitudProyectoActivo(unittest.TestCase):
    def test_creacion_solo_con_proyecto_activo_o_sin_proyecto(self):
        db = sqlite3.connect(':memory:')
        db.executescript('''
            CREATE TABLE proyectos(id INTEGER PRIMARY KEY, estado TEXT NOT NULL);
            CREATE TABLE solicitudes(id INTEGER PRIMARY KEY, supervisor_id INTEGER,
                personal_destino_id INTEGER, observaciones TEXT, proyecto_id INTEGER);
            INSERT INTO proyectos VALUES (1,'ACTIVO'),(2,'INACTIVO');
        ''')
        sql = '''INSERT INTO solicitudes(supervisor_id,personal_destino_id,observaciones,proyecto_id)
            SELECT ?,?,?,? WHERE (? IS NULL OR EXISTS (
                SELECT 1 FROM proyectos WHERE id=? AND estado='ACTIVO'))'''
        for proyecto, esperado in [(None, 1), (1, 1), (2, 0), (999, 0)]:
            cursor = db.execute(sql, (10, 20, None, proyecto, proyecto, proyecto))
            self.assertEqual(cursor.rowcount, esperado, f'Proyecto {proyecto}')
        self.assertEqual(db.execute('SELECT COUNT(*) FROM solicitudes').fetchone()[0], 2)
        db.close()


if __name__ == '__main__':
    unittest.main()
