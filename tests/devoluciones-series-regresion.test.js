'use strict';
const assert=require('node:assert/strict');
const makeOperations=require('../routes/serie-operations');
function mockDb({estado='SALIDA',trabajador=8,entrega=true}={}){
 const db={rows:{estado},calls:[],get(sql,args,cb){
  let row;
  if(sql.includes('FROM productos_seriados WHERE'))row={id:2,estado:db.rows.estado};
  else if(sql.includes('FROM movimientos WHERE'))row={personal_id:trabajador};
  else if(sql.includes('FROM entregas_series_proyecto'))row=entrega?{id:5,proyecto_id:4,personal_id:trabajador}:undefined;
  else if(sql.includes('FROM proyectos WHERE'))row={id:4};
  cb(null,row);
 },run(sql,args,cb){
  db.calls.push(sql);
  let changes=1;
  if(sql.includes('UPDATE productos_seriados')){
   if(db.rows.estado!=='SALIDA')changes=0;
   else db.rows.estado='Disponible';
  }
  cb.call({changes},null);
 }};
 return db;
}
(async()=>{
 const db=mockDb();
 const ops=makeOperations(db);
 await ops.returnToStock(1,3,'SER-001',8);
 assert.equal(db.rows.estado,'Disponible');
 assert.ok(db.calls.some(sql=>sql.includes('UPDATE entregas_series_proyecto')));
 await assert.rejects(ops.returnToStock(1,3,'SER-001',8),/no figura como salida/);
 const ajeno=mockDb({trabajador:9});
 await assert.rejects(makeOperations(ajeno).returnToStock(1,3,'SER-001',8),/no corresponde al trabajador/);
 assert.equal(ajeno.calls.length,0);
 const libre=mockDb({entrega:false});
 await makeOperations(libre).returnToStock(1,3,'SER-002',8);
 assert.equal(libre.calls.some(sql=>sql.includes('UPDATE entregas_series_proyecto')),false);
 console.log('Regresión de devoluciones por serie: 4 casos correctos');
})().catch(e=>{console.error(e);process.exitCode=1;});
