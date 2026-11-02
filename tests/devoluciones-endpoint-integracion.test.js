'use strict';
const assert=require('node:assert/strict');
const register=require('../routes/operaciones-integrales');
function fixture({worker=8,closeFailure=false}={}){
 const state={status:'SALIDA',location:null,deliveryClosed:false,projectReserved:false,movements:0,commits:0,rollbacks:0};
 const app={post(path,handler){if(path==='/api/integral/devoluciones')this.devolver=handler;},get(){}};
 const db={
  get(sql,args,cb){
   let row;
   if(sql.includes('FROM productos WHERE'))row={id:1,tipo_control:'SERIE'};
   else if(sql.includes('FROM ubicaciones WHERE'))row={id:3,codigo:'B1-P01-U01'};
   else if(sql.includes('FROM personal WHERE'))row={id:8};
   else if(sql.includes('SELECT id,estado FROM productos_seriados'))row={id:2,estado:state.status};
   else if(sql.includes('FROM movimientos WHERE'))row={personal_id:worker};
   else if(sql.includes('FROM entregas_series_proyecto'))row=state.deliveryClosed?undefined:{id:5,proyecto_id:4,personal_id:8};
   else if(sql.includes('FROM proyectos WHERE'))row={id:4};
   else if(sql.includes('FROM productos_seriados WHERE'))row={id:2,estado:state.status};
   cb(null,row);
  },
  all(sql,args,cb){cb(null,[]);},
  run(sql,args,cb){
   if(typeof args==='function'){cb=args;args=[];}
   let changes=1;
   if(sql==='BEGIN IMMEDIATE')state.snapshot={...state};
   if(sql==='COMMIT')state.commits++;
   if(sql==='ROLLBACK'){state.rollbacks++;Object.assign(state,{status:state.snapshot.status,location:state.snapshot.location,projectReserved:state.snapshot.projectReserved,deliveryClosed:state.snapshot.deliveryClosed,movements:state.snapshot.movements});}
   if(sql.includes('UPDATE productos_seriados SET estado=')){
    if(state.status!=='SALIDA')changes=0;
    else {state.status='Disponible';state.location=args[0];}
   }
   if(sql.includes('INSERT INTO series_proyecto'))state.projectReserved=true;
   if(sql.includes('UPDATE entregas_series_proyecto')){
    changes=closeFailure?0:1;
    if(changes)state.deliveryClosed=true;
   }
   if(sql.includes('INSERT INTO movimientos('))state.movements++;
   cb.call({changes,lastID:1},null);
  }
 };
 register(app,db);
 async function post(personalId=8){
  return new Promise(resolve=>{
   const req={body:{productoId:1,ubicacionId:3,personalId,numeroSerie:'SER-001'}};
   const res={headersSent:false,statusCode:200,status(n){this.statusCode=n;return this;},json(body){resolve({status:this.statusCode,body});}};
   app.devolver(req,res);
  });
 }
 return {post,state};
}
(async()=>{
 const ok=fixture();const r=await ok.post();
 assert.equal(r.status,200);
 assert.equal(ok.state.status,'Disponible');
 assert.equal(ok.state.location,3);
 assert.equal(ok.state.deliveryClosed,true);
 assert.equal(ok.state.projectReserved,true);
 assert.equal(ok.state.movements,1);
 assert.equal(ok.state.commits,1);
 const duplicate=await ok.post();
 assert.equal(duplicate.status,409);
 assert.equal(ok.state.movements,1);
 const other=fixture({worker:9});const wrong=await other.post();
 assert.equal(wrong.status,409);
 assert.equal(other.state.movements,0);
 const fail=fixture({closeFailure:true});const failed=await fail.post();
 assert.equal(failed.status,409);
 assert.equal(fail.state.rollbacks,1);
 assert.equal(fail.state.movements,0);
 assert.equal(fail.state.status,'SALIDA');
 console.log('Endpoint devoluciones: éxito, duplicado, responsable y rollback verificados');
})().catch(e=>{console.error(e);process.exitCode=1;});
