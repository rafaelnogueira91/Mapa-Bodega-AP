import sqlite3,re,pathlib,unittest
source=(pathlib.Path(__file__).resolve().parents[1]/'routes/auditoria-inventario.js').read_text()
sql=re.search(r'const devolucionesPorRevisar = await all\(`(.*?)`\);',source,re.S)
assert sql,'No se encontró la consulta de devoluciones'
class DevolucionesHistoricas(unittest.TestCase):
 def test_detecta_casos_sin_entrega_abierta(self):
  db=sqlite3.connect(':memory:')
  db.executescript("""
   CREATE TABLE productos_seriados(id INTEGER PRIMARY KEY,numero_serie TEXT,estado TEXT,ubicacion_id INTEGER);
   CREATE TABLE entregas_series_proyecto(id INTEGER PRIMARY KEY,serie_id INTEGER,proyecto_id INTEGER,personal_id INTEGER,fecha_devolucion TEXT);
   CREATE TABLE ubicaciones(id INTEGER PRIMARY KEY,codigo TEXT);
   INSERT INTO productos_seriados VALUES(1,'A','SALIDA',NULL),(2,'B','SALIDA',NULL),(3,'C','Disponible',NULL),(4,'D','SALIDA',NULL);
   INSERT INTO entregas_series_proyecto VALUES(1,1,10,2,'2026-10-01'),(2,1,11,3,'2026-10-03'),(3,2,12,4,'2026-10-02'),(4,2,12,4,NULL),(5,3,13,5,'2026-10-02');
  """)
  antes=db.total_changes
  filas=db.execute(sql.group(1)).fetchall()
  self.assertEqual(len(filas),1)
  self.assertEqual(filas[0][0],'A')
  self.assertEqual(filas[0][2],2)
  self.assertEqual(db.total_changes,antes)
  db.close()
if __name__=='__main__':unittest.main()
