const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const ui = fs.readFileSync(path.join(__dirname, '..', 'public/js/solicitudes.js'), 'utf8');
assert.match(server, /LEFT JOIN proyectos proyecto ON proyecto\.id = s\.proyecto_id/);
for (const field of ['proyectoId: fila.proyecto_id','proyectoCodigo: fila.proyecto_codigo','proyectoNombre: fila.proyecto_nombre']) {
  assert.ok(server.includes(field), `Falta campo ${field}`);
}
assert.ok(ui.includes('escaparProyecto(solicitud.proyectoNombre'), 'El nombre de proyecto debe escapar HTML');
assert.ok(ui.includes('Sin proyecto asociado'), 'Las solicitudes históricas deben poder mostrarse');
console.log('Integración de proyecto en historial de solicitudes: OK');
