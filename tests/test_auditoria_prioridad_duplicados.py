"""Auditoría prioriza entregas duplicadas aun cuando la serie tiene otros problemas."""
import pathlib,re,sqlite3,unittest
source=(pathlib.Path(__file__).resolve().parents[1]/'routes/auditoria-inventario.js').read_text()
match=re.search(r'const entregasSeries = await all\(`(.*?)`\);',source,re.S)
assert match
SQL=match.group(1)
class AuditoriaPrioridad(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  self.db.executescript("""
   CREATE TABLE productos_seriados(id INTEGER PRIMARY KEY,numero_serie TEXT,estado TEXT,ubicacion_id INTEGER);
   CREATE TABLE series_proyecto(serie_id INTEGER,proyecto_id INTEGER);
   CREATE TABLE ubicaciones(id INTEGER PRIMARY KEY,codigo TEXT);
   CREATE TABLE entregas_series_proyecto(id INTEGER PRIMARY KEY,serie_id INTEGER,proyecto_id INTEGER,personal_id INTEGER,fecha_devolucion TEXT);
   INSERT INTO productos_seriados VALUES(1,'SERIE-1','Disponible',2);
   INSERT INTO ubicaciones VALUES(2,'B1-P01-U01');
   INSERT INTO series_proyecto VALUES(1,7);
   INSERT INTO entregas_series_proyecto VALUES(10,1,7,8,NULL);
   INSERT INTO entregas_series_proyecto VALUES(11,1,7,9,NULL);
  """)
 def tearDown(self):self.db.close()
 def test_duplicados_tienen_prioridad_aun_con_estado_incorrecto(self):
  rows=self.db.execute(SQL).fetchall()
  self.assertEqual(len(rows),2)
  self.assertTrue(all('Más de una entrega abierta' in row[-1] for row in rows))
 def test_tras_cerrar_duplicado_se_muestra_inconsistencia_de_estado(self):
  self.db.execute("UPDATE entregas_series_proyecto SET fecha_devolucion='2026-10-12' WHERE id=11")
  rows=self.db.execute(SQL).fetchall()
  self.assertEqual(len(rows),1)
  self.assertIn('no marcada como SALIDA',rows[0][-1])
 def test_consulta_no_modifica_inventario(self):
  antes=self.db.total_changes
  self.db.execute(SQL).fetchall()
  self.assertEqual(antes,self.db.total_changes)
if __name__=='__main__':unittest.main()
