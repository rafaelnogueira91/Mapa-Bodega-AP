"use strict";
// Lector de QR de ubicaciones: reutiliza la consulta de productos ya existente.
(() => {
 const boton=document.getElementById('escanearQrUbicacion');
 const modal=document.getElementById('modalQrUbicacion');
 const cerrar=document.getElementById('cerrarQrUbicacion');
 const form=document.getElementById('formQrUbicacion');
 const campo=document.getElementById('codigoQrUbicacion');
 const estado=document.getElementById('estadoQrUbicacion');
 if(!boton||!modal||!form)return;
 let lector=null;
 let iniciando=false;
 let procesando=false;
 const mensaje=texto=>{estado.textContent=texto;};
 async function detener(){
   if(!lector)return;
   const actual=lector;lector=null;
   try{if(actual.isScanning)await actual.stop();actual.clear();}
   catch(error){console.warn('No se pudo detener el lector QR',error);}
 }
 async function ocultar(){modal.style.display='none';await detener();}
 async function consultar(valor){
   if(procesando)return;
   const codigo=String(valor||'').trim();
   if(!codigo){mensaje('Ingresa un código válido.');return;}
   procesando=true;
   mensaje('Buscando ubicación...');
   try{
     // Consultar el listado real: no crear ni modificar ubicaciones.
     const res=await fetch('/api/ubicaciones');
     if(!res.ok)throw new Error('No se pudo consultar el listado');
     const ubicaciones=await res.json();
     const encontrada=Array.isArray(ubicaciones)&&ubicaciones.find(
       item=>String(item.codigo||'').toLowerCase()===codigo.toLowerCase()
     );
     if(!encontrada){mensaje('La ubicación no está registrada. Verifica el código.');return;}
     await ocultar();
     // Actualizar filtros y abrir el detalle por el mismo botón de la vista.
     const buscador=document.getElementById('filtroUbicacion');
     const bodega=document.getElementById('filtroBodega');
     const filtroEstado=document.getElementById('filtroEstado');
     if(bodega)bodega.value='';
     if(filtroEstado)filtroEstado.value='';
     if(buscador){
       buscador.value=String(encontrada.codigo);
       buscador.dispatchEvent(new Event('input',{bubbles:true}));
     }
     const tarjetas=[...document.querySelectorAll('#listaUbicaciones .ver-contenido-ubicacion')];
     const abrir=tarjetas.find(x=>x.dataset.codigo===String(encontrada.codigo));
     if(abrir){
       abrir.scrollIntoView({behavior:'smooth',block:'center'});
       abrir.click();
     }else{
       mensaje('Ubicación encontrada. Actualiza el listado para ver su contenido.');
       modal.style.display='flex';
     }
   }catch(error){console.error('Consulta QR ubicación:',error);mensaje('No se pudo consultar la ubicación. Revisa la conexión.');}
   finally{procesando=false;}
 }
 boton.addEventListener('click',async()=>{
   modal.style.display='flex';campo.value='';mensaje('');
   campo.focus();
   if(typeof Html5Qrcode==='undefined'){
     mensaje('Cámara no disponible. Puedes ingresar el código manualmente.');
     return;
   }
   if(iniciando||lector)return;
   iniciando=true;
   try{
     lector=new Html5Qrcode('lectorQrUbicacion');
     await lector.start({facingMode:'environment'},{fps:10,qrbox:220},
       texto=>{if(!procesando){campo.value=texto;void consultar(texto);}},
       ()=>{});
     mensaje('Apunta la cámara al QR de la ubicación.');
   }catch(error){
     console.warn('Cámara QR no disponible:',error);
     await detener();
     mensaje('No se pudo abrir la cámara. Ingresa el código manualmente.');
   }finally{iniciando=false;}
 });
 form.addEventListener('submit',event=>{event.preventDefault();void consultar(campo.value);});
 cerrar.addEventListener('click',()=>{void ocultar();});
 modal.addEventListener('click',event=>{if(event.target===modal)void ocultar();});
})();
