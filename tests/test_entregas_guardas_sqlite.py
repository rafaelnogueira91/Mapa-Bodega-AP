"""Prueba las consultas SQL reales de entrega de herramientas contra SQLite."""
import pathlib,re,sqlite3,unittest
source=(pathlib.Path(__file__).resolve().parents[1]/'server.js').read_text(encoding='utf-8')
lookup=re.search(r'SELECT\s+ps.id,\s+ps.producto_id,\s+ps.ubicacion_id\s+FROM productos_seriados ps\s+INNER JOIN ubicaciones u ON u.id = ps.ubicacion_id\s+INNER JOIN proyectos p ON p.id = \? AND p.bodega_numero = u.bodega\s+WHERE ps.numero_serie = \?\s+AND ps.producto_id = \?\s+AND ps.ubicacion_id IS NOT NULL\s+AND ps.estado = \'Disponible\'',source)
update=re.search(r'UPDATE productos_seriados\s+SET\s+ubicacion_id = NULL,\s+estado = \'SALIDA\'\s+WHERE id = \? AND estado = \'Disponible\' AND ubicacion_id = \?',source)
open_delivery='SELECT id FROM entregas_series_proyecto WHERE serie_id=? AND fecha_devolucion IS NULL'
assert lookup, 'No se encontró SELECT de serie disponible'
assert update, 'No se encontró UPDATE condicional'
assert open_delivery in source, 'No se encontró consulta de entrega abierta'
class EntregasSegurasSQLite(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  self.db.executescript("""
   CREATE TABLE productos_seriados(id INTEGER PRIMARY KEY,producto_id INTEGER,ubicacion_id INTEGER,numero_serie TEXT,estado TEXT);
   CREATE TABLE entregas_series_proyecto(id INTEGER PRIMARY KEY,serie_id INTEGER,fecha_devolucion TEXT);
   CREATE TABLE ubicaciones(id INTEGER PRIMARY KEY,bodega INTEGER);
   CREATE TABLE proyectos(id INTEGER PRIMARY KEY,bodega_numero INTEGER);
   INSERT INTO proyectos VALUES(9,1);
   INSERT INTO ubicaciones VALUES(3,1),(4,2),(5,1);
   INSERT INTO productos_seriados VALUES(1,7,3,'LIBRE','Disponible');
   INSERT INTO productos_seriados VALUES(2,7,NULL,'ENTREGADA','SALIDA');
   INSERT INTO productos_seriados VALUES(3,7,4,'RESERVA','Disponible');
   INSERT INTO entregas_series_proyecto VALUES(10,2,NULL);
   INSERT INTO entregas_series_proyecto VALUES(11,1,'2026-10-11');
  """)
 def tearDown(self):self.db.close()
 def buscar(self,serie):
  return self.db.execute(lookup.group(0),(9,serie,7)).fetchone()
 def test_disponible_y_devolucion_cerrada_permiten_entrega(self):
  self.assertEqual(self.buscar('LIBRE'),(1,7,3))
  self.assertIsNone(self.buscar('RESERVA'))  # bodega ajena
  self.assertIsNone(self.db.execute(open_delivery,(1,)).fetchone())
  self.assertEqual(self.db.execute(update.group(0),(1,3)).rowcount,1)
  self.assertEqual(self.db.execute('SELECT estado,ubicacion_id FROM productos_seriados WHERE id=1').fetchone(),('SALIDA',None))
 def test_serie_ya_entregada_no_es_seleccionable(self):
  self.assertIsNone(self.buscar('ENTREGADA'))
  self.assertIsNotNone(self.db.execute(open_delivery,(2,)).fetchone())
 def test_ubicacion_cambiada_impide_salida(self):
  self.db.execute('UPDATE productos_seriados SET ubicacion_id=5 WHERE id=3')
  self.assertEqual(self.db.execute(update.group(0),(3,4)).rowcount,0)
  self.assertEqual(self.db.execute('SELECT estado,ubicacion_id FROM productos_seriados WHERE id=3').fetchone(),('Disponible',5))
 def test_estado_cambiado_impide_salida_duplicada(self):
  self.db.execute(update.group(0),(1,3))
  self.assertEqual(self.db.execute(update.group(0),(1,3)).rowcount,0)
if __name__=='__main__':unittest.main()
