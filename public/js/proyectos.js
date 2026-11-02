const $=id=>document.getElementById(id);let proyectos=[],editando=null,supervisores=[],bodegas=[];
function mensaje(texto,ok=false){$('mensaje').textContent=texto;$('mensaje').className=ok?'proyectos-ok':'proyectos-error'}
async function api(url,opts){const r=await fetch(url,opts);let data;try{data=await r.json()}catch{throw Error('Respuesta inválida del servidor')}if(!r.ok)throw Error(data.error||'Error en servidor');return data}
async function cargarAsignaciones(){
  try {
    const [personas, ubicaciones]=await Promise.all([api('/api/personal'),api('/api/ubicaciones')]);
    supervisores=(Array.isArray(personas)?personas:[]).filter(p=>String(p.cargo).toUpperCase()==='SUPERVISOR' && String(p.estado).toUpperCase()==='ACTIVO');
    bodegas=[...new Set((Array.isArray(ubicaciones)?ubicaciones:[]).map(u=>Number(u.bodega)).filter(n=>Number.isSafeInteger(n)&&n>0))].sort((a,b)=>a-b);
    const sp=$('supervisorAsignado'),bd=$('bodegaAsignada');
    sp.replaceChildren(new Option('Sin asignar',''));
    bd.replaceChildren(new Option('Sin asignar',''));
    supervisores.forEach(p=>sp.add(new Option(`${p.nombre} (${p.rut})`,String(p.id))));
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
function limpiar(){$('form').reset();editando=null;$('titulo').textContent='Nuevo proyecto';$('guardar').textContent='Guardar proyecto';mensaje('')}
function editar(id){const p=proyectos.find(x=>x.id===id);if(!p)return;editando=id;for(const k of ['codigo','nombre','cliente','responsable','descripcion','estado'])$(k).value=p[k]||'';$('supervisorAsignado').value=String(p.supervisor_personal_id||'');$('bodegaAsignada').value=String(p.bodega_numero||'');$('titulo').textContent='Editar proyecto';$('guardar').textContent='Guardar cambios';mensaje('');window.scrollTo({top:0,behavior:'smooth'})}
$('buscar').addEventListener('input',dibujar);$('cancelar').addEventListener('click',limpiar);
$('form').addEventListener('submit',async e=>{e.preventDefault();const datos=Object.fromEntries(['codigo','nombre','cliente','responsable','descripcion','estado'].map(k=>[k,$(k).value.trim()]));const id=editando;try{const supervisor=$('supervisorAsignado').value,bodega=$('bodegaAsignada').value;if(Boolean(supervisor)!==Boolean(bodega))throw Error('Selecciona supervisor y bodega juntos');const guardado=await api(id?'/api/proyectos/'+id:'/api/proyectos',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(datos)});const proyectoId=id||guardado.id;if(supervisor&&bodega){await api('/api/proyectos/'+proyectoId+'/asignacion',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({supervisorPersonalId:Number(supervisor),bodegaNumero:Number(bodega)})})}else if(id){await api('/api/proyectos/'+proyectoId+'/asignacion',{method:'DELETE'})}limpiar();await cargar();mensaje(id?'Proyecto actualizado':'Proyecto creado',true)}catch(err){mensaje(err.message)}});Promise.all([cargarAsignaciones(),cargar()]);