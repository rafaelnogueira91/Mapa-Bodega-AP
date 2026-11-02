"use strict";
const assert=require('node:assert/strict');
const {crearCSVDePendientes,celdaCSV,filtrarEntregas,filtrarPorAlerta}=require('../public/js/series-proyectos');
const ahora=new Date('2026-10-12T12:00:00Z');
const datos=[
 {numero_serie:'SER-1',trabajador:'Ana; Soto',proyecto:'Proyecto "A"',ubicacion_origen:'B1',fecha_entrega:'2026-09-01 12:00:00',fecha_devolucion:null},
 {numero_serie:'SER-2',trabajador:'Luis',proyecto:'B',ubicacion_origen:'B2',fecha_entrega:'2026-10-11 12:00:00',fecha_devolucion:'2026-10-12'},
 {numero_serie:'=1+1',trabajador:'=HYPERLINK("x")',proyecto:'C',ubicacion_origen:'B3',fecha_entrega:null,fecha_devolucion:null}
];
const csv=crearCSVDePendientes(datos,ahora);
assert.ok(csv.startsWith('\uFEFF'));
assert.equal(csv.trim().split('\r\n').length,3);
assert.match(csv,/"Ana; Soto"/);
assert.match(csv,/"Proyecto ""A"""/);
assert.match(csv,/"41"/);
assert.doesNotMatch(csv,/SER-2/);
assert.match(csv,/"'=1\+1"/);
assert.match(csv,/"'=HYPERLINK/);
assert.match(csv,/"Sin fecha de entrega"/);
assert.equal(celdaCSV('hola\n"mundo"'),'"hola\n""mundo"""');
const filtradas=filtrarPorAlerta(filtrarEntregas(datos,'PENDIENTE','Ana'),'PRIORITARIA',ahora);
assert.equal(filtradas.length,1);
assert.equal(crearCSVDePendientes(filtradas,ahora).trim().split('\r\n').length,2);
assert.equal(crearCSVDePendientes([],ahora).trim().split('\r\n').length,1);
console.log('Exportación CSV: 13 verificaciones aprobadas');
