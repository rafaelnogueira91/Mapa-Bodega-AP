"use strict";
const assert=require('node:assert/strict');
const lock=require('../routes/transaction-lock');
const events=[];
let open=false;
const db={run(sql,callback){
  setImmediate(()=>{
    if(sql==='BEGIN IMMEDIATE'){
      if(open)return callback(new Error('nested transaction'));
      open=true;
    }
    if(sql==='COMMIT'||sql==='ROLLBACK')open=false;
    events.push(sql);
    callback(null);
  });
}};
async function main(){
 const results=await Promise.all([
   lock(db,async()=>{events.push('A');await new Promise(r=>setTimeout(r,5));return 1;}),
   lock(db,async()=>{events.push('B');return 2;})
 ]);
 assert.deepEqual(results,[1,2]);
 assert.deepEqual(events,['BEGIN IMMEDIATE','A','COMMIT','BEGIN IMMEDIATE','B','COMMIT']);
 await assert.rejects(lock(db,async()=>{throw Error('test failure')}));
 await lock(db,async()=>{events.push('AFTER_ROLLBACK')});
 assert.deepEqual(events.slice(-5),['BEGIN IMMEDIATE','ROLLBACK','BEGIN IMMEDIATE','AFTER_ROLLBACK','COMMIT']);
 console.log('OK: serialización entre módulos y recuperación tras rollback');
}
main().catch(e=>{console.error(e);process.exitCode=1});
