import sqlite3
c=sqlite3.connect(':memory:')
c.executescript('''
CREATE TABLE solicitudes(id INTEGER PRIMARY KEY, estado TEXT NOT NULL DEFAULT 'PENDIENTE');
CREATE TABLE movimientos(id INTEGER PRIMARY KEY,tipo_movimiento TEXT NOT NULL);
CREATE TABLE notificacion_cola(id INTEGER PRIMARY KEY,evento TEXT NOT NULL,referencia_id INTEGER NOT NULL,estado TEXT DEFAULT 'PENDIENTE',intentos INTEGER DEFAULT 0,proximo_intento TEXT,UNIQUE(evento,referencia_id));
CREATE TRIGGER notif_solicitud_creada AFTER INSERT ON solicitudes BEGIN INSERT OR IGNORE INTO notificacion_cola(evento,referencia_id) VALUES('SOLICITUD',NEW.id); END;
CREATE TRIGGER notif_solicitud_entregada AFTER UPDATE OF estado ON solicitudes WHEN NEW.estado='ENTREGADA' AND OLD.estado<>NEW.estado BEGIN INSERT OR IGNORE INTO notificacion_cola(evento,referencia_id) VALUES('ENTREGA',NEW.id); END;
CREATE TRIGGER notif_devolucion AFTER INSERT ON movimientos WHEN NEW.tipo_movimiento='DEVOLUCION' BEGIN INSERT OR IGNORE INTO notificacion_cola(evento,referencia_id) VALUES('DEVOLUCION',NEW.id); END;
INSERT INTO solicitudes VALUES(1,'PENDIENTE');
UPDATE solicitudes SET estado='ENTREGADA' WHERE id=1;
UPDATE solicitudes SET estado='ENTREGADA' WHERE id=1;
INSERT INTO movimientos VALUES(4,'DEVOLUCION');
''')
rows=c.execute('SELECT evento,referencia_id FROM notificacion_cola ORDER BY id').fetchall()
assert rows==[('SOLICITUD',1),('ENTREGA',1),('DEVOLUCION',4)],rows
c.execute("UPDATE notificacion_cola SET estado='ERROR',intentos=4,proximo_intento=datetime('now','+10 minutes') WHERE evento='SOLICITUD'")
q="SELECT evento FROM notificacion_cola WHERE estado IN ('PENDIENTE','ERROR') AND intentos<5 AND (proximo_intento IS NULL OR proximo_intento<=CURRENT_TIMESTAMP)"
assert set(x[0] for x in c.execute(q))=={'ENTREGA','DEVOLUCION'}
c.execute("UPDATE notificacion_cola SET intentos=5,proximo_intento=NULL WHERE evento='SOLICITUD'")
assert set(x[0] for x in c.execute(q))=={'ENTREGA','DEVOLUCION'}
assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
print('OK: eventos, duplicados, reintentos y limite de 5')
