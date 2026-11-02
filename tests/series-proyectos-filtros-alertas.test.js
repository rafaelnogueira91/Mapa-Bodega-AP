"use strict";
const assert=require('node:assert/strict');
const {filtrarEntregas,filtrarPorAlerta,agruparPendientes}=require('../public/js/series-proyectos');
const ahora=new Date('2026-10-12T12:00:00Z');
const dias=n=>new Date(ahora.getTime()-n*86400000).toISOString();
const datos=[
 {numero_serie:'PR-1',proyecto:'Norte',trabajador:'Ana',fecha_entrega:dias(32),fecha_devolucion:null},
 {numero_serie:'AT-1',proyecto:'Norte',trabajador:'Ana',fecha_entrega:dias(18),fecha_devolucion:null},
 {numero_serie:'NO-1',proyecto:'Sur',trabajador:'Pedro',fecha_entrega:dias(3),fecha_devolucion:null},
 {numero_serie:'SF-1',proyecto:'Sur',trabajador:'Pedro',fecha_entrega:null,fecha_devolucion:null},
 {numero_serie:'DE-1',proyecto:'Norte',trabajador:'Ana',fecha_entrega:dias(90),fecha_devolucion:dias(1)}
];
const codigos=registros=>registros.map(x=>x.numero_serie);
assert.deepEqual(codigos(filtrarPorAlerta(datos,'PRIORITARIA',ahora)),['PR-1']);
assert.deepEqual(codigos(filtrarPorAlerta(datos,'ATENCION',ahora)),['AT-1']);
assert.deepEqual(codigos(filtrarPorAlerta(datos,'NORMAL',ahora)),['NO-1']);
assert.deepEqual(codigos(filtrarPorAlerta(datos,'SIN_FECHA',ahora)),['SF-1']);
assert.equal(filtrarPorAlerta(datos,'TODAS',ahora).length,5);
assert.equal(filtrarPorAlerta(datos,'DESCONOCIDA',ahora).length,5);
assert.deepEqual(codigos(filtrarPorAlerta(filtrarEntregas(datos,'PENDIENTE','ana'),'PRIORITARIA',ahora)),['PR-1']);
assert.deepEqual(codigos(filtrarPorAlerta(filtrarEntregas(datos,'DEVUELTA',''),'PRIORITARIA',ahora)),[]);
assert.equal(agruparPendientes(filtrarPorAlerta(datos,'ATENCION',ahora))[0].pendientes,1);
assert.equal(agruparPendientes(filtrarPorAlerta(datos,'PRIORITARIA',ahora)).length,1);
console.log('Filtros de alertas: 10 comprobaciones correctas');
