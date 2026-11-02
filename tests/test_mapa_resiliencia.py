"""Regresiones estáticas del flujo de carga del mapa; no modifica SQLite."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAPA = (ROOT / 'public/js/mapa.js').read_text(encoding='utf-8')

class ResilienciaMapaTest(unittest.TestCase):
    def test_consulta_ubicaciones_con_limite_y_limpieza(self):
        inicio = MAPA.index('async function consultarMapa(')
        fin = MAPA.index('let versionCargaMapa', inicio)
        bloque = MAPA[inicio:fin]
        for fragmento in ('AbortController', 'setTimeout', 'clearTimeout', 'respuesta.ok', 'Array.isArray(datos)'):
            with self.subTest(fragmento=fragmento):
                self.assertIn(fragmento, bloque)

    def test_cambio_bodega_descarta_respuesta_antigua(self):
        inicio = MAPA.index('async function mostrarBodega(')
        fin = MAPA.index('async function cargarEstructurasMapa(', inicio)
        bloque = MAPA[inicio:fin]
        self.assertIn('versionActual !== versionCargaMapa', bloque)
        self.assertIn("consultarMapa('/api/ubicaciones')", bloque)

    def test_cancelacion_registra_y_limpia_controladores(self):
        inicio = MAPA.index('async function cargarEstadosUbicaciones(')
        fin = MAPA.index('function aplicarEstadoVisual(', inicio)
        bloque = MAPA[inicio:fin]
        self.assertIn('consultasEstadoActivas.add(controlador)', bloque)
        self.assertIn('consultasEstadoActivas.delete(controlador)', bloque)
        self.assertIn('cancelarConsultasEstado();', MAPA)

    def test_estructura_libera_controladores_al_finalizar(self):
        inicio = MAPA.index('async function cargarEstructurasMapa(')
        fin = MAPA.index('function escaparTextoMapa(', inicio)
        bloque = MAPA[inicio:fin]
        self.assertIn('consultasEstadoActivas.add(controlador)', bloque)
        self.assertIn('consultasEstadoActivas.delete(controlador)', bloque)

    def test_ubicacion_suelta_se_inserta_una_sola_vez(self):
        inicio = MAPA.index('function construirMapa(')
        fin = MAPA.index('function obtenerUbicacionesVisibles()', inicio)
        bloque = MAPA[inicio:fin]
        self.assertEqual(bloque.count('rejilla.appendChild(celda);'), 1)

    def test_error_ofrece_reintentar(self):
        self.assertIn("reintentar.textContent = 'Reintentar'", MAPA)
        self.assertIn("reintentar.addEventListener('click'", MAPA)

    def test_estructuras_tienen_timeout_y_respaldo(self):
        inicio = MAPA.index('async function cargarEstructurasMapa(')
        fin = MAPA.index('function escaparTextoMapa(', inicio)
        bloque = MAPA[inicio:fin]
        self.assertIn('AbortController', bloque)
        self.assertIn('clearTimeout(temporizador)', bloque)
        self.assertIn('return [];', bloque)

if __name__ == '__main__':
    unittest.main(verbosity=2)
