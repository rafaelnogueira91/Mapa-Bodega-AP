'use strict';
const filtrarEntregas=(registros,estado,busqueda)=>{
  const q=String(busqueda||'').trim().toLocaleLowerCase('es');
  return registros.filter(e=>{
    if(estado==='PENDIENTE' && e.fecha_devolucion)return false;
    if(estado==='DEVUELTA' && !e.fecha_devolucion)return false;
    return !q || [e.numero_serie,e.proyecto,e.trabajador,e.ubicacion_origen,e.ubicacion_devolucion]
      .some(valor=>String(valor??'').toLocaleLowerCase('es').includes(q));
  });
};

// Filtra alertas sobre entregas pendientes; no altera registros ni existencias.
const filtrarPorAlerta=(registros,nivel,ahora=new Date())=>{
  const permitidos=['TODAS','PRIORITARIA','ATENCION','NORMAL','SIN_FECHA'];
  const seleccionado=permitidos.includes(nivel)?nivel:'TODAS';
  if(seleccionado==='TODAS')return registros;
  return registros.filter(e=>nivelAlerta(e,ahora)===seleccionado);
};
const estadoEntrega=e=>e.fecha_devolucion?'Devuelta':'Pendiente';
const resumenEntregas=registros=>({
  pendientes:registros.filter(e=>!e.fecha_devolucion).length,
  devueltas:registros.filter(e=>Boolean(e.fecha_devolucion)).length
});
const diasPendiente=(fecha,ahora=new Date())=>{
  if(!fecha)return null;
  const texto=String(fecha).trim();
  // SQLite almacena normalmente CURRENT_TIMESTAMP en UTC sin sufijo horario.
  const normalizado=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(texto)
    ? texto.replace(' ','T')+'Z' : texto;
  const inicio=new Date(normalizado);
  if(!Number.isFinite(inicio.getTime()))return null;
  const dias=Math.floor((ahora.getTime()-inicio.getTime())/86400000);
  return Math.max(0,dias);
};
const antiguedadEntrega=(entrega,ahora=new Date())=>{
  if(entrega.fecha_devolucion)return 'Devuelta';
  const dias=diasPendiente(entrega.fecha_entrega,ahora);
  return dias===null?'Sin fecha':`${dias} día${dias===1?'':'s'}`;
};
// Umbrales de seguimiento visual: 15 días (atención) y 30 días (prioritario).
const nivelAlerta=(entrega,ahora=new Date())=>{
  if(entrega.fecha_devolucion)return 'DEVUELTA';
  const dias=diasPendiente(entrega.fecha_entrega,ahora);
  if(dias===null)return 'SIN_FECHA';
  if(dias>=30)return 'PRIORITARIA';
  if(dias>=15)return 'ATENCION';
  return 'NORMAL';
};
const etiquetaAlerta=nivel=>({
  PRIORITARIA:'Prioritaria (30+ días)',
  ATENCION:'Atención (15+ días)',
  NORMAL:'En plazo de seguimiento',
  SIN_FECHA:'Sin fecha de entrega',
  DEVUELTA:'Devuelta'
}[nivel]||'Sin información');
// Contadores sobre entregas únicas, no sobre grupos de trabajadores.
// Se calculan sobre los registros cargados (límite del endpoint: 500).
const resumenAlertas=(registros,ahora=new Date())=>{
  const resumen={PRIORITARIA:0,ATENCION:0,NORMAL:0,SIN_FECHA:0,pendientes:0,devueltas:0};
  for(const entrega of registros){
    const nivel=nivelAlerta(entrega,ahora);
    if(nivel==='DEVUELTA')resumen.devueltas++;
    else {resumen.pendientes++;resumen[nivel]++;}
  }
  return resumen;
};
// Exportación de pendientes según los filtros actuales, compatible con Excel.
// Se neutralizan fórmulas al abrir archivos CSV en hojas de cálculo.
const celdaCSV=valor=>{
  let texto=String(valor??'');
  if(/^[\s\u0000-\u001f]*[=+@-]/.test(texto))texto="'"+texto;
  return '"'+texto.replace(/"/g,'""')+'"';
};
const crearCSVDePendientes=(registros,ahora=new Date())=>{
  const columnas=['Número de serie','Trabajador responsable','Proyecto','Ubicación de origen','Fecha de entrega','Días pendientes','Nivel de alerta'];
  const filas=registros.filter(e=>!e.fecha_devolucion).map(e=>[
    e.numero_serie,e.trabajador,e.proyecto,e.ubicacion_origen,e.fecha_entrega,
    diasPendiente(e.fecha_entrega,ahora)??'',etiquetaAlerta(nivelAlerta(e,ahora))
  ]);
  return '\uFEFF'+[columnas,...filas].map(fila=>fila.map(celdaCSV).join(';')).join('\r\n')+'\r\n';
};
const agruparPendientes=registros=>{
  const grupos=new Map();
  for(const e of registros){
    if(e.fecha_devolucion)continue;
    const trabajador=String(e.trabajador||'Sin trabajador');
    const proyecto=String(e.proyecto||'Sin proyecto');
    const clave=JSON.stringify([trabajador,proyecto]);
    if(!grupos.has(clave))grupos.set(clave,{trabajador,proyecto,pendientes:0,series:[],primeraEntrega:null});
    const grupo=grupos.get(clave);
    grupo.pendientes++;
    if(e.fecha_entrega && (!grupo.primeraEntrega || String(e.fecha_entrega)<grupo.primeraEntrega))grupo.primeraEntrega=String(e.fecha_entrega);
    if(e.numero_serie)grupo.series.push(String(e.numero_serie));
  }
  return [...grupos.values()].map(g=>({...g,series:g.series.join(', '),antiguedad_maxima:antiguedadEntrega({fecha_entrega:g.primeraEntrega}),alerta:etiquetaAlerta(nivelAlerta({fecha_entrega:g.primeraEntrega}))}))
    .sort((a,b)=>b.pendientes-a.pendientes || a.trabajador.localeCompare(b.trabajador,'es') || a.proyecto.localeCompare(b.proyecto,'es'));
};
if(typeof module!=='undefined' && module.exports)module.exports={filtrarEntregas,filtrarPorAlerta,estadoEntrega,resumenEntregas,resumenAlertas,agruparPendientes,diasPendiente,antiguedadEntrega,nivelAlerta,etiquetaAlerta,celdaCSV,crearCSVDePendientes};
const $=s=>document.querySelector(s);
let entregasCargadas=[];
function entregasFiltradas(){return filtrarPorAlerta(filtrarEntregas(entregasCargadas,$('#filtroEntregas').value,$('#buscarEntrega').value),$('#filtroAlerta').value);}
function actualizarEntregas(){
  const visibles=entregasFiltradas();
  const alertas=resumenAlertas(visibles);
  const todos=resumenAlertas(entregasCargadas);
  const contadores=[['Prioritarias',alertas.PRIORITARIA,'prioritaria'],['En atención',alertas.ATENCION,'atencion'],['Seguimiento normal',alertas.NORMAL,'normal'],['Sin fecha',alertas.SIN_FECHA,'sin-fecha']];
  const panel=$('#resumenAlertas');
  panel.replaceChildren();
  for(const [titulo,cantidad,clase] of contadores){
    const tarjeta=document.createElement('div');tarjeta.className='resumen-alerta resumen-alerta-'+clase;
    const numero=document.createElement('strong');numero.textContent=String(cantidad);
    const etiqueta=document.createElement('span');etiqueta.textContent=titulo;
    tarjeta.append(numero,etiqueta);panel.append(tarjeta);
  }
  $('#resumenAlertasDescripcion').textContent=`${alertas.pendientes} pendientes en la selección actual; ${todos.pendientes} pendientes entre las ${entregasCargadas.length} entregas cargadas (máximo 500). Los contadores respetan los filtros.`;
  const conEstado=visibles.map(e=>({...e,estado_entrega:estadoEntrega(e),antiguedad:antiguedadEntrega(e),alerta:etiquetaAlerta(nivelAlerta(e))}));
  renderRows('#entregas',conEstado,['numero_serie','estado_entrega','proyecto','trabajador','ubicacion_origen','fecha_entrega','antiguedad','alerta','fecha_devolucion','ubicacion_devolucion']);
  const pendientesPorResponsable=agruparPendientes(visibles);
  renderRows('#pendientesPorResponsable',pendientesPorResponsable,['trabajador','proyecto','pendientes','antiguedad_maxima','alerta','series']);
  $('#contadorPendientesPorResponsable').textContent=`${pendientesPorResponsable.length} combinaciones de trabajador y proyecto con herramientas pendientes según los filtros (sobre las últimas 500 entregas consultadas).`;
  const resumen=resumenEntregas(entregasCargadas);
  $('#contadorEntregas').textContent=`Mostrando ${visibles.length} de ${entregasCargadas.length} entregas cargadas (máximo 500). Pendientes: ${resumen.pendientes}. Devueltas: ${resumen.devueltas}.`;
}

async function api(url,options){const r=await fetch(url,options);const data=await r.json();if(!r.ok)throw Error(data.error||'Error de servidor');return data;}
function renderRows(selector,rows,keys){const body=$(selector);body.replaceChildren();for(const item of rows){const tr=document.createElement('tr');for(const key of keys){const td=document.createElement('td');td.textContent=item[key]??'—';
if(key==='alerta'){
  const nivel=String(item[key]||'');
  if(nivel.startsWith('Prioritaria'))td.classList.add('alerta-prioritaria');
  else if(nivel.startsWith('Atención'))td.classList.add('alerta-atencion');
  else if(nivel.startsWith('Sin fecha'))td.classList.add('alerta-sin-fecha');
}
tr.append(td);}body.append(tr);}if(!rows.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=keys.length;td.textContent='Sin registros';tr.append(td);body.append(tr);}}
async function cargar(){const [series,proyectos,historial,entregas]=await Promise.all([api('/api/series-proyectos'),api('/api/proyectos'),api('/api/series-proyectos/historial'),api('/api/series-proyectos/entregas')]);
const select=$('#serie');select.replaceChildren();for(const s of series){const option=document.createElement('option');option.value=s.serie_id;option.textContent=`${s.numero_serie} · ${s.producto} · ${s.proyecto||'Libre'}`;select.append(option);}
const dest=$('#destino');dest.replaceChildren();const libre=document.createElement('option');libre.value='';libre.textContent='Sin proyecto (liberar)';dest.append(libre);for(const p of proyectos.filter(p=>p.estado==='ACTIVO')){const option=document.createElement('option');option.value=p.id;option.textContent=`${p.codigo} · ${p.nombre}`;dest.append(option);}
renderRows('#tabla',series.filter(s=>s.proyecto_id),['numero_serie','producto','ubicacion','proyecto']);entregasCargadas=entregas;actualizarEntregas();renderRows('#historial',historial,['fecha','numero_serie','accion','origen','destino','motivo']);}
if(typeof document!=='undefined'){
$('#filtroEntregas').addEventListener('change',actualizarEntregas);
$('#filtroAlerta').addEventListener('change',actualizarEntregas);
$('#buscarEntrega').addEventListener('input',actualizarEntregas);
$('#exportarPendientesCSV').addEventListener('click',async()=>{
  const boton=$('#exportarPendientesCSV');
  boton.disabled=true;
  $('#estadoExportacion').textContent='Consultando todas las herramientas pendientes...';
  try {
    const registros=[];
    let cursor=0;
    for(;;){
      const pagina=await api('/api/series-proyectos/pendientes-exportacion?cursor='+cursor);
      if(!pagina||!Array.isArray(pagina.registros))throw new Error('Respuesta de exportación inválida');
      registros.push(...pagina.registros);
      if(pagina.siguienteCursor===null)break;
      if(!Number.isSafeInteger(pagina.siguienteCursor)||pagina.siguienteCursor<=cursor)throw new Error('Cursor de exportación inválido');
      cursor=pagina.siguienteCursor;
      $('#estadoExportacion').textContent=`Consultadas ${registros.length} herramientas pendientes...`;
    }
    const fechaReporte=new Date();
    const filtradas=filtrarPorAlerta(filtrarEntregas(registros,'PENDIENTE',$('#buscarEntrega').value),$('#filtroAlerta').value,fechaReporte);
    if(!filtradas.length){$('#estadoExportacion').textContent='No hay herramientas pendientes con los filtros actuales.';return;}
    const contenido=crearCSVDePendientes(filtradas,fechaReporte);
    const blob=new Blob([contenido],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    try {
      const enlace=document.createElement('a');
      enlace.href=url;
      enlace.download='herramientas-pendientes-'+new Date().toISOString().slice(0,10)+'.csv';
      document.body.append(enlace);
      try { enlace.click(); }
      finally { enlace.remove(); }
    } finally {
      // Permite que el navegador inicie la descarga antes de liberar el objeto.
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    $('#estadoExportacion').textContent=`Reporte preparado con ${filtradas.length} herramientas pendientes de ${registros.length} registros consultados (sin límite de 500).`;
  }catch(error){$('#estadoExportacion').textContent='No se pudo exportar: '+(error.message||'error de consulta');}
  finally{boton.disabled=false;}
});
$('#mover').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const data=Object.fromEntries(new FormData(form));data.proyecto_destino_id=data.proyecto_destino_id||null;const estado=$('#estado');estado.textContent='Guardando...';try{await api('/api/series-proyectos/mover',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});estado.textContent='Movimiento registrado';form.reset();await cargar();}catch(err){estado.textContent=err.message;}});
cargar().catch(err=>{$('#estado').textContent=err.message;});
}
