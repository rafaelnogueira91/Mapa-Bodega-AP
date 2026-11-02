"""Prueba SQLite aislada: descuento y movimiento atómicos con concurrencia.
No abre ni modifica database/bodega.db. No sustituye la prueba HTTP Express.
"""
import sqlite3
import tempfile
import threading
from pathlib import Path

SQL_DESCUENTO = '''UPDATE stock_cantidad SET cantidad = cantidad - ?
WHERE producto_id = ? AND ubicacion_id = ? AND cantidad >= ?
AND cantidad - ? >= COALESCE((SELECT SUM(sp.cantidad) FROM stock_proyecto sp
WHERE sp.producto_id = stock_cantidad.producto_id
AND sp.ubicacion_id = stock_cantidad.ubicacion_id), 0)'''


def preparar(ruta):
    with sqlite3.connect(ruta) as c:
        c.executescript('''
        CREATE TABLE stock_cantidad (producto_id INTEGER, ubicacion_id INTEGER, cantidad INTEGER NOT NULL);
        CREATE TABLE stock_proyecto (producto_id INTEGER, ubicacion_id INTEGER, cantidad INTEGER NOT NULL);
        CREATE TABLE movimientos (id INTEGER PRIMARY KEY, producto_id INTEGER, cantidad INTEGER NOT NULL);
        INSERT INTO stock_cantidad VALUES (1, 1, 3);
        INSERT INTO stock_proyecto VALUES (1, 1, 2);
        ''')


def salida(ruta, barrera, resultados):
    conn = sqlite3.connect(ruta, timeout=5, isolation_level=None)
    try:
        barrera.wait(timeout=5)
        conn.execute('BEGIN IMMEDIATE')
        changed = conn.execute(SQL_DESCUENTO, (1, 1, 1, 1, 1)).rowcount
        if changed != 1:
            conn.execute('ROLLBACK')
            resultados.append('rechazada')
            return
        conn.execute('INSERT INTO movimientos (producto_id,cantidad) VALUES (1,1)')
        conn.execute('COMMIT')
        resultados.append('aceptada')
    except Exception:
        if conn.in_transaction:
            conn.execute('ROLLBACK')
        raise
    finally:
        conn.close()


def verificar(ruta, cantidad, movimientos):
    with sqlite3.connect(ruta) as c:
        assert c.execute('SELECT cantidad FROM stock_cantidad').fetchone()[0] == cantidad
        assert c.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0] == movimientos
        assert c.execute('SELECT cantidad FROM stock_proyecto').fetchone()[0] == 2


def main():
    with tempfile.TemporaryDirectory(prefix='bodega-salida-aislada-') as temp:
        ruta = str(Path(temp) / 'prueba.db')
        preparar(ruta)
        resultados = []
        barrera = threading.Barrier(2)
        hilos = [threading.Thread(target=salida, args=(ruta, barrera, resultados)) for _ in range(2)]
        for hilo in hilos: hilo.start()
        for hilo in hilos: hilo.join(timeout=10)
        assert not any(hilo.is_alive() for hilo in hilos), 'Hilo bloqueado'
        assert sorted(resultados) == ['aceptada', 'rechazada'], resultados
        verificar(ruta, 2, 1)
        print('OK: dos salidas simultáneas -> una confirmada, una rechazada; reservas intactas')

        # Fuerza un fallo al registrar movimiento: el descuento previo debe revertirse.
        with sqlite3.connect(ruta) as c:
            c.execute('DELETE FROM movimientos')
            c.execute('UPDATE stock_cantidad SET cantidad=3')
            c.execute('CREATE TRIGGER fallo_movimiento BEFORE INSERT ON movimientos BEGIN SELECT RAISE(ABORT, "fallo simulado"); END;')
        conn = sqlite3.connect(ruta, isolation_level=None)
        try:
            conn.execute('BEGIN IMMEDIATE')
            assert conn.execute(SQL_DESCUENTO, (1, 1, 1, 1, 1)).rowcount == 1
            try:
                conn.execute('INSERT INTO movimientos (producto_id,cantidad) VALUES (1,1)')
                raise AssertionError('El trigger debió rechazar el movimiento')
            except sqlite3.IntegrityError:
                conn.execute('ROLLBACK')
        finally:
            conn.close()
        verificar(ruta, 3, 0)
        print('OK: error al insertar movimiento -> rollback sin descuento ni movimiento')


if __name__ == '__main__':
    main()
