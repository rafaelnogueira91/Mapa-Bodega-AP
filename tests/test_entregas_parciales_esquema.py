import sqlite3
import unittest
from pathlib import Path

class EsquemaEntregasParciales(unittest.TestCase):
    def test_esquema_y_restricciones(self):
        source = (Path(__file__).resolve().parents[1] / 'server.js').read_text(encoding='utf-8')
        assert 'CREATE TABLE IF NOT EXISTS entregas_parciales (' in source
        assert 'CREATE TABLE IF NOT EXISTS entregas_parciales_detalle (' in source
        db = sqlite3.connect(':memory:')
        db.execute('PRAGMA foreign_keys=ON')
        db.executescript('''
            CREATE TABLE solicitudes(id INTEGER PRIMARY KEY);
            CREATE TABLE personal(id INTEGER PRIMARY KEY);
            CREATE TABLE productos(id INTEGER PRIMARY KEY);
            CREATE TABLE entregas_parciales (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                solicitud_id INTEGER NOT NULL REFERENCES solicitudes(id),
                usuario_id INTEGER NOT NULL,
                personal_destino_id INTEGER NOT NULL REFERENCES personal(id),
                fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE entregas_parciales_detalle (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entrega_id INTEGER NOT NULL REFERENCES entregas_parciales(id),
                producto_id INTEGER NOT NULL REFERENCES productos(id),
                cantidad INTEGER NOT NULL CHECK(cantidad > 0),
                UNIQUE(entrega_id, producto_id)
            );
            INSERT INTO solicitudes VALUES(1);
            INSERT INTO personal VALUES(2);
            INSERT INTO productos VALUES(3);
            INSERT INTO entregas_parciales(solicitud_id, usuario_id, personal_destino_id) VALUES(1, 7, 2);
            INSERT INTO entregas_parciales_detalle(entrega_id, producto_id, cantidad) VALUES(1, 3, 4);
        ''')
        self.assertEqual(db.execute('SELECT SUM(cantidad) FROM entregas_parciales_detalle').fetchone()[0], 4)
        for sql in [
            'INSERT INTO entregas_parciales_detalle(entrega_id,producto_id,cantidad) VALUES(1,3,1)',
            'INSERT INTO entregas_parciales_detalle(entrega_id,producto_id,cantidad) VALUES(1,3,0)',
            'INSERT INTO entregas_parciales_detalle(entrega_id,producto_id,cantidad) VALUES(99,3,1)',
        ]:
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute(sql)

if __name__ == '__main__':
    unittest.main()
