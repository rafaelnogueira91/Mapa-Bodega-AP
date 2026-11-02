import sqlite3
import tempfile
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verificar_respaldo import verificar, TABLAS_ESENCIALES
from backup_db import backup

with tempfile.TemporaryDirectory() as d:
    base = Path(d)
    original = base/'origen.db'
    with sqlite3.connect(original) as c:
        for tabla in TABLAS_ESENCIALES:
            c.execute(f'CREATE TABLE {tabla} (id INTEGER PRIMARY KEY)')
        c.execute('INSERT INTO productos(id) VALUES(1)')
    respaldo = backup(original, base/'respaldo.db')
    assert verificar(respaldo)['integridad'] == 'ok'
    with sqlite3.connect(respaldo) as c:
        assert c.execute('SELECT COUNT(*) FROM productos').fetchone()[0] == 1
    incompleto = base/'incompleto.db'
    with sqlite3.connect(incompleto) as c:
        c.execute('CREATE TABLE productos(id INTEGER)')
    try:
        verificar(incompleto)
        raise AssertionError('Se aceptó un esquema incompleto')
    except ValueError as e:
        assert 'Faltan tablas' in str(e)
    corrupto = base/'corrupto.db'
    corrupto.write_bytes(b'Esto no es SQLite')
    try:
        verificar(corrupto)
        raise AssertionError('Se aceptó un archivo corrupto')
    except sqlite3.DatabaseError:
        pass
    try:
        verificar(base/'no-existe.db')
        raise AssertionError('Se aceptó archivo inexistente')
    except FileNotFoundError:
        pass
print('OK: respaldo válido, esquema incompleto, archivo corrupto y archivo inexistente')
