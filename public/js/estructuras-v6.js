const $=id=>document.getElementById(id);
const escapar=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function dibujar(){const m=Number($('modulos').value)||0,n=Number($('niveles').value)||0,p=Number($('posiciones').value)||0;const total=m*n*p;$('total').textContent=`Total: ${total} posiciones ${total>500?'(máximo 500)':''}`;const preview=$('preview');preview.replaceChildren();if(total>120||total===0){preview.textContent='Vista previa disponible hasta 120 posiciones.';return;}for(let nivel=n;nivel>=1;nivel--){const fila=document.createElement('div');fila.className='nivel-v6';const titulo=document.createElement('small');titulo.textContent='N'+nivel;fila.append(titulo);for(let modulo=1;modulo<=m;modulo++)for(let posicion=1;posicion<=p;posicion++){const celda=document.createElement('span');celda.className='celda-v6';celda.textContent=`M${modulo}·P${posicion}`;fila.append(celda);}preview.append(fila);}}
['modulos','niveles','posiciones'].forEach(id=>$(id).addEventListener('input',dibujar));dibujar();
async function cargar(){const listado=$('listado');try{const r=await fetch('/api/estructuras');if(!r.ok)throw Error('No se pudo cargar');const data=await r.json();listado.replaceChildren();if(!data.length){listado.textContent='Aún no hay estructuras configuradas.';return;}for(const e of data){const div=document.createElement('div');div.className='tarjeta-v6';div.innerHTML=`<strong>${escapar(e.nombre)}</strong> · ${escapar(e.tipo)}<p>Bodega ${e.bodega} · Pasillo ${e.pasillo} · ${e.total_posiciones} posiciones · ${e.niveles} niveles</p>`;const boton=document.createElement('button');boton.textContent='Ver posiciones';boton.className='boton-v6';const detalle=document.createElement('div');boton.addEventListener('click',async()=>{if(detalle.childNodes.length){detalle.replaceChildren();return;}const resp=await fetch('/api/estructuras/'+e.id+'/posiciones');if(!resp.ok){detalle.textContent='No se pudieron cargar las posiciones';return;}const posiciones=await resp.json();detalle.textContent=posiciones.map(x=>`${x.codigo} (M${x.modulo}, N${x.nivel}, P${x.posicion})`).join(' · ');});div.append(boton,detalle);listado.append(div);}}catch(e){listado.textContent=e.message;}}
$('formEstructura').addEventListener('submit',async ev=>{ev.preventDefault();const btn=$('guardar');btn.disabled=true;$('mensaje').textContent='Guardando...';if($('resultadoEstructura'))$('resultadoEstructura').hidden=true;const payload={nombre:$('nombre').value,tipo:$('tipo').value,bodega:Number($('estructura-bodega').value),pasillo:Number($('estructura-pasillo').value),modulos:Number($('modulos').value),niveles:Number($('niveles').value),posiciones:Number($('posiciones').value),capacidad_kg:$('capacidad').value};try{const r=await fetch('/api/estructuras',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await r.json();$('mensaje').textContent=data.mensaje||'Error';if(r.ok){
 await cargar();
 const panel=$('resultadoEstructura');
 if(panel){
  panel.hidden=false;
  const listado=$('codigosCreados');listado.replaceChildren();
  $('estadoCopia').textContent='';
  try{
   const respuesta=await fetch('/api/estructuras/'+encodeURIComponent(data.id)+'/posiciones');
   if(!respuesta.ok)throw new Error('No se pudieron consultar los códigos creados.');
   const posiciones=await respuesta.json();
   const codigos=posiciones.map(x=>String(x.codigo));
   for(const codigo of codigos){const item=document.createElement('span');item.className='codigo-creado';item.textContent=codigo;listado.append(item);}
   $('copiarCodigos').disabled=!codigos.length;
   const descargar=$('descargarCodigos');
   descargar.disabled=!codigos.length;
   descargar.onclick=()=>{
    // CSV con separador de Excel en Chile; evita fórmulas en celdas.
    const campo=v=>{let t=String(v??'');if(/^\s*[=+@-]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"';};
    const filas=[['Código','Bodega','Pasillo','Módulo','Nivel','Posición','Estado'],
     ...posiciones.map(x=>[x.codigo,payload.bodega,payload.pasillo,x.modulo,x.nivel,x.posicion,x.estado])];
    const csv='\uFEFF'+filas.map(f=>f.map(campo).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const enlace=document.createElement('a');enlace.href=url;
    enlace.download='ubicaciones-estructura-'+data.id+'.csv';
    document.body.append(enlace);enlace.click();enlace.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
   };
   $('copiarCodigos').onclick=async()=>{
    try{await navigator.clipboard.writeText(codigos.join('\n'));$('estadoCopia').textContent='Códigos copiados.';}
    catch(_){$('estadoCopia').textContent='No se pudo copiar automáticamente. Selecciona los códigos para copiarlos.';}
   };
  }catch(error){listado.textContent=error.message;$('copiarCodigos').disabled=true;$('descargarCodigos').disabled=true;}
 }
 document.dispatchEvent(new CustomEvent("bodega:actualizada",{detail:{bodega:payload.bodega}}));
}}catch(e){$('mensaje').textContent='No fue posible conectar con el servidor.';}finally{btn.disabled=false;}});cargar();
