import sqlite3,re,pathlib,unittest
source=(pathlib.Path(__file__).resolve().parents[1]/'routes/auditoria-inventario.js').read_text()
sql=re.search(r"const trazabilidadSeries = await all\(`(.*?)`\);",source,re.S)
assert sql
class AuditoriaMovimientos(unittest.TestCase):
 def test_inconsistencias_y_entregas_abiertas(self):
  db=sqlite3.connect(':memory:')
  db.executescript("""
  CREATE TABLE productos_seriados(id INTEGER PRIMARY KEY,producto_id INTEGER,numero_serie TEXT,estado TEXT,ubicacion_id INTEGER);
  CREATE TABLE movimientos(id INTEGER PRIMARY KEY,producto_id INTEGER,numero_serie TEXT,tipo_movimiento TEXT,fecha_movimiento TEXT,personal_id INTEGER);
  CREATE TABLE ubicaciones(id INTEGER PRIMARY KEY,codigo TEXT);
  CREATE TABLE entregas_series_proyecto(id INTEGER PRIMARY KEY,serie_id INTEGER,fecha_devolucion TEXT);
  INSERT INTO ubicaciones VALUES(1,'B1');
  INSERT INTO productos_seriados VALUES(1,1,'A','Disponible',1),(2,1,'B','SALIDA',NULL),(3,1,'C','SALIDA',NULL),(4,1,'D','Disponible',1);
  INSERT INTO movimientos(id,producto_id,numero_serie,tipo_movimiento,fecha_movimiento) VALUES(1,1,'A','SALIDA','2026-10-01'),(2,1,'B','DEVOLUCION','2026-10-02'),(3,1,'C','ENTRADA','2026-10-03'),(4,1,'D','SALIDA','2026-10-04');
  INSERT INTO entregas_series_proyecto VALUES(1,4,NULL);
  """)
  antes=db.total_changes
  filas=db.execute(sql.group(1)).fetchall()
  self.assertEqual({r[0] for r in filas},{'A','B','C'})
  self.assertEqual({r[5] for r in filas},{'Movimiento de bodega'})
  self.assertEqual(db.total_changes,antes)
  db.close()
if __name__=='__main__':unittest.main()
