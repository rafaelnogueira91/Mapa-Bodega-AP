"use strict";
// Un solo formulario de creación: estructura con vista visual dinámica.
const panelEstructura=document.getElementById('panelEstructura');
if(panelEstructura)panelEstructura.hidden=false;
const campo=id=>document.getElementById(id);
function actualizarDibujoRack(){
 const destino=campo('dibujoRack');if(!destino)return;
 const m=Number(campo('modulos')?.value),n=Number(campo('niveles')?.value),p=Number(campo('posiciones')?.value);
 destino.replaceChildren();
 if(![m,n,p].every(v=>Number.isInteger(v)&&v>0)||m*n*p>500){destino.textContent='Ingresa cantidades válidas (máximo 500 posiciones).';return;}
 // No renderizar miles de nodos cuando la vista previa es demasiado grande.
 if(m*n*p>120){destino.textContent=`${m*n*p} posiciones. La vista detallada se muestra hasta 120.`;return;}
 for(let nivel=n;nivel>=1;nivel--){
  const fila=document.createElement('div');fila.className='dibujo-nivel';fila.style.gridTemplateColumns=`36px repeat(${m},minmax(48px,1fr))`;
  const titulo=document.createElement('strong');titulo.textContent='N'+nivel;fila.append(titulo);
  for(let modulo=1;modulo<=m;modulo++){
   const columna=document.createElement('div');columna.className='dibujo-modulo';columna.style.gridTemplateColumns=`repeat(${p},minmax(26px,1fr))`;
   for(let posicion=1;posicion<=p;posicion++){
    const celda=document.createElement('span');celda.className='dibujo-posicion';celda.textContent=posicion;celda.title=`Nivel ${nivel}, módulo ${modulo}, posición ${posicion}`;columna.append(celda);
   }fila.append(columna);
  }destino.append(fila);
 }
 const resumen=document.createElement('div');resumen.className='dibujo-resumen';resumen.textContent=`${m} módulos · ${n} niveles · ${p} posiciones por módulo · Total: ${m*n*p}`;destino.append(resumen);
}
for(const id of ['modulos','niveles','posiciones','tipo'])campo(id)?.addEventListener('input',actualizarDibujoRack);
actualizarDibujoRack();
document.addEventListener('bodega:actualizada',async event=>{
 const bodega=Number(event.detail?.bodega);
 if(typeof cargarBodegas==='function')await cargarBodegas();
 if(typeof cargarUbicaciones==='function')await cargarUbicaciones();
 if(Number.isInteger(bodega)&&bodega>0&&typeof mostrarBodega==='function')await mostrarBodega(bodega);
});
