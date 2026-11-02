import sqlite3
import unittest
from pathlib import Path

SQL = Path(__file__).resolve().parents[1].joinpath('server.js').read_text(encoding='utf-8')

class IdempotenciaEntregas(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.execute('CREATE TABLE entregas_parciales (id INTEGER PRIMARY KEY)')
        self.db.execute('''CREATE TABLE entregas_parciales_idempotencia (
            clave TEXT PRIMARY KEY, solicitud_id INTEGER NOT NULL,
            usuario_id INTEGER NOT NULL,
            entrega_id INTEGER NOT NULL REFERENCES entregas_parciales(id))''')

    def test_reintento_no_duplica(self):
        self.db.execute('INSERT INTO entregas_parciales VALUES (1)')
        self.db.execute('INSERT INTO entregas_parciales_idempotencia VALUES (?,?,?,?)', ('a'*32, 5, 2, 1))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('INSERT INTO entregas_parciales_idempotencia VALUES (?,?,?,?)', ('a'*32, 5, 2, 1))
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM entregas_parciales_idempotencia').fetchone()[0], 1)

    def test_rollback_libera_clave(self):
        self.db.execute('BEGIN')
        self.db.execute('INSERT INTO entregas_parciales VALUES (2)')
        self.db.execute('INSERT INTO entregas_parciales_idempotencia VALUES (?,?,?,?)', ('b'*32, 5, 2, 2))
        self.db.rollback()
        self.db.execute('INSERT INTO entregas_parciales VALUES (2)')
        self.db.execute('INSERT INTO entregas_parciales_idempotencia VALUES (?,?,?,?)', ('b'*32, 5, 2, 2))
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM entregas_parciales_idempotencia').fetchone()[0], 1)

    def test_servidor_usa_clave_en_transaccion(self):
        inicio = SQL.index("app.post('/api/solicitudes/:id/entregar-parcial'")
        fin = SQL.index('// LISTAR SOLICITUDES', inicio)
        ruta = SQL[inicio:fin]
        self.assertIn('Idempotency-Key', ruta)
        self.assertIn('INSERT INTO entregas_parciales_idempotencia', ruta)
        self.assertLess(ruta.index('BEGIN IMMEDIATE TRANSACTION'), ruta.index('INSERT INTO entregas_parciales_idempotencia'))
        self.assertLess(ruta.index('INSERT INTO entregas_parciales_idempotencia'), ruta.rindex("await ejecutar('COMMIT')"))

if __name__ == '__main__':
    unittest.main()
