(() => {
const $=id=>document.getElementById(id);
async function actualizar(){
 const r=await fetch('/api/ubicaciones');if(!r.ok)throw new Error('No se pudieron cargar las ubicaciones.');
 const items=await r.json();const u=$('ubicacionEliminar'),b=$('bodegaEliminar');
 u.replaceChildren(new Option('Selecciona una ubicación',''));
 b.replaceChildren(new Option('Selecciona una bodega',''));
 const bodegas=new Set();
 for(const x of items){u.add(new Option(x.codigo,x.id));bodegas.add(x.bodega)}
 for(const n of [...bodegas].sort((a,b)=>a-b))b.add(new Option('Bodega '+n,n));
}
async function eliminar(e,select,url,tipo){
 e.preventDefault();const id=$(select).value;if(!id)return;
 const nombre=$(select).selectedOptions[0]?.textContent||tipo;
 if(!confirm(`¿Eliminar ${nombre}? Esta acción no se puede deshacer.`))return;
 try{
  const r=await fetch(url+encodeURIComponent(id),{method:'DELETE'});
  const data=await r.json();if(!r.ok)throw new Error(data.mensaje||'No se pudo eliminar.');
  alert(data.mensaje);await actualizar();
  if(typeof cargarUbicaciones==='function')await cargarUbicaciones();
  document.dispatchEvent(new CustomEvent('bodega:actualizada'));
 }catch(err){alert(err.message)}
}
$('eliminarUbicacionForm')?.addEventListener('submit',e=>eliminar(e,'ubicacionEliminar','/api/ubicaciones/id/','ubicación'));
$('eliminarBodegaForm')?.addEventListener('submit',e=>eliminar(e,'bodegaEliminar','/api/bodegas/','bodega'));
actualizar().catch(console.error);
})();
