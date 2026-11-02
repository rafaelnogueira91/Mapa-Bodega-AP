"""Pruebas SQLite reales de atomicidad en devoluciones de herramientas."""
import sqlite3
import unittest

class DevolucionesSQLite(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.executescript("""
          PRAGMA foreign_keys=ON;
          CREATE TABLE ubicaciones(id INTEGER PRIMARY KEY,codigo TEXT NOT NULL);
          CREATE TABLE productos_seriados(
            id INTEGER PRIMARY KEY, producto_id INTEGER NOT NULL,
            numero_serie TEXT NOT NULL UNIQUE,estado TEXT NOT NULL,
            ubicacion_id INTEGER REFERENCES ubicaciones(id));
          CREATE TABLE proyectos(id INTEGER PRIMARY KEY);
          CREATE TABLE series_proyecto(
            serie_id INTEGER NOT NULL UNIQUE REFERENCES productos_seriados(id),
            proyecto_id INTEGER NOT NULL REFERENCES proyectos(id));
          CREATE TABLE entregas_series_proyecto(
            id INTEGER PRIMARY KEY,serie_id INTEGER NOT NULL REFERENCES productos_seriados(id),
            proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
            personal_id INTEGER NOT NULL,fecha_devolucion TEXT,
            ubicacion_devolucion_id INTEGER REFERENCES ubicaciones(id));
          INSERT INTO ubicaciones VALUES(3,'B1-P01-U01');
          INSERT INTO proyectos VALUES(4);
          INSERT INTO productos_seriados VALUES(2,1,'SER-001','SALIDA',NULL);
          INSERT INTO entregas_series_proyecto VALUES(5,2,4,8,NULL,NULL);
        """)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def devolver(self, trabajador=8, destino=3, fallo=False):
        with self.db:
            entrega=self.db.execute(
                'SELECT id,proyecto_id FROM entregas_series_proyecto '
                'WHERE serie_id=? AND personal_id=? AND fecha_devolucion IS NULL',
                (2,trabajador)).fetchone()
            if not entrega:
                raise ValueError('No existe entrega abierta para este trabajador')
            changed=self.db.execute(
                "UPDATE productos_seriados SET estado='Disponible',ubicacion_id=? "
                "WHERE id=? AND estado='SALIDA'",(destino,2)).rowcount
            if changed!=1:
                raise ValueError('Serie ya devuelta')
            self.db.execute('INSERT INTO series_proyecto(serie_id,proyecto_id) VALUES(?,?)',
                            (2,entrega[1]))
            if fallo:
                raise ValueError('Fallo simulado antes de cerrar entrega')
            closed=self.db.execute(
                'UPDATE entregas_series_proyecto '
                'SET fecha_devolucion=CURRENT_TIMESTAMP,ubicacion_devolucion_id=? '
                'WHERE id=? AND fecha_devolucion IS NULL',(destino,entrega[0])).rowcount
            if closed!=1:
                raise ValueError('Entrega ya cerrada')

    def test_devolucion_correcta_actualiza_tres_registros(self):
        self.devolver()
        self.assertEqual(self.db.execute(
            'SELECT estado,ubicacion_id FROM productos_seriados WHERE id=2').fetchone(),
            ('Disponible',3))
        self.assertEqual(self.db.execute(
            'SELECT proyecto_id FROM series_proyecto WHERE serie_id=2').fetchone(),(4,))
        self.assertIsNotNone(self.db.execute(
            'SELECT fecha_devolucion FROM entregas_series_proyecto WHERE id=5').fetchone()[0])

    def test_no_permite_segunda_devolucion(self):
        self.devolver()
        with self.assertRaises(ValueError):
            self.devolver()
        self.assertEqual(self.db.execute(
            'SELECT COUNT(*) FROM series_proyecto WHERE serie_id=2').fetchone()[0],1)

    def test_trabajador_distinto_no_modifica_stock(self):
        with self.assertRaises(ValueError):
            self.devolver(trabajador=9)
        self.assertEqual(self.db.execute(
            'SELECT estado,ubicacion_id FROM productos_seriados WHERE id=2').fetchone(),
            ('SALIDA',None))

    def test_error_revierte_toda_la_transaccion(self):
        with self.assertRaises(ValueError):
            self.devolver(fallo=True)
        self.assertEqual(self.db.execute(
            'SELECT estado,ubicacion_id FROM productos_seriados WHERE id=2').fetchone(),
            ('SALIDA',None))
        self.assertEqual(self.db.execute(
            'SELECT COUNT(*) FROM series_proyecto').fetchone()[0],0)
        self.assertIsNone(self.db.execute(
            'SELECT fecha_devolucion FROM entregas_series_proyecto WHERE id=5').fetchone()[0])

if __name__=='__main__':
    unittest.main()
