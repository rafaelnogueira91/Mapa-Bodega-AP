import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verificar_instalacion import diagnosticar

class DiagnosticoInstalacion(unittest.TestCase):
    def test_proyecto_incompleto(self):
        with tempfile.TemporaryDirectory() as d:
            resultado = diagnosticar(Path(d), comprobar_node=False)
            self.assertFalse(resultado['apto_para_iniciar'])
            self.assertTrue(any('server.js' in e for e in resultado['errores']))

    def test_no_modifica_bd_existente(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            (base/'server.js').write_text('')
            (base/'package.json').write_text(json.dumps({'scripts': {'start': 'node server.js'}}))
            (base/'public').mkdir()
            (base/'routes').mkdir()
            (base/'database').mkdir()
            bd = base/'database'/'bodega.db'
            with sqlite3.connect(bd) as con:
                con.execute('CREATE TABLE prueba(valor TEXT)')
                con.execute("INSERT INTO prueba VALUES('intacto')")
            antes = bd.read_bytes()
            resultado = diagnosticar(base, comprobar_node=False)
            self.assertTrue(resultado['apto_para_iniciar'])
            self.assertEqual(bd.read_bytes(), antes)

    def test_faltan_dependencias_impide_inicio(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            (base/'server.js').write_text('')
            (base/'package.json').write_text(json.dumps({
                'scripts': {'start': 'node server.js'},
                'dependencies': {'express': '^5.1.0', 'sqlite3': '^5.1.7'}
            }))
            (base/'public').mkdir()
            (base/'routes').mkdir()
            resultado = diagnosticar(base, comprobar_node=True)
            self.assertFalse(resultado['apto_para_iniciar'])
            self.assertTrue(any('express' in e and 'sqlite3' in e for e in resultado['errores']))

    def test_dependencias_presentes(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            (base/'server.js').write_text('')
            (base/'package.json').write_text(json.dumps({
                'scripts': {'start': 'node server.js'},
                'dependencies': {'express': '^5.1.0'}
            }))
            (base/'public').mkdir()
            (base/'routes').mkdir()
            (base/'node_modules'/'express').mkdir(parents=True)
            (base/'node_modules'/'express'/'package.json').write_text('{}')
            resultado = diagnosticar(base, comprobar_node=True)
            self.assertTrue(resultado['apto_para_iniciar'])
            self.assertIn('Dependencias npm declaradas presentes', resultado['correctos'])

    def test_sintaxis_servidor_invalida_impide_inicio(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            (base/'server.js').write_text('const = ;')
            (base/'package.json').write_text(json.dumps({'scripts': {'start': 'node server.js'}}))
            (base/'public').mkdir()
            (base/'routes').mkdir()
            resultado = diagnosticar(base, comprobar_node=True)
            self.assertFalse(resultado['apto_para_iniciar'])
            self.assertTrue(any('Sintaxis JavaScript inválida' in e for e in resultado['errores']))

    def test_sintaxis_ruta_invalida_impide_inicio(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            (base/'server.js').write_text('const ok = true;')
            (base/'package.json').write_text(json.dumps({'scripts': {'start': 'node server.js'}}))
            (base/'public').mkdir()
            (base/'routes').mkdir()
            (base/'routes'/'fallo.js').write_text('function () {')
            resultado = diagnosticar(base, comprobar_node=True)
            self.assertFalse(resultado['apto_para_iniciar'])
            self.assertTrue(any('routes/fallo.js' in e for e in resultado['errores']))

    def test_archivo_sqlite_invalido(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            (base/'server.js').write_text('')
            (base/'package.json').write_text('{"scripts":{"start":"node server.js"}}')
            (base/'public').mkdir()
            (base/'routes').mkdir()
            (base/'database').mkdir()
            (base/'database'/'bodega.db').write_text('no es SQLite')
            resultado = diagnosticar(base, comprobar_node=False)
            self.assertFalse(resultado['apto_para_iniciar'])
            self.assertTrue(any('base de datos' in e.lower() for e in resultado['errores']))

if __name__ == '__main__':
    unittest.main()
