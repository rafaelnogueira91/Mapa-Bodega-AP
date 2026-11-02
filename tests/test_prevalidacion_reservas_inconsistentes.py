"""Comprueba la consulta de prevalidación real, sin abrir bodega.db."""
import pathlib
import re
import sqlite3

source = (pathlib.Path(__file__).resolve().parents[1] / 'server.js').read_text(encoding='utf-8')
match = re.search(r"return db\.get\(`(SELECT\s+COALESCE\(\(SELECT SUM\(cantidad\) FROM stock_cantidad[\s\S]*?AS reserva_invalida)`", source)
assert match, 'No se encontró el SQL de prevalidación de Movimientos'
query = match.group(1)
with sqlite3.connect(':memory:') as db:
    db.executescript('''
        CREATE TABLE ubicaciones (id INTEGER PRIMARY KEY, codigo TEXT);
        CREATE TABLE stock_cantidad (producto_id INTEGER, ubicacion_id INTEGER, cantidad);
        CREATE TABLE stock_proyecto (producto_id INTEGER, ubicacion_id INTEGER, cantidad);
        INSERT INTO ubicaciones VALUES (1, 'A1');
        INSERT INTO stock_cantidad VALUES (7, 1, 10);
        INSERT INTO stock_proyecto VALUES (7, 1, 4);
    ''')
    params = (7, 'A1') * 4
    def consultar():
        return db.execute(query, params).fetchone()
    assert consultar() == (10, 4, 0, 0)
    db.execute('INSERT INTO stock_proyecto VALUES (7, 1, -4)')
    assert consultar()[3] == 1, 'Una reserva negativa compensada por otra debe detectarse'
    db.execute('DELETE FROM stock_proyecto WHERE cantidad=-4')
    db.execute('INSERT INTO stock_proyecto VALUES (7, 1, 0.5)')
    assert consultar()[3] == 1, 'Una reserva fraccionaria debe detectarse'
    db.execute('DELETE FROM stock_proyecto WHERE cantidad=0.5')
    db.execute('INSERT INTO stock_cantidad VALUES (7, 1, -2)')
    assert consultar()[2] == 1, 'Una fila física negativa debe detectarse'
print('OK: 4 escenarios SQL reales de prevalidación con SQLite en memoria.')
