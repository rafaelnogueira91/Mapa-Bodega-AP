"use strict";
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let inventario=[];
// Evita que Excel/LibreOffice interpreten valores del inventario como fórmulas.
function celdaCsv(valor){
 const texto=String(valor??'');
 const seguro=/^[\s\u0000-\u001f]*[=+@-]/.test(texto) && typeof valor!=='number' ? "'"+texto : texto;
 return '"'+seguro.replace(/"/g,'""')+'"';
}
function validarReportes(resumen, existencias, alertas){
 if(!resumen || typeof resumen!=='object' || !Array.isArray(resumen.solicitudes) ||
    !Array.isArray(existencias) || !existencias.every(f=>f && typeof f==='object' && !Array.isArray(f)) ||
    !alertas || typeof alertas!=='object' ||
    !['negativos','duplicados','solicitudes'].every(k=>Array.isArray(alertas[k]))) {
   throw new Error('El servidor devolvió datos de reportes incompletos.');
 }
}

const columnasConciliacion=[['codigo','Código'],['nombre','Producto'],['tipo_control','Control'],['ubicacion','Ubicación'],['fisico','Físico'],['reservado','Asignado'],['libre','Libre'],['estado','Estado']];
function mostrarConciliacion(){
 const estado=$('filtro').value;
 const busqueda=$('buscar').value.trim().toLocaleLowerCase('es');
 const filas=inventario.filter(r=>(estado==='TODOS'||r.estado===estado)&&[r.codigo,r.nombre,r.ubicacion].some(v=>String(v??'').toLocaleLowerCase('es').includes(busqueda)));
 $('conteo').textContent=`${filas.length} registros visibles · ${inventario.filter(r=>r.estado==='INCONSISTENTE').length} inconsistencias en total`;
 $('inventario').innerHTML=filas.length?`<table><thead><tr>${columnasConciliacion.map(c=>`<th>${esc(c[1])}</th>`).join('')}</tr></thead><tbody>${filas.map(r=>`<tr class="${r.estado==='INCONSISTENTE'?'inconsistente':''}">${columnasConciliacion.map(c=>`<td>${esc(r[c[0]])}</td>`).join('')}</tr>`).join('')}</tbody></table>`:'<p>No hay registros para este filtro.</p>';
}

const tabla=(rows,cols)=>rows.length?`<table><thead><tr>${cols.map(c=>`<th>${esc(c[1])}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${esc(r[c[0]])}</td>`).join('')}</tr>`).join('')}</tbody></table>`:'<p>Sin registros.</p>';
async function api(url){const r=await fetch(url);if(!r.ok)throw Error('No se pudo consultar '+url);return r.json()}
let reportesCargando=false;
async function iniciar(){
 if(reportesCargando)return;
 reportesCargando=true;
 const actualizar=$('actualizarReportes');
 if(actualizar){actualizar.disabled=true;actualizar.textContent='Actualizando…';}
 try{
 const [r,i,a]=await Promise.all([api('/api/v5/resumen'),api('/api/v5/inventario-libre'),api('/api/v5/alertas')]);
 validarReportes(r,i,a);
 inventario=i;
 $('error').textContent='';
 const cards=[['Productos',r.productos],['Ubicaciones',r.ubicaciones],['Personal activo',r.personal],['Unidades disponibles',r.unidades],['Series disponibles',r.series],['Solicitudes pendientes',r.pendientes],['Movimientos registrados',r.movimientos]];
 $('cards').innerHTML=cards.map(([name,n])=>`<div class="card"><div>${esc(name)}</div><div class="num">${esc(n)}</div></div>`).join('');
 mostrarConciliacion();
 $('alertas').innerHTML=`<h3>Stock negativo (${a.negativos.length})</h3>`+tabla(a.negativos,[['codigo','Código'],['nombre','Producto'],['ubicacion','Ubicación'],['cantidad','Cantidad']])+`<h3>Registros de stock duplicados (${a.duplicados.length})</h3>`+tabla(a.duplicados,[['codigo','Código'],['ubicacion','Ubicación'],['registros','Registros']])+`<h3>Solicitudes sin entregar (${a.solicitudes.length})</h3>`+tabla(a.solicitudes,[['id','N.º'],['estado','Estado'],['fecha_solicitud','Fecha']]);
 $('solicitudes').innerHTML=tabla(r.solicitudes,[['estado','Estado'],['total','Total']]);
 const fecha=$('fechaActualizacion');if(fecha)fecha.textContent='Actualizado: '+new Date().toLocaleString('es-CL');
}catch(e){console.error('Error al cargar reportes:',e);$('error').textContent='No se pudieron cargar los reportes: '+e.message}
finally{reportesCargando=false;if(actualizar){actualizar.disabled=false;actualizar.textContent='Actualizar datos';}}}
$('exportar').addEventListener('click',()=>{
 const cols=columnasConciliacion.map(c=>c[0]);
 const csv='\uFEFF'+[cols.join(';'),...inventario.map(row=>cols.map(k=>celdaCsv(row[k])).join(';'))].join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='conciliacion-bodega-ap.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
const botonActualizar=$('actualizarReportes');if(botonActualizar)botonActualizar.addEventListener('click',iniciar);
$('filtro').addEventListener('change',mostrarConciliacion);
$('buscar').addEventListener('input',mostrarConciliacion);
iniciar();
