"""Comprueba que las filas SQLite se pueden agrupar como espera construirMapa.
No escribe en la base ni necesita dependencias Node.
"""
import json
import sqlite3
import unittest
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / 'database' / 'bodega.db'


class RenderDatosMapaTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        conn = sqlite3.connect(f'file:{DB.as_posix()}?mode=ro', uri=True)
        conn.row_factory = sqlite3.Row
        try:
            cls.filas = [dict(fila) for fila in conn.execute(
                'SELECT id,codigo,bodega,pasillo,ubicacion,estado FROM ubicaciones '
                'ORDER BY bodega,pasillo,ubicacion'
            )]
        finally:
            conn.close()

    def test_respuesta_serializable_como_json(self):
        datos = json.loads(json.dumps(self.filas, ensure_ascii=False))
        self.assertEqual(len(datos), len(self.filas))
        self.assertTrue(datos)

    def test_agrupacion_por_bodega_y_pasillo(self):
        grupos = defaultdict(list)
        for fila in self.filas:
            grupos[(int(fila['bodega']), int(fila['pasillo']))].append(fila)
        self.assertTrue(grupos)
        self.assertEqual(sum(map(len, grupos.values())), len(self.filas))
        for posiciones in grupos.values():
            self.assertEqual(len(posiciones), len({p['codigo'] for p in posiciones}))

    def test_orden_y_valores_para_celdas(self):
        anterior = None
        for fila in self.filas:
            clave = (int(fila['bodega']), int(fila['pasillo']), int(fila['ubicacion']))
            if anterior is not None:
                self.assertLessEqual(anterior, clave)
            anterior = clave
            self.assertIsInstance(fila['codigo'], str)
            self.assertTrue(fila['codigo'].strip())
            self.assertIsNotNone(fila['estado'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
