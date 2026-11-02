(() => {
const $=id=>document.getElementById(id);
const notify=async response=>{
 let data={};try{data=await response.json()}catch{}
 if(!response.ok)throw new Error(data.mensaje||'No se pudo completar la operación.');
 return data;
};
async function refresh(){
 const items=await notify(await fetch('/api/ubicaciones'));
 const select=$('ubicacionEditar');const selected=select.value;
 select.replaceChildren(new Option('Selecciona una ubicación',''));
 for(const item of items)select.add(new Option(item.codigo,item.id));
 select.value=selected;
 if(typeof cargarUbicaciones==='function')await cargarUbicaciones();
 document.dispatchEvent(new CustomEvent('bodega:actualizada'));
}
$('formCodigoManual')?.addEventListener('submit',async e=>{
 e.preventDefault();
 try{
  const data=await notify(await fetch('/api/ubicaciones/manual',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({codigo:$('codigoManual').value})}));
  alert(data.mensaje);$('codigoManual').value='';await refresh();
 }catch(err){alert(err.message)}
});
$('formEditarCodigo')?.addEventListener('submit',async e=>{
 e.preventDefault();
 const id=$('ubicacionEditar').value;
 if(!id)return;
 try{
  const data=await notify(await fetch('/api/ubicaciones/codigo/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({codigo:$('codigoNuevo').value})}));
  alert(data.mensaje);$('codigoNuevo').value='';await refresh();
 }catch(err){alert(err.message)}
});
refresh().catch(console.error);
})();
