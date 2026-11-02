// ===============================
// ELEMENTOS
// ===============================

const formUbicacion =
    document.getElementById("formUbicacion");

const listaUbicaciones =
    document.getElementById("listaUbicaciones");


// ===============================
// ENVIAR FORMULARIO
// ===============================

formUbicacion.addEventListener(
    "submit",
    async function (evento) {

        evento.preventDefault();

        const bodega =
            Number(
                document.getElementById("bodega").value
            );

        const pasillo =
            Number(
                document.getElementById("pasillo").value
            );

        const cantidadUbicaciones =
            Number(
                document.getElementById(
                    "cantidadUbicaciones"
                ).value
            );

        if (
            !bodega ||
            !pasillo ||
            !cantidadUbicaciones ||
            cantidadUbicaciones < 1 ||
            cantidadUbicaciones > 500 ||
            !Number.isSafeInteger(bodega) ||
            !Number.isSafeInteger(pasillo) ||
            !Number.isSafeInteger(cantidadUbicaciones) ||
            bodega < 1 || pasillo < 1
        ) {

            alert(
                "Debes completar todos los campos correctamente."
            );

            return;
        }

        try {

            const respuesta = await fetch(
                "/api/ubicaciones/lote",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        bodega,
                        pasillo,
                        cantidadUbicaciones
                    })
                }
            );

            const resultado =
                await respuesta.json();

            if (!respuesta.ok) {

                alert(
                    resultado.mensaje ||
                    "No se pudieron crear las ubicaciones."
                );

                return;
            }

            alert(
                resultado.mensaje
            );

            formUbicacion.reset();

            document.getElementById(
                "cantidadUbicaciones"
            ).value = 1;

            await cargarUbicaciones();
            document.dispatchEvent(new CustomEvent("bodega:actualizada",{detail:{bodega}}));

        } catch (error) {

            console.error(
                "Error al crear ubicaciones:",
                error
            );

            alert(
                "Error al crear las ubicaciones."
            );

        }

    }
);


// Filtros locales de consulta; no alteran stock ni ubicaciones en la base.
let todasLasUbicaciones = [];
const filtroUbicacion = document.getElementById('filtroUbicacion');
const filtroBodega = document.getElementById('filtroBodega');
const filtroEstado = document.getElementById('filtroEstado');
const contadorUbicaciones = document.getElementById('contadorUbicaciones');
function actualizarOpcionesFiltro(){
 const bodegaElegida = filtroBodega?.value || '';
 const estadoElegido = filtroEstado?.value || '';
 const bodegas = [...new Set(todasLasUbicaciones.map(x=>String(x.bodega??'')))].filter(Boolean).sort((a,b)=>Number(a)-Number(b));
 const estados = [...new Set(todasLasUbicaciones.map(x=>String(x.estado??'')))].filter(Boolean).sort();
 function llenar(select,items,actual,todos){
  if(!select)return;
  select.replaceChildren(new Option(todos,''));
  for(const item of items)select.add(new Option(item,item));
  select.value=items.includes(actual)?actual:'';
 }
 llenar(filtroBodega,bodegas,bodegaElegida,'Todas');
 llenar(filtroEstado,estados,estadoElegido,'Todos');
}
function aplicarFiltrosUbicaciones(){
 const texto=(filtroUbicacion?.value||'').trim().toLocaleLowerCase('es');
 const bodega=filtroBodega?.value||'';
 const estado=filtroEstado?.value||'';
 const filtradas=todasLasUbicaciones.filter(item=>{
  const campos=[item.codigo,item.pasillo,item.ubicacion].map(v=>String(v??'').toLocaleLowerCase('es'));
  return (!texto||campos.some(v=>v.includes(texto)))&&(!bodega||String(item.bodega)===bodega)&&(!estado||String(item.estado)===estado);
 });
 window.bodegaUbicacionesFiltradas=filtradas.map(x=>({codigo:String(x.codigo??''),bodega:String(x.bodega??''),pasillo:String(x.pasillo??''),estado:String(x.estado??'')}));
 mostrarUbicaciones(filtradas);
 if(contadorUbicaciones)contadorUbicaciones.textContent=`Mostrando ${filtradas.length} de ${todasLasUbicaciones.length} ubicaciones`;
}
for(const control of [filtroUbicacion,filtroBodega,filtroEstado]){
 control?.addEventListener(control===filtroUbicacion?'input':'change',aplicarFiltrosUbicaciones);
}
document.getElementById('limpiarFiltrosUbicacion')?.addEventListener('click',()=>{
 if(filtroUbicacion)filtroUbicacion.value='';
 if(filtroBodega)filtroBodega.value='';
 if(filtroEstado)filtroEstado.value='';
 aplicarFiltrosUbicaciones();
});

// ===============================
// CARGAR UBICACIONES
// ===============================

