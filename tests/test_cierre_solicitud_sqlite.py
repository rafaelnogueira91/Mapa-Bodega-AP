import sqlite3

# Verifica con SQLite real que un cierre repetido no pueda volver a descontar stock.
c = sqlite3.connect(':memory:')
c.executescript('''
CREATE TABLE solicitudes(id INTEGER PRIMARY KEY, estado TEXT NOT NULL);
CREATE TABLE stock_cantidad(id INTEGER PRIMARY KEY, cantidad INTEGER NOT NULL CHECK(cantidad >= 0));
CREATE TABLE movimientos(id INTEGER PRIMARY KEY, tipo_movimiento TEXT NOT NULL);
INSERT INTO solicitudes VALUES (1,'EN PREPARACIÓN');
INSERT INTO stock_cantidad VALUES (1,5);
''')

def entregar():
    c.execute('BEGIN IMMEDIATE')
    try:
        c.execute('UPDATE stock_cantidad SET cantidad=cantidad-4 WHERE id=1 AND cantidad>=4')
        if c.execute('SELECT changes()').fetchone()[0] != 1:
            raise ValueError('Stock insuficiente')
        c.execute("INSERT INTO movimientos(tipo_movimiento) VALUES('SALIDA')")
        c.execute("UPDATE solicitudes SET estado='ENTREGADA' WHERE id=1 AND estado='EN PREPARACIÓN'")
        if c.execute('SELECT changes()').fetchone()[0] != 1:
            raise ValueError('Solicitud ya entregada')
        c.commit()
        return True
    except ValueError:
        c.rollback()
        return False

assert entregar() is True
assert entregar() is False
assert c.execute('SELECT cantidad FROM stock_cantidad').fetchone()[0] == 1
assert c.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0] == 1
assert c.execute('SELECT estado FROM solicitudes').fetchone()[0] == 'ENTREGADA'
assert c.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
print('OK SQLite: cierre único y rollback de entrega repetida')
