import sqlite3,re
from pathlib import Path
s=Path('/mnt/data/bodega_next/mapa-bodega-ap-empresarial/routes/reportes-v5.js').read_text()
section=s.split("app.get('/api/v5/inventario-libre'")[1].split("app.get('/api/v5/alertas'")[0]
q=section.split('all(`',1)[1].split('`)',1)[0]
c=sqlite3.connect(':memory:')
c.executescript('''
CREATE TABLE productos(id INTEGER PRIMARY KEY,codigo TEXT,nombre TEXT,tipo_control TEXT);
CREATE TABLE ubicaciones(id INTEGER PRIMARY KEY,codigo TEXT);
CREATE TABLE stock_cantidad(producto_id INT,ubicacion_id INT,cantidad INT);
CREATE TABLE stock_proyecto(producto_id INT,ubicacion_id INT,cantidad INT);
CREATE TABLE productos_seriados(id INT,producto_id INT,ubicacion_id INT,estado TEXT);
CREATE TABLE series_proyecto(serie_id INT);
INSERT INTO productos VALUES(1,'MAT','Material','CANTIDAD'),(2,'HER','Herramienta','SERIE'),(3,'FAL','Faltante','CANTIDAD');
INSERT INTO ubicaciones VALUES(1,'B1-P01-U01');
INSERT INTO stock_cantidad VALUES(1,1,10);
INSERT INTO stock_proyecto VALUES(1,1,7),(3,1,2);
INSERT INTO productos_seriados VALUES(10,2,1,'Disponible'),(11,2,1,'Disponible'),(12,2,NULL,'SALIDA');
INSERT INTO series_proyecto VALUES(11);
''')
rows=c.execute(q).fetchall()
assert len(rows)==3,rows
bycode={r[0]:r for r in rows}
assert bycode['MAT'][4:8]==(10,7,3,'OK'),rows
assert bycode['HER'][4:8]==(2,1,1,'OK'),rows
assert bycode['FAL'][4:8]==(0,2,-2,'INCONSISTENTE'),rows
print('OK: reporte SQL probado con cantidad, serie y reserva huérfana')
