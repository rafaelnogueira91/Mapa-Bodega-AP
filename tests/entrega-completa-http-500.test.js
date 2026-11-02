const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/js/solicitudes.js'), 'utf8');
const start = source.indexOf('// CONFIRMAR ENTREGA');
const end = source.indexOf('// INICIAR', start);
assert(start >= 0 && end > start);
const section = source.slice(start, end);
async function test(status, estado) {
  let listener, posts = 0, consultas = 0;
  const mensajes = [];
  const boton = {dataset:{id:'2'},disabled:false,textContent:'',classList:{contains:x=>x==='boton-confirmar-entrega'},closest:()=>({querySelector:()=>null})};
  const ctx = {
    listaSolicitudes:{addEventListener:(_,fn)=>listener=fn},
    solicitudesDisponibles:[{id:2,estado:'PENDIENTE',personalDestinoId:1,productos:[{productoId:4,tipoControl:'CANTIDAD',cantidad:10}]}],
    confirm:()=>true,
    fetch:async()=>{posts++;return {ok:false,status,json:async()=>({mensaje:'Error servidor'})}},
    cargarSolicitudes:async()=>{consultas++;ctx.solicitudesDisponibles=[{...ctx.solicitudesDisponibles[0],estado}]},
    alert:m=>mensajes.push(m),console:{error:()=>{},warn:()=>{}}
  };
  vm.runInNewContext(section,ctx);
  await listener({target:boton});
  await listener({target:boton});
  assert.equal(posts,status===400?2:1);
  if(status===500){assert.equal(consultas,1);assert.equal(boton.disabled,true)}
  if(status===400){assert.equal(consultas,0);assert.equal(boton.disabled,false)}
}
(async()=>{
  await test(500,'ENTREGADA');
  await test(500,'PENDIENTE');
  await test(400,'PENDIENTE');
  console.log('OK: HTTP 500 exige verificación; HTTP 400 permite corregir la solicitud.');
})().catch(e=>{console.error(e);process.exitCode=1});
