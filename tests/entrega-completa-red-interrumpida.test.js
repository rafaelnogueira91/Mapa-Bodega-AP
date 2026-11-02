const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/solicitudes.js'), 'utf8');
const start = source.indexOf('// CONFIRMAR ENTREGA');
const end = source.indexOf('// INICIAR', start);
assert(start !== -1 && end > start, 'Falta controlador de entrega completa');
const section = source.slice(start, end);

async function escenario({ estadoServidor, fallaConsulta = false }) {
  let listener;
  let posts = 0;
  let consultas = 0;
  const mensajes = [];
  const boton = {
    dataset: { id: '2' }, disabled: false, textContent: '',
    classList: { contains: x => x === 'boton-confirmar-entrega' },
    closest: () => ({ querySelector: () => null })
  };
  const ctx = {
    listaSolicitudes: { addEventListener: (_, cb) => { listener = cb; } },
    solicitudesDisponibles: [{ id: 2, estado: 'PENDIENTE', personalDestinoId: 1, personalDestino: 'Test', productos: [{ productoId: 4, tipoControl: 'CANTIDAD', cantidad: 10 }] }],
    confirm: () => true,
    fetch: async () => { posts++; throw new TypeError('Conexión interrumpida después del POST'); },
    cargarSolicitudes: async () => {
      consultas++;
      if (fallaConsulta) throw new Error('Sin conexión');
      ctx.solicitudesDisponibles = [{ ...ctx.solicitudesDisponibles[0], estado: estadoServidor }];
    },
    alert: message => mensajes.push(message),
    console: { error: () => {}, warn: () => {} }
  };
  vm.runInNewContext(section, ctx);
  const click = { target: boton };
  await listener(click);
  await listener(click);
  assert.equal(posts, 1, 'No se debe repetir el POST tras respuesta incierta');
  assert.equal(consultas, 1, 'Debe intentar verificar el estado una vez');
  assert.equal(boton.disabled, true, 'El botón debe permanecer bloqueado');
  return { mensajes, boton };
}

(async () => {
  const confirmada = await escenario({ estadoServidor: 'ENTREGADA' });
  assert(confirmada.mensajes.some(m => m.includes('ya está registrada')));
  const pendiente = await escenario({ estadoServidor: 'PENDIENTE' });
  assert(pendiente.mensajes.some(m => m.includes('No se pudo confirmar')));
  const sinConexion = await escenario({ fallaConsulta: true });
  assert(sinConexion.mensajes.some(m => m.includes('No se pudo confirmar')));
  console.log('OK: 3 escenarios de conexión interrumpida; ningún segundo POST.');
})().catch(error => { console.error(error); process.exitCode = 1; });