async function cargarUbicaciones() {

    listaUbicaciones.innerHTML =
        "<p>Cargando ubicaciones...</p>";

    try {

        const respuesta = await fetch(
            "/api/ubicaciones"
        );

        const datos =
            await respuesta.json();

        if (!respuesta.ok) {

            listaUbicaciones.innerHTML = `
                <p>
                    No se pudieron cargar las ubicaciones.
                </p>
            `;

            return;
        }

        todasLasUbicaciones = Array.isArray(datos) ? datos : [];
        actualizarOpcionesFiltro();
        aplicarFiltrosUbicaciones();

    } catch (error) {

        console.error(
            "Error al cargar ubicaciones:",
            error
        );

        listaUbicaciones.innerHTML = `
            <p>
                Error al cargar las ubicaciones.
            </p>
        `;

    }

}


// ===============================
// MOSTRAR UBICACIONES
// ===============================

function mostrarUbicaciones(
    ubicaciones
) {

    if (
        !ubicaciones ||
        ubicaciones.length === 0
    ) {

        listaUbicaciones.innerHTML = `
            <p>
                No hay ubicaciones creadas.
            </p>
        `;

        return;
    }

    const escaparHtml = valor => String(valor ?? '').replace(/[&<>"']/g, caracter => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[caracter]));
    let contenido = "";

    ubicaciones.forEach(
        function (item) {

            contenido += `
                <div class="tarjeta">

                    <h3>
                        ${escaparHtml(item.codigo)}
                    </h3>

                    <p>
                        Bodega:
                        ${escaparHtml(item.bodega)}
                    </p>

                    <p>
                        Pasillo:
                        ${escaparHtml(item.pasillo)}
                    </p>

                    <p>
                        Ubicación:
                        ${escaparHtml(item.ubicacion)}
                    </p>

                    <p>
                        Estado:
                        ${escaparHtml(item.estado)}
                    </p>
                    <button type="button" class="ver-contenido-ubicacion"
                        data-codigo="${escaparHtml(item.codigo)}"
                        aria-label="Ver productos de ${escaparHtml(item.codigo)}">
                        Ver productos almacenados
                    </button>

                </div>
            `;

        }
    );

    listaUbicaciones.innerHTML =
        contenido;

}


// ===============================
// INICIAR
// ===============================

cargarUbicaciones();
// Consulta desde el listado usando la misma API del mapa.
// No modifica existencias ni asignaciones.
listaUbicaciones.addEventListener('click', async event => {
    const boton=event.target.closest('.ver-contenido-ubicacion');
    if(!boton || !listaUbicaciones.contains(boton)) return;
    const codigo=boton.dataset.codigo;
    const modal=document.getElementById('modalUbicacion');
    const titulo=document.getElementById('tituloUbicacion');
    const detalle=modal?.querySelector('.detalle-producto');
    if(!modal || !titulo || !detalle) return;
    titulo.textContent=codigo;
    modal.style.display='flex';
    detalle.replaceChildren();
    const mensaje=document.createElement('p');
    mensaje.textContent='Consultando productos almacenados...';
    detalle.appendChild(mensaje);
    boton.disabled=true;
    try {
        const respuesta=await fetch('/api/ubicaciones/'+encodeURIComponent(codigo));
        if(!respuesta.ok) throw new Error('No se pudo consultar esta ubicación');
        const datos=await respuesta.json();
        const productos=Array.isArray(datos.productos)?datos.productos:[];
        detalle.replaceChildren();
        const encabezado=document.createElement('p');
        const strong=document.createElement('strong');
        strong.textContent='Productos almacenados: '+productos.length;
        encabezado.appendChild(strong);
        detalle.appendChild(encabezado);
        if(!productos.length){
            const vacio=document.createElement('p');
            vacio.textContent='Esta ubicación no tiene productos asignados.';
            detalle.appendChild(vacio);
        }
        for(const producto of productos){
            const tarjeta=document.createElement('div');
            tarjeta.className='contenido-ubicacion-producto';
            const tituloProducto=document.createElement('strong');
            tituloProducto.textContent=String(producto.nombre||producto.codigo||'Producto');
            tarjeta.appendChild(tituloProducto);
            const datosProducto=[
                ['Código',producto.codigo],
                ['Tipo de control',producto.tipoControl],
                ['Número de serie',producto.numeroSerie],
                ['Cantidad',producto.cantidad]
            ];
            for(const [etiqueta,valor] of datosProducto){
                if(valor===undefined || valor===null || valor==='')continue;
                const parrafo=document.createElement('p');
                parrafo.textContent=etiqueta+': '+valor;
                tarjeta.appendChild(parrafo);
            }
            detalle.appendChild(tarjeta);
        }
    }catch(error){
        detalle.replaceChildren();
        const aviso=document.createElement('p');
        aviso.setAttribute('role','alert');
        aviso.textContent='No fue posible consultar los productos. Intenta nuevamente.';
        detalle.appendChild(aviso);
        console.error('Consulta de ubicación:',error);
    }finally{
        boton.disabled=false;
    }
});
