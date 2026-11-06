const $=id=>document.getElementById(id);let proyectos=[],editando=null,supervisores=[],bodegas=[];
function mensaje(texto,ok=false){$('mensaje').textContent=texto;$('mensaje').className=ok?'proyectos-ok':'proyectos-error'}
async function api(url,opts){const r=await fetch(url,opts);let data;try{data=await r.json()}catch{throw Error('Respuesta inválida del servidor')}if(!r.ok)throw Error(data.error||'Error en servidor');return data}
// Selector accesible de supervisores; el select oculto mantiene el contrato existente con el servidor.
function renderSupervisores(){
 const select=$('supervisorAsignado'),query=$('buscarSupervisor').value.trim().toLocaleLowerCase('es');
 const ids=new Set(Array.from(select.selectedOptions,o=>Number(o.value)));
 const chips=$('supervisoresSeleccionados');chips.replaceChildren();
 $('contadorSupervisores').textContent=`${ids.size} seleccionado${ids.size===1?'':'s'}`;
 for(const persona of supervisores.filter(p=>ids.has(Number(p.id)))){
  const chip=document.createElement('span');chip.className='supervisor-chip';
  const name=document.createElement('span');name.textContent=persona.nombre;
  const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`Quitar a ${persona.nombre}`);
  remove.onclick=()=>{const option=Array.from(select.options).find(o=>Number(o.value)===Number(persona.id));if(option)option.selected=false;renderSupervisores()};
  chip.append(name,remove);chips.append(chip);
 }
 if(!ids.size){const empty=document.createElement('span');empty.className='supervisor-empty';empty.textContent='Aún no hay supervisores asignados';chips.append(empty)}
 const results=$('resultadosSupervisor');results.replaceChildren();
 const matches=supervisores.filter(p=>`${p.nombre} ${p.rut||''}`.toLocaleLowerCase('es').includes(query));
 if(!matches.length){const empty=document.createElement('div');empty.className='supervisor-empty';empty.textContent='No se encontraron supervisores activos';results.append(empty)}
 for(const persona of matches){const item=document.createElement('div');item.className='supervisor-result';item.setAttribute('role','option');item.setAttribute('aria-selected',String(ids.has(Number(persona.id))));
  const info=document.createElement('span');info.textContent=persona.nombre;const sub=document.createElement('small');sub.textContent=persona.rut||'';info.append(sub);
  const btn=document.createElement('button');btn.type='button';btn.textContent=ids.has(Number(persona.id))?'Agregado':'+ Agregar';btn.disabled=ids.has(Number(persona.id));
  btn.onclick=()=>{const option=Array.from(select.options).find(o=>Number(o.value)===Number(persona.id));if(option)option.selected=true;renderSupervisores()};
  item.append(info,btn);results.append(item);
 }
}
$('buscarSupervisor').addEventListener('input',renderSupervisores);
async function cargarAsignaciones(){
  try {
    const [personas, ubicaciones]=await Promise.all([api('/api/personal'),api('/api/ubicaciones')]);
    supervisores=(Array.isArray(personas)?personas:[]).filter(p=>String(p.cargo).toUpperCase()==='SUPERVISOR' && String(p.estado).toUpperCase()==='ACTIVO');
    bodegas=[...new Set((Array.isArray(ubicaciones)?ubicaciones:[]).map(u=>Number(u.bodega)).filter(n=>Number.isSafeInteger(n)&&n>0))].sort((a,b)=>a-b);
    const sp=$('supervisorAsignado'),bd=$('bodegaAsignada');
    sp.replaceChildren();
    bd.replaceChildren(new Option('Sin asignar',''));
    supervisores.forEach(p=>sp.add(new Option(`${p.nombre} (${p.rut})`,String(p.id))));
    renderSupervisores();
    bodegas.forEach(n=>bd.add(new Option(`Bodega ${n}`,String(n))));
  } catch(e) {mensaje('No se pudieron cargar las asignaciones: '+e.message)}
}
async function cargar(){try{proyectos=await api('/api/proyectos');dibujar()}catch(e){mensaje(e.message);for(const id of ['proyectosTotal','proyectosActivos','proyectosAsignados','proyectosSinAsignar']){const el=$(id);if(el)el.textContent='—'}}}
function dibujar(){actualizarIndicadores();const q=$('buscar').value.trim().toLowerCase(),lista=$('lista');lista.replaceChildren();const visibles=proyectos.filter(p=>[p.codigo,p.nombre,p.cliente,p.responsable].some(v=>String(v||'').toLowerCase().includes(q)));for(const p of visibles){const tr=document.createElement('tr');for(const val of [p.codigo,p.nombre,p.cliente,p.estado,p.bodega_numero?`Bodega ${p.bodega_numero}`:"Sin asignar"]){const td=document.createElement('td');td.textContent=val||'—';tr.append(td)}const td=document.createElement('td'),btn=document.createElement('button');btn.textContent='Editar';btn.type='button';btn.onclick=()=>editar(p.id);td.append(btn);tr.append(td);lista.append(tr)}$('conteo').textContent=visibles.length+' proyecto(s)';}
function actualizarIndicadores(){
  const total=proyectos.length;
  const activos=proyectos.filter(p=>String(p.estado||'').toUpperCase()==='ACTIVO').length;
  const asignados=proyectos.filter(p=>Number(p.bodega_numero)>0).length;
  for(const [id,valor] of [['proyectosTotal',total],['proyectosActivos',activos],['proyectosAsignados',asignados],['proyectosSinAsignar',total-asignados]]){
    const elemento=$(id);if(elemento)elemento.textContent=String(valor);
  }
}
function limpiar(){$('form').reset();$('buscarSupervisor').value='';renderSupervisores();editando=null;$('titulo').textContent='Nuevo proyecto';$('guardar').textContent='Guardar proyecto';mensaje('')}
function editar(id){const p=proyectos.find(x=>x.id===id);if(!p)return;editando=id;for(const k of ['codigo','nombre','cliente','responsable','descripcion','estado'])$(k).value=p[k]||'';for(const o of $('supervisorAsignado').options)o.selected=(p.supervisores_ids||[]).includes(Number(o.value));renderSupervisores();$('bodegaAsignada').value=String(p.bodega_numero||'');$('titulo').textContent='Editar proyecto';$('guardar').textContent='Guardar cambios';mensaje('');window.scrollTo({top:0,behavior:'smooth'})}
$('buscar').addEventListener('input',dibujar);$('cancelar').addEventListener('click',limpiar);
$('form').addEventListener('submit',async e=>{e.preventDefault();const datos=Object.fromEntries(['codigo','nombre','cliente','responsable','descripcion','estado'].map(k=>[k,$(k).value.trim()]));const id=editando;try{const ids=Array.from($('supervisorAsignado').selectedOptions,o=>Number(o.value)),bodega=$('bodegaAsignada').value;if(ids.length&&!bodega)throw Error('Selecciona una bodega para el proyecto');const guardado=await api(id?'/api/proyectos/'+id:'/api/proyectos',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(datos)});const proyectoId=id||guardado.id;if(bodega){await api('/api/proyectos/'+proyectoId+'/bodega',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({bodegaNumero:Number(bodega)})})}await api('/api/proyectos/'+proyectoId+'/supervisores',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({supervisorPersonalIds:ids})});limpiar();await cargar();mensaje(id?'Proyecto actualizado':'Proyecto creado',true)}catch(err){mensaje(err.message)}});Promise.all([cargarAsignaciones(),cargar()]);