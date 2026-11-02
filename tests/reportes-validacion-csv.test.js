'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../public/js/reportes-v5.js'), 'utf8');
const nodes = new Map();
const context = {
  document: {getElementById(id) {if(!nodes.has(id)) nodes.set(id, {value:'', textContent:'', innerHTML:'', addEventListener(){}}); return nodes.get(id);}},
  fetch: async () => ({ok:false}), console, URL:{}, Blob:class{}, setTimeout(){},
};
vm.createContext(context);
vm.runInContext(src.replace(/iniciar\(\);\s*$/, ''), context);
const csv = x => vm.runInContext(`celdaCsv(${JSON.stringify(x)})`,context);
assert.equal(csv('=1+1'), '"\'=1+1"');
assert.equal(csv('  @SUM(A1)'), '"\'  @SUM(A1)"');
assert.equal(csv('producto "A"'), '"producto ""A"""');
assert.equal(csv('Material'), '"Material"');
assert.equal(csv('12'), '"12"');
const validate = (r,i,a) => vm.runInContext(`validarReportes(${JSON.stringify(r)},${JSON.stringify(i)},${JSON.stringify(a)})`,context);
const okR = {solicitudes:[]}, okA = {negativos:[],duplicados:[],solicitudes:[]};
assert.doesNotThrow(()=>validate(okR,[],okA));
assert.throws(()=>validate(okR,null,okA), /incompletos/);
assert.throws(()=>validate(okR,[null],okA), /incompletos/);
assert.throws(()=>validate(okR,[],{negativos:[],duplicados:[]}), /incompletos/);
assert.throws(()=>validate({},[],okA), /incompletos/);
console.log('Reportes: 10 verificaciones aprobadas');
