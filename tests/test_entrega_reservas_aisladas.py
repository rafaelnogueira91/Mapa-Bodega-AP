"""Regresión SQL: una entrega no puede consumir reservas de otro proyecto."""
import sqlite3
import unittest

CONSULTA = """
SELECT sc.id,sc.cantidad,sc.ubicacion_id
FROM stock_cantidad sc
WHERE sc.producto_id=? AND (
 (? IS NOT NULL AND sc.cantidad >= ? AND COALESCE((
  SELECT SUM(sp.cantidad) FROM stock_proyecto sp
  WHERE sp.producto_id=sc.producto_id AND sp.ubicacion_id=sc.ubicacion_id
  AND sp.proyecto_id=?),0)>=?)
 OR (? IS NULL AND sc.cantidad-COALESCE((
  SELECT SUM(sp.cantidad) FROM stock_proyecto sp
  WHERE sp.producto_id=sc.producto_id AND sp.ubicacion_id=sc.ubicacion_id),0)>=?)
) ORDER BY sc.cantidad DESC LIMIT 1
"""

class EntregasReservas(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  self.db.executescript("""
  CREATE TABLE stock_cantidad(id INTEGER PRIMARY KEY,producto_id INTEGER,ubicacion_id INTEGER,cantidad INTEGER);
  CREATE TABLE stock_proyecto(proyecto_id INTEGER,producto_id INTEGER,ubicacion_id INTEGER,cantidad INTEGER,
   UNIQUE(proyecto_id,producto_id,ubicacion_id));
  INSERT INTO stock_cantidad VALUES(1,10,100,12),(2,10,200,8);
  INSERT INTO stock_proyecto VALUES(1,10,100,5),(2,10,100,7),(2,10,200,3);
  """)
 def tearDown(self):self.db.close()
 def elegir(self,proyecto,cantidad):
  return self.db.execute(CONSULTA,(10,proyecto,cantidad,proyecto,cantidad,proyecto,cantidad)).fetchone()
 def test_proyecto_no_toma_reserva_ajena(self):
  self.assertIsNone(self.elegir(1,6))
  self.assertEqual(self.elegir(1,5)[2],100)
  self.assertEqual(self.elegir(2,6)[2],100)
 def test_stock_libre_no_consume_reservas(self):
  self.assertIsNone(self.elegir(None,6))
  self.assertEqual(self.elegir(None,5)[2],200)
 def test_descuento_reserva_es_atomico_y_acotado(self):
  self.db.execute('BEGIN IMMEDIATE')
  c=self.db.execute("""UPDATE stock_proyecto SET cantidad=cantidad-?
  WHERE proyecto_id=? AND producto_id=? AND ubicacion_id=? AND cantidad>=?""",(5,1,10,100,5))
  self.assertEqual(c.rowcount,1)
  self.assertEqual(self.db.execute('SELECT cantidad FROM stock_proyecto WHERE proyecto_id=2 AND ubicacion_id=100').fetchone()[0],7)
  c=self.db.execute("""UPDATE stock_proyecto SET cantidad=cantidad-?
  WHERE proyecto_id=? AND producto_id=? AND ubicacion_id=? AND cantidad>=?""",(1,1,10,100,1))
  self.assertEqual(c.rowcount,0)
  self.db.rollback()
  self.assertEqual(self.db.execute('SELECT cantidad FROM stock_proyecto WHERE proyecto_id=1').fetchone()[0],5)
 def test_no_permitir_stock_fisico_inconsistente(self):
  self.db.execute('UPDATE stock_cantidad SET cantidad=4 WHERE id=1')
  self.assertIsNone(self.elegir(1,5))

if __name__=='__main__':unittest.main()
