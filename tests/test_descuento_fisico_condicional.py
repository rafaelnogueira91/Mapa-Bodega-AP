"""Regresión SQLite para descuentos físicos de solicitudes."""
import sqlite3
import unittest

class DescuentoFisicoCondicional(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('CREATE TABLE stock_cantidad (id INTEGER PRIMARY KEY, cantidad INTEGER NOT NULL)')
        self.db.execute('INSERT INTO stock_cantidad VALUES (1, 5)')
    def tearDown(self):
        self.db.close()
    def descontar(self, cantidad):
        cursor=self.db.execute('UPDATE stock_cantidad SET cantidad=cantidad-? WHERE id=? AND cantidad>=?', (cantidad,1,cantidad))
        if cursor.rowcount==1:
            self.db.execute('DELETE FROM stock_cantidad WHERE id=? AND cantidad=0',(1,))
        return cursor.rowcount
    def test_descuento_valido(self):
        self.assertEqual(self.descontar(3),1)
        self.assertEqual(self.db.execute('SELECT cantidad FROM stock_cantidad').fetchone()[0],2)
    def test_segundo_descuento_no_sobrevende(self):
        self.assertEqual(self.descontar(4),1)
        self.assertEqual(self.descontar(4),0)
        self.assertEqual(self.db.execute('SELECT cantidad FROM stock_cantidad').fetchone()[0],1)
    def test_descuento_total_elimina_fila(self):
        self.assertEqual(self.descontar(5),1)
        self.assertIsNone(self.db.execute('SELECT cantidad FROM stock_cantidad').fetchone())
    def test_fila_inexistente_no_se_acepta(self):
        self.assertEqual(self.descontar(5),1)
        self.assertEqual(self.descontar(1),0)
if __name__=='__main__': unittest.main()
