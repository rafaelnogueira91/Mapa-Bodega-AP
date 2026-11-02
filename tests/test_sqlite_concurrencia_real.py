"""Prueba de concurrencia de stock con SQLite real y conexiones independientes."""
import sqlite3
import tempfile
import threading
from pathlib import Path

with tempfile.TemporaryDirectory(prefix='bodega-sqlite-') as folder:
    db_path = str(Path(folder) / 'concurrencia.db')
    conn = sqlite3.connect(db_path, timeout=5)
    conn.executescript('''
      PRAGMA journal_mode=WAL;
      CREATE TABLE stock_cantidad (id INTEGER PRIMARY KEY, cantidad INTEGER NOT NULL CHECK(cantidad>=0));
      CREATE TABLE reservas (id INTEGER PRIMARY KEY, cantidad INTEGER NOT NULL);
      CREATE TABLE movimientos (id INTEGER PRIMARY KEY, cantidad INTEGER NOT NULL);
      INSERT INTO stock_cantidad VALUES (1,5);
    ''')
    conn.close()
    barrier = threading.Barrier(2)
    results = []
    lock = threading.Lock()

    def retirar(cantidad):
        db = sqlite3.connect(db_path, timeout=5, isolation_level=None)
        db.execute('PRAGMA busy_timeout=5000')
        barrier.wait(timeout=5)
        try:
            db.execute('BEGIN IMMEDIATE')
            # El cálculo de disponible y el descuento ocurren en la misma transacción.
            physical = db.execute('SELECT cantidad FROM stock_cantidad WHERE id=1').fetchone()[0]
            reserved = db.execute('SELECT COALESCE(SUM(cantidad),0) FROM reservas').fetchone()[0]
            if physical-reserved < cantidad:
                db.execute('ROLLBACK')
                result = 'RECHAZADO'
            else:
                changed = db.execute('UPDATE stock_cantidad SET cantidad=cantidad-? WHERE id=1 AND cantidad>=?', (cantidad,cantidad)).rowcount
                assert changed == 1
                db.execute('INSERT INTO movimientos(cantidad) VALUES(?)',(cantidad,))
                db.execute('COMMIT')
                result = 'ACEPTADO'
        except Exception:
            if db.in_transaction:
                db.execute('ROLLBACK')
            raise
        finally:
            db.close()
        with lock:
            results.append(result)

    threads = [threading.Thread(target=retirar,args=(4,)) for _ in range(2)]
    for t in threads: t.start()
    for t in threads: t.join(timeout=10)
    assert all(not t.is_alive() for t in threads), 'Hilos bloqueados'
    assert sorted(results) == ['ACEPTADO','RECHAZADO'], results
    db = sqlite3.connect(db_path)
    assert db.execute('SELECT cantidad FROM stock_cantidad').fetchone()[0] == 1
    assert db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0] == 1
    db.execute('INSERT INTO reservas(cantidad) VALUES(1)')
    db.commit()
    db.close()
    # Repetir con la unidad restante reservada: ninguno puede retirarla.
    barrier = threading.Barrier(2)
    results.clear()
    threads = [threading.Thread(target=retirar,args=(1,)) for _ in range(2)]
    for t in threads: t.start()
    for t in threads: t.join(timeout=10)
    assert all(not t.is_alive() for t in threads)
    assert results == ['RECHAZADO','RECHAZADO'], results
    db = sqlite3.connect(db_path)
    assert db.execute('SELECT cantidad FROM stock_cantidad').fetchone()[0] == 1
    assert db.execute('SELECT COUNT(*) FROM movimientos').fetchone()[0] == 1
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    db.close()
print('OK SQLite real: conexiones simultáneas, sin sobreventa y con reserva de proyecto')
