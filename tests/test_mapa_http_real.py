"""Comprueba la API del mapa contra SQLite sin escribir datos."""
import json
import os
import sqlite3
import sys
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[1]
url = os.environ.get('MAPA_BASE_URL', 'http://127.0.0.1:3000').rstrip('/') + '/api/ubicaciones'
try:
    with urllib.request.urlopen(url, timeout=12) as response:
        if response.status != 200:
            raise ValueError(f'HTTP {response.status}')
        locations = json.load(response)
    if not isinstance(locations, list):
        raise ValueError('La API no devolvió una lista JSON')
    with sqlite3.connect(f'file:{root / "database/bodega.db"}?mode=ro', uri=True) as db:
        expected = {str(row[0]) for row in db.execute('SELECT codigo FROM ubicaciones')}
    received = [str(item['codigo']) for item in locations if isinstance(item, dict) and item.get('codigo') is not None]
    if len(received) != len(locations) or len(set(received)) != len(received) or set(received) != expected:
        raise ValueError(f'API y SQLite no coinciden (API={len(received)}, SQLite={len(expected)})')
    print(f'OK: API HTTP 200; {len(received)} ubicaciones coinciden con SQLite')
except Exception as error:
    print(f'ERROR de integración HTTP: {error}', file=sys.stderr)
    sys.exit(1)
