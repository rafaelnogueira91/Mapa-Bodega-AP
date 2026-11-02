'use strict';
// Prueba de la ruta real con un adaptador SQL controlado en memoria.
// No sustituye una prueba de integración con SQLite real.
const assert = require('node:assert/strict');
const handlers = {};
const app = {post(path, handler) { handlers[path] = handler; }, get(path, handler) { handlers[path] = handler; }};
let stock = 5, reserved = 0, movements = 0, inTransaction = false, snapshot;
const sqlLog = [];
const db = {
  run(sql, args, cb) {
    if (typeof args === 'function') { cb = args; args = []; }
    setImmediate(() => {
      let changes = 1;
      try {
        sqlLog.push(sql);
        if (sql === 'BEGIN IMMEDIATE') {
          assert.equal(inTransaction, false, 'No debe haber transacciones anidadas');
          inTransaction = true;
          snapshot = {stock, movements};
        } else if (sql === 'COMMIT') {
          assert.equal(inTransaction, true); inTransaction = false;
        } else if (sql === 'ROLLBACK') {
          stock = snapshot.stock; movements = snapshot.movements; inTransaction = false;
        } else if (sql.startsWith('UPDATE stock_cantidad SET cantidad=cantidad-')) {
          if (stock >= args[2]) stock -= args[0]; else changes = 0;
        } else if (sql.startsWith('INSERT INTO movimientos(')) movements++;
        cb.call({changes}, null);
      } catch (e) { cb(e); }
    });
  },
  get(sql, args, cb) {
    setImmediate(() => {
      let row;
      if (sql.includes('FROM productos WHERE codigo=')) row = {id:1, tipo_control:'CANTIDAD'};
      else if (sql.includes('FROM ubicaciones WHERE codigo=')) row = {id:1};
      else if (sql.includes('FROM personal WHERE id=')) row = {id:1};
      else if (sql.includes('SUM(cantidad)') && sql.includes('FROM stock_proyecto')) row = {n:reserved};
      else if (sql.includes('SUM(cantidad)') && sql.includes('FROM stock_cantidad')) row = {n:stock};
      else if (sql.includes('COUNT(*) FROM stock_cantidad')) row = {n:stock>0?1:0};
      cb(null,row);
    });
  },
  all(sql, args, cb) {
    setImmediate(() => cb(null,sql.includes('FROM stock_cantidad') ? [{id:1,cantidad:stock}] : []));
  }
};
require('../routes/movimientos')(app,db);
async function request(qty, worker=1) {
  const req={body:{tipoMovimiento:'SALIDA',codigoProducto:'P01',ubicacion:'B1-P01-U01',cantidad:qty,personalId:worker}};
  let code=200, data;
  const res={status(n){code=n;return this},json(value){data=value;return this}};
  await handlers['/api/movimientos'](req,res);
  return {code,data};
}
async function main() {
  let results=await Promise.all([request(4),request(4)]);
  assert.deepEqual(results.map(r=>r.code).sort(),[200,409]);
  assert.equal(stock,1);assert.equal(movements,1);
  assert.equal(inTransaction,false);
  assert.equal(sqlLog.filter(s=>s==='BEGIN IMMEDIATE').length,2);
  // Reservar todo el stock físico remanente para un proyecto.
  reserved=1;
  const denied=await request(1);
  assert.equal(denied.code,409);assert.equal(stock,1);assert.equal(movements,1);
  // Datos inválidos deben revertir la transacción sin cambios.
  const invalid=await request(1,0);
  assert.equal(invalid.code,400);assert.equal(stock,1);assert.equal(movements,1);
  assert.equal(inTransaction,false);
  console.log('OK: dos retiros simultáneos, reserva de proyecto y rollback sin sobreventa');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
