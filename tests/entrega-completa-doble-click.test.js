const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/solicitudes.js'), 'utf8');
const start = source.indexOf('// CONFIRMAR ENTREGA');
const end = source.indexOf('// INICIAR', start);
assert(start !== -1 && end > start, 'Debe existir el controlador de entrega completa');
const section = source.slice(start, end);
let listener;
let confirmations = 0;
let posts = 0;
let release;
const pending = new Promise(resolve => { release = resolve; });
const button = { dataset: { id: '2' }, disabled: false, textContent: '', classList: { contains: x => x === 'boton-confirmar-entrega' }, closest: () => ({ querySelector: () => null }) };
const ctx = {
  listaSolicitudes: { addEventListener: (_, cb) => { listener = cb; } },
  solicitudesDisponibles: [{ id: 2, personalDestinoId: 1, personalDestino: 'Test', personalDestinoCargo: 'QA', productos: [{ productoId: 4, tipoControl: 'CANTIDAD', cantidad: 10 }] }],
  confirm: () => { confirmations++; return true; },
  fetch: async () => { posts++; await pending; return { ok: true, json: async () => ({ mensaje: 'OK' }) }; },
  cargarSolicitudes: async () => {}, alert: () => {}, console,
};
vm.runInNewContext(section, ctx);
(async () => {
  const click = { target: button };
  const first = listener(click);
  const second = listener(click);
  await Promise.resolve();
  assert.equal(confirmations, 1, 'Un doble clic no debe mostrar dos confirmaciones');
  assert.equal(posts, 1, 'Un doble clic no debe registrar dos POST');
  release();
  await Promise.all([first, second]);
  assert.equal(posts, 1);
  console.log('OK: doble clic de entrega completa produce un solo POST.');
})().catch(e => { console.error(e); process.exitCode = 1; });
