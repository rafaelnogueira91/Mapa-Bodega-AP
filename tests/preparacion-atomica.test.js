const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = source.indexOf('app.put(\n    "/api/solicitudes/:id/preparar",');
const end = source.indexOf('// CONFIRMAR ENTREGA DE SOLICITUD', start);
assert(start >= 0 && end > start, 'Debe existir el endpoint de preparación');
const route = source.slice(start, end);
for (const required of ['BEGIN IMMEDIATE TRANSACTION', "db.run('ROLLBACK'", "db.run('COMMIT'", 'INSERT INTO historial_solicitudes', "estado='PENDIENTE'", 'this.changes !== 1']) {
  assert(route.includes(required), `Falta protección: ${required}`);
}
assert(route.indexOf('BEGIN IMMEDIATE TRANSACTION') < route.indexOf('UPDATE solicitudes'));
assert(route.indexOf('INSERT INTO historial_solicitudes') < route.indexOf("db.run('COMMIT'"));
console.log('Preparación transaccional: comprobaciones estáticas correctas');
