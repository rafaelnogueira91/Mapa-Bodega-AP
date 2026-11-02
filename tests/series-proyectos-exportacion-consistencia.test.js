'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {diasPendiente,filtrarEntregas,filtrarPorAlerta,crearCSVDePendientes}=require('../public/js/series-proyectos');
const source=fs.readFileSync(path.join(__dirname,'../public/js/series-proyectos.js'),'utf8');
assert.equal(diasPendiente('2026-10-11 12:00:00',new Date('2026-10-12T12:00:00Z')),1);
assert.equal(diasPendiente('2026-09-12 12:00:00',new Date('2026-10-12T12:00:00Z')),30);
const ahora=new Date('2026-10-12T12:00:00Z');
const registros=[
 {numero_serie:'A',trabajador:'Ana',proyecto:'P1',fecha_entrega:'2026-09-12 12:00:00',fecha_devolucion:null},
 {numero_serie:'B',trabajador:'Ana',proyecto:'P1',fecha_entrega:'2026-10-01 12:00:00',fecha_devolucion:null},
 {numero_serie:'C',trabajador:'Ana',proyecto:'P1',fecha_entrega:'2026-09-01 12:00:00',fecha_devolucion:'2026-10-01'},
 {numero_serie:'D',trabajador:'Luis',proyecto:'P2',fecha_entrega:'2026-09-01 12:00:00',fecha_devolucion:null}
];
const pendientes=filtrarEntregas(registros,'PENDIENTE','Ana');
assert.deepEqual(pendientes.map(e=>e.numero_serie),['A','B']);
const prioritarias=filtrarPorAlerta(pendientes,'PRIORITARIA',ahora);
assert.deepEqual(prioritarias.map(e=>e.numero_serie),['A']);
const csv=crearCSVDePendientes(prioritarias,ahora);
assert.match(csv,/30/);
assert.ok(csv.includes('A'));
assert.ok(!csv.includes('"B"') && !csv.includes('"C"') && !csv.includes('"D"'));
assert.match(source,/filtrarEntregas\(registros,'PENDIENTE'/);
assert.match(source,/crearCSVDePendientes\(filtradas,fechaReporte\)/);
console.log('Exportación consistente: fecha UTC, estado, búsqueda, alerta y CSV OK');
