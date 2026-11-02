'use strict';
// Diagnóstico sin modificar la base de datos ni iniciar el servidor.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const required = ['server.js', 'public/bodegas.html', 'public/js/mapa.js', 'database/bodega.db'];
let failed = false;
for (const file of required) {
  const exists = fs.existsSync(path.join(root, file));
  console.log(`${exists ? 'OK' : 'FALTA'} ${file}`);
  if (!exists) failed = true;
}
try {
  const sqlite3 = require('sqlite3');
  const db = new sqlite3.Database(path.join(root, 'database/bodega.db'), sqlite3.OPEN_READONLY, err => {
    if (err) { console.error('SQLite no pudo abrir la base:', err.message); process.exitCode = 1; return; }
    db.get('SELECT COUNT(*) AS total FROM ubicaciones', (queryErr, row) => {
      if (queryErr) { console.error('Consulta de ubicaciones falló:', queryErr.message); process.exitCode = 1; }
      else console.log(`OK SQLite: ${row.total} ubicaciones accesibles`);
      db.close();
    });
  });
} catch (err) {
  failed = true;
  console.error('ERROR al cargar sqlite3:', err.message);
  console.error(`Entorno: ${process.platform}/${process.arch}, Node ${process.version}`);
  console.error('Instala las dependencias en el equipo donde ejecutarás el servidor (npm install). No copies node_modules entre Windows y Linux.');
}
if (failed) process.exitCode = 1;
