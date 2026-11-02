"""Consulta real de auditoría: detecta y regulariza entregas abiertas duplicadas."""
import pathlib,re,sqlite3,unittest
codigo=(pathlib.Path(__file__).resolve().parents[1]/'routes'/'auditoria-inventario.js').read_text(encoding='utf-8')
coincidencia=re.search(r'const entregasSeries = await all\(`(.*?)`\);',codigo,re.S)
assert coincidencia, 'No se encontró consulta de entregas'
SQL=coincidencia.group(1)
class EntregasDuplicadas(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  self.db.executescript("\n   CREATE TABLE productos_seriados(id INTEGER PRIMARY KEY,numero_serie TEXT,estado TEXT,ubicacion_id INTEGER);\n   CREATE TABLE series_proyecto(serie_id INTEGER,proyecto_id INTEGER);\n   CREATE TABLE ubicaciones(id INTEGER PRIMARY KEY,codigo TEXT);\n   CREATE TABLE entregas_series_proyecto(id INTEGER PRIMARY KEY,serie_id INTEGER,proyecto_id INTEGER,personal_id INTEGER,fecha_devolucion TEXT);\n   INSERT INTO productos_seriados VALUES(1,'SER-1','SALIDA',NULL);\n   INSERT INTO productos_seriados VALUES(2,'SER-2','SALIDA',NULL);\n   INSERT INTO entregas_series_proyecto VALUES(10,1,4,8,NULL);\n   INSERT INTO entregas_series_proyecto VALUES(11,1,4,9,NULL);\n   INSERT INTO entregas_series_proyecto VALUES(12,2,4,8,NULL);\n  ")
 def tearDown(self):self.db.close()
 def test_dos_entregas_abiertas_alertan_ambas(self):
  filas=self.db.execute(SQL).fetchall()
  self.assertEqual({r[1] for r in filas},{10,11})
  self.assertTrue(all('Más de una entrega abierta' in r[-1] for r in filas))
 def test_cerrar_una_entrega_elimina_alerta(self):
  self.db.execute("UPDATE entregas_series_proyecto SET fecha_devolucion='2026-10-12' WHERE id=11")
  self.assertEqual(self.db.execute(SQL).fetchall(),[])
 def test_solo_lectura(self):
  antes=self.db.total_changes
  self.db.execute(SQL).fetchall()
  self.assertEqual(antes,self.db.total_changes)
if __name__=='__main__':unittest.main()
