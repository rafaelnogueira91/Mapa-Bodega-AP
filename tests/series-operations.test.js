'use strict';
const assert=require('node:assert/strict');
const serialFactory=require('../routes/serie-operations');
const state={serial:'SN-01',product:1,location:10,status:'Disponible',project:false,delivered:false};
const db={
 get(sql,args,cb){cb(null,sql.includes('WHERE numero_serie=?')&&args[0]===state.serial?{id:1}:undefined)},
 run(sql,args,cb){
  if(typeof args==='function'){cb=args;args=[];}
  let changes=0;
  if(sql.includes('INSERT INTO productos_seriados')){
   if(!state.serial){[state.product,state.serial,state.location]=args;state.status='Disponible';changes=1;}
  }else if(sql.includes("SET estado='SALIDA'")){
   const [p,l,s]=args;
   if(state.product===p&&state.location===l&&state.serial===s&&state.status==='Disponible'&&!state.project&&!state.delivered){state.status='SALIDA';state.location=null;changes=1;}
  }else if(sql.includes('SET ubicacion_id=?')){
   const [destination,p,l,s]=args;
   if(state.product===p&&state.location===l&&state.serial===s&&state.status==='Disponible'&&!state.project&&!state.delivered){state.location=destination;changes=1;}
  }
  cb.call({changes},null);
 }
};
(async()=>{
 const ops=serialFactory(db);
 await assert.rejects(ops.receive(1,10,'SN-01'),/ya existe/);
 await assert.rejects(ops.withdraw(1,11,'SN-01'),/no (está )?disponible/);
 state.project=true;
 await assert.rejects(ops.withdraw(1,10,'SN-01'),/no (está )?disponible/);
 await assert.rejects(ops.transfer(1,10,11,'SN-01'),/no (está )?disponible/);
 state.project=false;state.delivered=true;
 await assert.rejects(ops.withdraw(1,10,'SN-01'),/no (está )?disponible/);
 state.delivered=false;
 await ops.transfer(1,10,11,'SN-01');assert.equal(state.location,11);
 await assert.rejects(ops.transfer(1,10,12,'SN-01'),/no (está )?disponible/);
 await ops.withdraw(1,11,'SN-01');assert.equal(state.status,'SALIDA');assert.equal(state.location,null);
 await assert.rejects(ops.withdraw(1,11,'SN-01'),/no (está )?disponible/);
 console.log('OK: series reservadas, entregadas, traslados y salidas sin duplicados');
})().catch(e=>{console.error(e);process.exitCode=1});
