const $=s=>document.querySelector(s);
const api=async(url,opts)=>{const r=await fetch(url,opts);if(!r.ok)throw Error('Error HTTP '+r.status+' al consultar '+url);let d;try{d=await r.json()}catch{throw Error('Respuesta no válida de '+url)}return d;};
const exigirLista=(valor,nombre)=>{if(!Array.isArray(valor))throw Error('Formato incorrecto de '+nombre);return valor;};
const filaVacia=(selector,columnas,mensaje)=>{const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=columnas;td.textContent=mensaje;tr.append(td);$(selector).replaceChildren(tr);};
const option=(id,label)=>{const el=document.createElement('option');el.value=id;el.textContent=label;return el;};
const fill=(selector,rows,format)=>document.querySelectorAll(selector).forEach(el=>{el.replaceChildren(option('','Seleccione...'));rows.forEach(r=>el.append(option(r.id,format(r))));});
const render=(target,rows,fields)=>{const el=$(target);el.replaceChildren();rows.forEach(r=>{const tr=document.createElement('tr');fields.forEach(k=>{const td=document.createElement('td');td.textContent=r[k]??'';tr.append(td)});el.append(tr)});};
const formatearCantidad = n => Number.isFinite(n) ? new Intl.NumberFormat('es-CL',{maximumFractionDigits:3}).format(n) : '—';
let filasStock = [], filasConciliacion = [];
function aplicarFiltro(){
 const termino=($('#filtro-stock')?.value||'').trim().toLocaleLowerCase('es');
 const coincide=fila=>Object.values(fila).some(v=>String(v??'').toLocaleLowerCase('es').includes(termino));
 const saldos=filasStock.filter(coincide), conciliacion=filasConciliacion.filter(coincide);
 render('#saldos',saldos,['proyecto_codigo','producto_codigo','ubicacion','cantidad']);
 if(!saldos.length)filaVacia('#saldos',4,termino?'Sin coincidencias.':'Todavía no hay stock asignado a proyectos.');
 render('#conciliacion',conciliacion,['producto','ubicacion','fisico','asignado','sin_asignar','estado']);
 if(!conciliacion.length)filaVacia('#conciliacion',6,termino?'Sin coincidencias.':'No hay inventario para conciliar.');
}
async function load(){
 const [proyectos,productos,ubicaciones,stock,historial,conciliacion]=await Promise.all([
 api('/api/proyectos'),api('/api/productos'),api('/api/ubicaciones'),api('/api/stock-proyectos'),api('/api/transferencias-proyectos'),api('/api/stock-proyectos/conciliacion')]);
 exigirLista(proyectos,'proyectos');exigirLista(productos,'productos');exigirLista(ubicaciones,'ubicaciones');exigirLista(stock,'stock');exigirLista(historial,'transferencias');exigirLista(conciliacion,'conciliación');
 fill('.proyectos',proyectos.filter(p=>p.estado==='ACTIVO'),p=>`${p.codigo} — ${p.nombre}`);
 fill('.productos',productos.filter(p=>p.tipo_control==='CANTIDAD'),p=>`${p.codigo} — ${p.nombre}`);
 fill('.ubicaciones',ubicaciones,u=>u.codigo);
 filasStock=stock;filasConciliacion=conciliacion;aplicarFiltro();
 const suma=campo=>conciliacion.reduce((total,r)=>total+(Number(r[campo])||0),0);
 $('#kpi-fisico').textContent=formatearCantidad(suma('fisico'));
 $('#kpi-asignado').textContent=formatearCantidad(suma('asignado'));
 $('#kpi-libre').textContent=formatearCantidad(suma('sin_asignar'));
 $('#kpi-alertas').textContent=String(conciliacion.filter(r=>{const fisico=Number(r.fisico)||0,asignado=Number(r.asignado)||0,libre=Number(r.sin_asignar)||0;return fisico<0||asignado<0||libre<0||asignado>fisico||!['OK','CORRECTO','CONCILIADO'].includes(String(r.estado||'').toUpperCase());}).length);
 $('#stock-actualizado').textContent='Actualizado '+new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'});
 render('#historial',historial,['fecha','origen','destino','producto','cantidad']);
 if(!historial.length) filaVacia('#historial',5,'Aún no hay transferencias registradas.'); 
}
for(const [form,url] of [['#asignar','/api/stock-proyectos/asignar'],['#transferir','/api/transferencias-proyectos']]){
 $(form).addEventListener('submit',async e=>{e.preventDefault();const b=$(form).querySelector('button');b.disabled=true;try{await api(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});$('#mensaje').textContent='Operación registrada correctamente';await load();}catch(err){$('#mensaje').textContent=err.message;}finally{b.disabled=false;}});
}
load().catch(e=>$('#mensaje').textContent='Error al cargar: '+e.message);

$('#filtro-stock').addEventListener('input',aplicarFiltro);
$('#actualizar-stock').addEventListener('click',async()=>{const b=$('#actualizar-stock');b.disabled=true;$('#stock-actualizado').textContent='Actualizando...';try{await load()}catch(e){$('#stock-actualizado').textContent='No se pudo actualizar: '+e.message}finally{b.disabled=false}});
