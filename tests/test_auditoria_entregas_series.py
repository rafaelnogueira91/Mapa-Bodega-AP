"""Valida la consulta de auditoría contra SQLite, sin modificar datos."""
import sqlite3
import unittest

SQL = "\n        SELECT ps.numero_serie, e.id AS entrega_id, e.proyecto_id,\n          e.personal_id, ps.estado, ps.ubicacion_id,\n          CASE\n            WHEN ps.id IS NULL THEN 'Entrega abierta sin serie existente'\n            WHEN ps.estado!='SALIDA' THEN 'Entrega abierta con serie no marcada como SALIDA'\n            WHEN ps.ubicacion_id IS NOT NULL THEN 'Entrega abierta con ubicación de stock'\n            WHEN sp.serie_id IS NOT NULL THEN 'Serie entregada y simultáneamente reservada'\n            ELSE 'Inconsistencia no clasificada'\n          END AS problema\n        FROM entregas_series_proyecto e\n        LEFT JOIN productos_seriados ps ON ps.id=e.serie_id\n        LEFT JOIN series_proyecto sp ON sp.serie_id=e.serie_id\n        WHERE e.fecha_devolucion IS NULL AND (\n          ps.id IS NULL OR ps.estado!='SALIDA' OR ps.ubicacion_id IS NOT NULL\n          OR sp.serie_id IS NOT NULL)\n        ORDER BY e.id DESC LIMIT 500"

class AuditoriaEntregas(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.executescript("""
          CREATE TABLE productos_seriados(id INTEGER PRIMARY KEY,numero_serie TEXT,estado TEXT,ubicacion_id INTEGER);
          CREATE TABLE series_proyecto(serie_id INTEGER,proyecto_id INTEGER);
          CREATE TABLE entregas_series_proyecto(id INTEGER PRIMARY KEY,serie_id INTEGER,proyecto_id INTEGER,personal_id INTEGER,fecha_devolucion TEXT);
          INSERT INTO productos_seriados VALUES(1,'SER-OK','SALIDA',NULL);
          INSERT INTO productos_seriados VALUES(2,'SER-DISP','Disponible',4);
          INSERT INTO productos_seriados VALUES(3,'SER-RES','SALIDA',NULL);
          INSERT INTO series_proyecto VALUES(3,8);
          INSERT INTO entregas_series_proyecto VALUES(10,1,8,3,NULL);
          INSERT INTO entregas_series_proyecto VALUES(11,2,8,3,NULL);
          INSERT INTO entregas_series_proyecto VALUES(12,3,8,3,NULL);
          INSERT INTO entregas_series_proyecto VALUES(13,99,8,3,NULL);
          INSERT INTO entregas_series_proyecto VALUES(14,2,8,3,'2026-10-11');
        """)

    def tearDown(self):
        self.db.close()

    def test_detecta_inconsistencias_sin_falsos_positivos(self):
        rows=self.db.execute(SQL).fetchall()
        self.assertEqual({r[1] for r in rows},{11,12,13})

    def test_auditoria_no_modifica_registros(self):
        antes=self.db.total_changes
        self.db.execute(SQL).fetchall()
        self.assertEqual(self.db.total_changes,antes)

if __name__=='__main__': unittest.main()
