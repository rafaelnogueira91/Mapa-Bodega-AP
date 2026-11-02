'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/js/solicitudes.js'), 'utf8');
const start = source.indexOf('function respuestaEntregaParcialConcluyente(');
const end = source.indexOf('// La confirmación depende del estado HTTP', start);
assert(start >= 0 && end > start);
const concluyente = vm.runInNewContext('(' + source.slice(start,end).trim() + ')');
for (const status of [500,502,503,504]) assert.equal(concluyente({ok:false,status}),false,`HTTP ${status} debe conservar clave`);
for (const status of [400,403,404,409,422]) assert.equal(concluyente({ok:false,status}),true,`HTTP ${status} permite resolver clave`);
assert.equal(concluyente({ok:true,status:200}),true);
assert.equal(concluyente({ok:true,status:201}),true);
assert.match(source,/if \(respuestaEntregaParcialConcluyente\(respuestaAnterior\)\) \{\s*entregasParcialesSinConfirmar\.delete/);
assert.match(source,/if \(respuestaEntregaParcialConcluyente\(respuesta\)\) \{\s*entregasParcialesSinConfirmar\.delete/);
// El estado de la operación se resuelve con el código HTTP, incluso si el
// cuerpo JSON está vacío o malformado y response.json() termina fallando.
for (const [respuesta, resultado] of [
  ['respuestaAnterior', 'resultadoAnterior'],
  ['respuesta', 'resultado']
]) {
  const inicio = source.indexOf(`if (respuestaEntregaParcialConcluyente(${respuesta}))`);
  assert(inicio >= 0, `Falta resolver ${respuesta}`);
  const fin = source.indexOf(`const ${resultado} = await leerResultadoEntregaParcial(${respuesta});`, inicio);
  assert(fin > inicio, `Debe resolverse ${respuesta} antes de interpretar su JSON`);
  const fragmento = source.slice(inicio, fin);
  assert.match(fragmento, /entregasParcialesSinConfirmar\.delete\(solicitudId\)/);
  assert.match(fragmento, /guardarEntregasParcialesPendientes\(\)/);
}
console.log('OK: los errores HTTP 5xx conservan la clave en el envío y recuperación');
