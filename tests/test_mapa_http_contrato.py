"""Prueba el validador HTTP con un servidor simulado, sin npm ni cambios en SQLite."""
import json
import os
import sqlite3
import subprocess
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
with sqlite3.connect(f'file:{ROOT / "database/bodega.db"}?mode=ro', uri=True) as db:
    ROWS = [dict(zip(('id', 'codigo', 'bodega', 'pasillo', 'ubicacion', 'estado'), row))
            for row in db.execute('SELECT id,codigo,bodega,pasillo,ubicacion,estado FROM ubicaciones ORDER BY bodega,pasillo,ubicacion')]

class Handler(BaseHTTPRequestHandler):
    payload = ROWS
    status = 200

    def do_GET(self):
        if self.path != '/api/ubicaciones':
            self.send_error(404)
            return
        body = json.dumps(type(self).payload).encode('utf-8')
        self.send_response(type(self).status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass

class TestContratoHTTP(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)

    def setUp(self):
        Handler.payload = ROWS
        Handler.status = 200

    def check(self):
        env = {**os.environ, 'MAPA_BASE_URL': f'http://127.0.0.1:{self.server.server_port}'}
        return subprocess.run([sys.executable, str(ROOT / 'tests/test_mapa_http_real.py')],
                              env=env, text=True, capture_output=True, timeout=20)

    def test_respuesta_correcta(self):
        result = self.check()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(f'{len(ROWS)} ubicaciones', result.stdout)

    def test_detecta_ubicacion_faltante(self):
        Handler.payload = ROWS[:-1]
        self.assertNotEqual(self.check().returncode, 0)

    def test_detecta_ubicacion_duplicada(self):
        Handler.payload = ROWS + ROWS[:1]
        self.assertNotEqual(self.check().returncode, 0)

    def test_detecta_error_http(self):
        Handler.status = 500
        self.assertNotEqual(self.check().returncode, 0)

    def test_detecta_json_incorrecto(self):
        Handler.payload = {'ubicaciones': ROWS}
        self.assertNotEqual(self.check().returncode, 0)

if __name__ == '__main__':
    unittest.main(verbosity=2)
