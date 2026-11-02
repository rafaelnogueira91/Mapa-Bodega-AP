"use strict";
// Vista de solo lectura; todo el texto de la API se incorpora con textContent.
(()=>{
 const form=document.getElementById('formTrazabilidad');
 if(!form)return;
 const estado=document.getElementById('estadoTrazabilidad');
 const resultado=document.getElementById('resultadoTrazabilidad');
 const filtroEntregas=document.getElementById('estadoDevolucionTrazabilidad');
 let ultimoResultado=null;
 const estadoEntrega=r=>r.fecha_devolucion?'Devuelta':'Pendiente';
 const entregasFiltradas=(registros,estado)=>{
  if(estado==='PENDIENTE')return registros.filter(r=>!r.fecha_devolucion);
  if(estado==='DEVUELTA')return registros.filter(r=>Boolean(r.fecha_devolucion));
  return registros;
 };
 const mostrarHistorialEntregas=(datos)=>{
  const anterior=document.getElementById('historialEntregasSeries');
  if(anterior)anterior.remove();
  const todos=datos.historialEntregas||[];
  const registros=entregasFiltradas(todos,filtroEntregas?.value||'TODAS');
  const seccion=document.createElement('div');
  seccion.id='historialEntregasSeries';
  const contador=document.createElement('p');
  contador.setAttribute('role','status');
  contador.textContent=`Mostrando ${registros.length} de ${todos.length} entregas y devoluciones consultadas (máximo 300).`;
  seccion.appendChild(contador);
  seccion.appendChild(tabla('Historial de entregas y devoluciones por serie',
    ['Serie','Estado','Proyecto','Trabajador','Solicitud','Fecha entrega','Fecha devolución','Origen','Ubicación devolución'],
    registros,r=>[r.serie,estadoEntrega(r),r.proyecto,r.trabajador,r.solicitud,r.fecha_entrega,r.fecha_devolucion||'—',r.ubicacion_origen,r.ubicacion_devolucion]));
  const movimientos=[...resultado.children].find(x=>x.tagName==='SECTION'&&x.querySelector('h3')?.textContent.startsWith('Historial de movimientos'));
  if(movimientos)resultado.insertBefore(seccion,movimientos);
  else resultado.appendChild(seccion);
 };
 if(filtroEntregas)filtroEntregas.addEventListener('change',()=>{if(ultimoResultado&&ultimoResultado.producto.tipo_control==='SERIE')mostrarHistorialEntregas(ultimoResultado);});
 const celda=(fila,valor)=>{const td=document.createElement('td');td.textContent=String(valor??'—');td.style.padding='8px';td.style.borderBottom='1px solid #d9e1eb';fila.appendChild(td);};
 const tabla=(titulo,columnas,registros,convertir)=>{
  const seccion=document.createElement('section');
  const h=document.createElement('h3');h.textContent=titulo;seccion.appendChild(h);
  if(!registros.length){const p=document.createElement('p');p.textContent='Sin registros para esta consulta.';seccion.appendChild(p);return seccion;}
  const contenedor=document.createElement('div');contenedor.className='tabla-trazabilidad-scroll';contenedor.tabIndex=0;contenedor.setAttribute('role','region');contenedor.setAttribute('aria-label','Tabla: '+titulo);contenedor.style.overflowX='auto';
  const t=document.createElement('table');t.style.width='100%';t.style.borderCollapse='collapse';
  const head=document.createElement('thead'),tr=document.createElement('tr');
  for(const columna of columnas){const th=document.createElement('th');th.textContent=columna;th.style.textAlign='left';th.style.padding='8px';tr.appendChild(th);}
  head.appendChild(tr);t.appendChild(head);
  const body=document.createElement('tbody');
  for(const registro of registros){const row=document.createElement('tr');for(const dato of convertir(registro))celda(row,dato);body.appendChild(row);}
  t.appendChild(body);contenedor.appendChild(t);seccion.appendChild(contenedor);return seccion;
 };
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const codigo=document.getElementById('codigoTrazabilidad').value.trim();
  const serie=document.getElementById('serieTrazabilidad').value.trim();
  if(!codigo)return;
  const boton=form.querySelector('button[type=submit]');boton.disabled=true;
  ultimoResultado=null;resultado.replaceChildren();estado.textContent='Consultando trazabilidad...';
  try{
   const parametros=new URLSearchParams({codigo,serie});
   const respuesta=await fetch('/api/trazabilidad?'+parametros.toString());
   const datos=await respuesta.json();
   if(!respuesta.ok)throw new Error(datos.mensaje||'Error al consultar');
   const nombre=document.createElement('h3');nombre.textContent=datos.producto.nombre+' ('+datos.producto.codigo+')';resultado.appendChild(nombre);
   const esSerie=datos.producto.tipo_control==='SERIE';
   resultado.appendChild(tabla('Ubicaciones y existencias actuales',esSerie?['Ubicación','Serie','Estado']:['Ubicación','Cantidad'],datos.ubicaciones||[],r=>esSerie?[r.ubicacion,r.serie,r.estado]:[r.ubicacion,r.cantidad]));
   if(esSerie)resultado.appendChild(tabla('Asignación y entrega actual por serie',
    ['Serie','Proyecto reservado','Proyecto de entrega','Trabajador','Solicitud','Fecha de entrega','Origen'],
    datos.asignaciones||[],r=>[r.serie,r.proyecto_asignado,r.proyecto_entrega,r.trabajador,r.solicitud,r.fecha_entrega,r.ubicacion_origen]));
   ultimoResultado=datos;
   if(esSerie)mostrarHistorialEntregas(datos);
   resultado.appendChild(tabla('Historial de movimientos (últimos 300)', ['Fecha','Tipo','Origen','Destino','Cantidad','Serie','Entregado a'],datos.movimientos||[],r=>[r.fecha_movimiento,r.tipo_movimiento,r.origen,r.destino,r.cantidad,r.numero_serie,r.entregado_a]));
   estado.textContent='Consulta completada. Los movimientos se limitan a los últimos 300 registros.';
  }catch(error){estado.textContent=error.message||'No se pudo consultar la trazabilidad.';}
  finally{boton.disabled=false;}
 });
})();
