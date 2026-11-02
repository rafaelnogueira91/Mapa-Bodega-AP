"""Prueba de integración SQLite de la consulta real de auditoría de entregas."""
import pathlib
import re
import sqlite3
import unittest

RUTA = pathlib.Path(__file__).resolve().parents[1] / 'routes' / 'auditoria-inventario.js'
CODIGO = RUTA.read_text(encoding='utf-8')
PATRON = r'const entregasSeries = await all\(`(.*?)`\);'
COINCIDENCIA = re.search(PATRON, CODIGO, re.DOTALL)
if not COINCIDENCIA:
    raise RuntimeError('No se encontró la consulta real de auditoría de entregas')
CONSULTA = COINCIDENCIA.group(1)

class IntegracionAuditoria(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
          CREATE TABLE ubicaciones(id INTEGER PRIMARY KEY, codigo TEXT);
          CREATE TABLE productos_seriados(id INTEGER PRIMARY KEY, numero_serie TEXT,
            estado TEXT, ubicacion_id INTEGER);
          CREATE TABLE series_proyecto(serie_id INTEGER PRIMARY KEY, proyecto_id INTEGER);
          CREATE TABLE entregas_series_proyecto(id INTEGER PRIMARY KEY, serie_id INTEGER,
            proyecto_id INTEGER, personal_id INTEGER, fecha_devolucion TEXT);
          INSERT INTO ubicaciones VALUES(4,'B1-P01-U01');
          INSERT INTO productos_seriados VALUES(1,'SER-OK','SALIDA',NULL);
          INSERT INTO productos_seriados VALUES(2,'SER-DISP','Disponible',4);
          INSERT INTO productos_seriados VALUES(3,'SER-RES','SALIDA',NULL);
          INSERT INTO series_proyecto VALUES(3,8);
          INSERT INTO entregas_series_proyecto VALUES(10,1,8,3,NULL);
          INSERT INTO entregas_series_proyecto VALUES(11,2,8,3,NULL);
          INSERT INTO entregas_series_proyecto VALUES(12,3,8,3,NULL);
          INSERT INTO entregas_series_proyecto VALUES(13,99,8,3,NULL);
        """)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def consultar(self):
        return {r['entrega_id']:dict(r) for r in self.db.execute(CONSULTA)}

    def test_detecta_tres_problemas_y_codigo_de_ubicacion(self):
        registros=self.consultar()
        self.assertEqual(set(registros),{11,12,13})
        self.assertEqual(registros[11]['ubicacion_codigo'],'B1-P01-U01')
        self.assertIn('simultáneamente reservada',registros[12]['problema'])
        self.assertIn('sin serie existente',registros[13]['problema'])

    def test_alertas_desaparecen_tras_regularizacion(self):
        self.db.execute("UPDATE productos_seriados SET estado='SALIDA', ubicacion_id=NULL WHERE id=2")
        self.db.execute("DELETE FROM series_proyecto WHERE serie_id=3")
        self.db.execute("UPDATE entregas_series_proyecto SET fecha_devolucion='2026-10-12' WHERE id=13")
        self.db.commit()
        self.assertEqual(self.consultar(),{})

    def test_auditoria_es_solo_lectura(self):
        antes=self.db.total_changes
        self.consultar()
        self.assertEqual(self.db.total_changes,antes)

if __name__=='__main__':
    unittest.main()
