'use strict';
const assert=require('node:assert/strict');
const make=require('../routes/serie-operations');
function fixture({project=false,wrongWorker=false,closeFailure=false}={}){
 const state={status:'SALIDA',location:null,project,closed:false};
 const db={
  get(sql,args,cb){
   let result;
   if(sql.includes('FROM productos_seriados'))result={id:7,estado:state.status};
   else if(sql.includes('FROM movimientos'))result={personal_id:wrongWorker?8:9};
   else if(sql.includes('FROM entregas_series_proyecto'))result=project?{id:20,proyecto_id:3,personal_id:9}:undefined;
   else if(sql.includes('FROM proyectos'))result={id:3};
   cb(null,result);
  },
  run(sql,args,cb){
   let changes=0;
   if(sql.includes('UPDATE productos_seriados')){
    if(state.status==='SALIDA'){state.status='Disponible';state.location=args[0];changes=1;}
   }else if(sql.includes('INSERT INTO series_proyecto')){changes=1;state.projectRestored=true;}
   else if(sql.includes('UPDATE entregas_series_proyecto')){
    changes=closeFailure?0:1;if(changes)state.closed=true;
   }
   cb.call({changes},null);
  }
 };
 return {state,ops:make(db)};
}
(async()=>{
 let x=fixture();await x.ops.returnToStock(1,10,'SER-1',9);
 assert.equal(x.state.status,'Disponible');assert.equal(x.state.location,10);
 await assert.rejects(x.ops.returnToStock(1,10,'SER-1',9),/no figura como salida/);
 x=fixture({wrongWorker:true});await assert.rejects(x.ops.returnToStock(1,10,'SER-1',9),/no corresponde/);
 assert.equal(x.state.status,'SALIDA');
 x=fixture({project:true});await x.ops.returnToStock(1,10,'SER-1',9);
 assert.equal(x.state.projectRestored,true);assert.equal(x.state.closed,true);
 x=fixture({project:true,closeFailure:true});await assert.rejects(x.ops.returnToStock(1,10,'SER-1',9),/cerrar la entrega/);
 console.log('OK: devolución, duplicado, responsable, proyecto y cierre fallido');
})().catch(e=>{console.error(e);process.exitCode=1});
