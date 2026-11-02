"""Prueba de integración SQLite de la consulta real de exportación paginada."""
import pathlib, re, sqlite3, unittest
SOURCE=(pathlib.Path(__file__).resolve().parents[1]/'routes/series-proyectos.js').read_text(encoding='utf-8')
match=re.search(r'const registros=await list\(`(SELECT e\.id,e\.serie_id,s\.numero_serie,p\.codigo AS proyecto,.*?LIMIT 1000)`\s*,\s*\[cursor\]\)',SOURCE,re.S)
assert match, 'No se encontró la consulta SQL real de exportación'
SQL=match.group(1)
class ExportacionSQLite(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  self.db.executescript('''CREATE TABLE entregas_series_proyecto(id INTEGER PRIMARY KEY,serie_id INTEGER,proyecto_id INTEGER,personal_id INTEGER,ubicacion_origen_id INTEGER,ubicacion_devolucion_id INTEGER,fecha_entrega TEXT,fecha_devolucion TEXT);
CREATE TABLE productos_seriados(id INTEGER PRIMARY KEY,numero_serie TEXT);
CREATE TABLE proyectos(id INTEGER PRIMARY KEY,codigo TEXT);
CREATE TABLE personal(id INTEGER PRIMARY KEY,nombre TEXT);
CREATE TABLE ubicaciones(id INTEGER PRIMARY KEY,codigo TEXT);
INSERT INTO proyectos VALUES(1,'PR-01');INSERT INTO personal VALUES(1,'Ana');INSERT INTO ubicaciones VALUES(1,'B1-P01-U01');''')
  self.db.executemany('INSERT INTO productos_seriados VALUES(?,?)',((i,f'S-{i:05d}') for i in range(1,2206)))
  self.db.executemany('INSERT INTO entregas_series_proyecto VALUES(?, ?,1,1,1,NULL,?,?)',((i,i,'2026-10-01',None if i<=1205 else '2026-10-10') for i in range(1,2206)))
 def tearDown(self):self.db.close()
 def paginas(self):
  cursor=0;vistos=[];tamanos=[]
  while True:
   filas=self.db.execute(SQL,(cursor,)).fetchall()
   tamanos.append(len(filas))
   vistos.extend(f[0] for f in filas)
   if len(filas)!=1000:break
   cursor=filas[-1][0]
  return vistos,tamanos
 def test_exporta_1205_pendientes_sin_duplicar(self):
  vistos,tamanos=self.paginas()
  self.assertEqual(tamanos,[1000,205]);self.assertEqual(vistos,list(range(1,1206)))
  self.assertEqual(len(vistos),len(set(vistos)))
 def test_ignora_1000_devoluciones_cerradas(self):
  vistos,_=self.paginas();self.assertNotIn(1206,vistos);self.assertNotIn(2205,vistos)
 def test_pagina_vacia_si_cursor_final(self):
  self.assertEqual(self.db.execute(SQL,(1205,)).fetchall(),[])
 def test_no_modifica_base_de_datos(self):
  antes=self.db.total_changes;self.paginas();self.assertEqual(self.db.total_changes,antes)
if __name__=='__main__':unittest.main()
