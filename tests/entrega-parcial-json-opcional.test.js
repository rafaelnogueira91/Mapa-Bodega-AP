'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/js/solicitudes.js'), 'utf8');
const inicio = source.indexOf('async function leerResultadoEntregaParcial(');
const fin = source.indexOf('// Reintentar una pérdida de conexión', inicio);
assert(inicio >= 0 && fin > inicio);
const leer = vm.runInNewContext('(' + source.slice(inicio, fin).trim() + ')');
(async () => {
    assert.equal((await leer({ json: async () => ({ mensaje: 'Confirmada' }) })).mensaje, 'Confirmada');
    for (const json of [async () => { throw new SyntaxError('vacío'); }, async () => null, async () => [], async () => 'texto']) {
        assert.equal(Object.keys(await leer({ json })).length, 0);
    }
    assert.match(source, /const resultadoAnterior = await leerResultadoEntregaParcial\(respuestaAnterior\)/);
    assert.match(source, /const resultado = await leerResultadoEntregaParcial\(respuesta\)/);
    console.log('OK: las respuestas HTTP concluyentes no dependen de JSON válido');
})().catch(e => { console.error(e); process.exitCode = 1; });
