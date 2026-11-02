'use strict';
const $=id=>document.getElementById(id);
async function api(url,options){const r=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options});const data=await r.json();if(!r.ok)throw Error(data.error||'Error de servidor');return data}
function cell(row,value){const td=document.createElement('td');td.textContent=String(value??'');row.appendChild(td)}
async function refresh(){
 const [destinos,cola,resumen,diagnostico]=await Promise.all([
 api('/api/admin/notificaciones/destinatarios'),api('/api/admin/notificaciones/cola'),
 api('/api/admin/notificaciones/resumen'),api('/api/admin/notificaciones/diagnostico')]);
 $('diagnostico').textContent=`Envío automático: ${diagnostico.automatico?'Activado':'Desactivado'} · Gmail: ${diagnostico.credenciales_configuradas?'Configurado':'Sin configurar'} · Destinatarios activos: ${diagnostico.destinatarios_activos} · Intervalo: ${diagnostico.intervalo_minutos} min · Reintentos agotados: ${diagnostico.cola?.agotados||0}`;
 $('enviar').disabled=!diagnostico.credenciales_configuradas||!diagnostico.destinatarios_activos;
 $('enviar').title=$('enviar').disabled?'Configura Gmail y al menos un destinatario activo':'Enviar notificaciones pendientes';
 $('resumen').textContent=`Pendientes: ${resumen.PENDIENTE||0} · Enviando: ${resumen.ENVIANDO||0} · Enviados: ${resumen.ENVIADO||0} · Errores: ${resumen.ERROR||0}`;
 $('destinos').replaceChildren();
 for(const d of destinos){const tr=document.createElement('tr');cell(tr,d.correo);cell(tr,d.activo?'Activo':'Inactivo');const td=document.createElement('td');const b=document.createElement('button');b.textContent=d.activo?'Desactivar':'Activar';b.onclick=async()=>{try{await api('/api/admin/notificaciones/destinatarios/'+d.id,{method:'PATCH',body:JSON.stringify({activo:d.activo?0:1})});await refresh()}catch(e){message(e.message,true)}};td.appendChild(b);tr.appendChild(td);$('destinos').appendChild(tr)}
 window.notificacionesVisibles=cola;
 $('cola').replaceChildren();for(const item of cola){
  const tr=document.createElement('tr');
  [item.evento,item.referencia_id,item.estado,item.intentos,item.proximo_intento||'—',item.ultimo_error||'—'].forEach(v=>cell(tr,v));
  const td=document.createElement('td');
  if(item.estado==='ERROR'&&item.intentos<5){
   const b=document.createElement('button');b.textContent='Reintentar';
   b.onclick=async()=>{try{await api('/api/admin/notificaciones/'+item.id+'/reintentar',{method:'POST'});message('Reintento programado');await refresh()}catch(e){message(e.message,true)}};
   td.appendChild(b);
  }
  tr.appendChild(td);$('cola').appendChild(tr);
 }
}
function message(s,error=false){$('estado').textContent=s;$('estado').className=error?'error':''}
$('form').onsubmit=async e=>{e.preventDefault();try{await api('/api/admin/notificaciones/destinatarios',{method:'POST',body:JSON.stringify({correo:$('correo').value})});$('correo').value='';message('Destinatario guardado');await refresh()}catch(err){message(err.message,true)}};
$('enviar').onclick=async()=>{try{const r=await api('/api/admin/notificaciones/enviar-pendientes',{method:'POST'});message(r.motivo||`Procesadas: ${r.procesadas}, enviadas: ${r.enviadas}`);await refresh()}catch(e){message(e.message,true)}};
refresh().catch(e=>message(e.message,true));

// CSV con protección contra fórmulas de hojas de cálculo.
function csvField(value){
 let text=String(value??'');
 if(/^[\s]*[=+@-]/.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
}
function exportarCSV(){
 const columnas=['id','evento','referencia_id','estado','intentos','creado_en','proximo_intento','enviado_en','ultimo_error'];
 const filas=[columnas,...(window.notificacionesVisibles||[]).map(item=>columnas.map(k=>item[k]))];
 const csv='\uFEFF'+filas.map(row=>row.map(csvField).join(';')).join('\r\n');
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download='notificaciones-bodega-ap.csv';
 document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
$('exportar').onclick=exportarCSV;
