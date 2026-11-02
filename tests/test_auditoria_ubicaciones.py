import pathlib,re,sqlite3,unittest
code=(pathlib.Path(__file__).resolve().parents[1]/'routes'/'auditoria-inventario.js').read_text(encoding='utf-8')
query=re.search(r'const series = await all\(`(.*?)`\);',code,re.S)
assert query
class AuditoriaUbicacion(unittest.TestCase):
 def test_ubicacion_en_series_inconsistentes(self):
  db=sqlite3.connect(':memory:')
  db.executescript("CREATE TABLE productos(id INTEGER PRIMARY KEY);CREATE TABLE ubicaciones(id INTEGER PRIMARY KEY,codigo TEXT);CREATE TABLE productos_seriados(id INTEGER PRIMARY KEY,producto_id INTEGER,numero_serie TEXT,estado TEXT,ubicacion_id INTEGER);CREATE TABLE series_proyecto(serie_id INTEGER PRIMARY KEY,proyecto_id INTEGER);INSERT INTO productos VALUES(1);INSERT INTO ubicaciones VALUES(3,'B1-P01-U01');INSERT INTO productos_seriados VALUES(1,1,'SER-UBICADA','SALIDA',3);INSERT INTO productos_seriados VALUES(2,1,'SER-SIN-UBICACION','Disponible',NULL);")
  rows=db.execute(query.group(1)).fetchall()
  self.assertEqual(len(rows),2)
  self.assertEqual(next(r for r in rows if r[0]=='SER-UBICADA')[2],'B1-P01-U01')
  self.assertIsNone(next(r for r in rows if r[0]=='SER-SIN-UBICACION')[2])
if __name__=='__main__':unittest.main()
