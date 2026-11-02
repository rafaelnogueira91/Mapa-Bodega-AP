"""Verifica sin servidor que API, cliente y SQLite comparten el contrato del mapa."""
import re
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ContratoMapaTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = (ROOT / 'server.js').read_text(encoding='utf-8')
        cls.client = (ROOT / 'public/js/mapa.js').read_text(encoding='utf-8')
        cls.html = (ROOT / 'public/bodegas.html').read_text(encoding='utf-8')
        cls.db = sqlite3.connect(f'file:{(ROOT / "database/bodega.db").as_posix()}?mode=ro', uri=True)

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def test_endpoint_get_y_consulta_cliente(self):
        self.assertRegex(self.server, r'app\.get\(\s*["\']\/api\/ubicaciones["\']')
        self.assertIn("consultarMapa('/api/ubicaciones')", self.client)

    def test_campos_endpoint_disponibles_en_sqlite(self):
        ruta = self.server.index('"/api/ubicaciones"')
        sql = self.server[ruta:ruta + 1100]
        match = re.search(r'SELECT\s+(.*?)\s+FROM\s+ubicaciones', sql, re.S | re.I)
        self.assertIsNotNone(match, 'No se encontró SELECT del endpoint')
        campos = [s.strip().lower() for s in match.group(1).split(',')]
        existentes = {r[1].lower() for r in self.db.execute('PRAGMA table_info(ubicaciones)')}
        self.assertFalse(set(campos) - existentes, f'Campos faltantes: {set(campos) - existentes}')

    def test_pantalla_incluye_script_mapa(self):
        self.assertRegex(self.html, r'<script[^>]+src=["\'][^"\']*mapa\.js')

    def test_hay_ubicaciones_para_renderizar(self):
        self.assertGreater(self.db.execute('SELECT COUNT(*) FROM ubicaciones').fetchone()[0], 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
