// ===============================
// ELEMENTOS
// ===============================

const formMovimiento =
    document.getElementById("formMovimiento");

const tipoMovimiento =
    document.getElementById("tipoMovimiento");

const campoEntregadoA =
    document.getElementById("campoEntregadoA");

const personalMovimiento =
    document.getElementById("personalMovimiento");

const codigoProducto =
    document.getElementById("codigoProducto");

const ubicacionMovimiento =
    document.getElementById("ubicacionMovimiento");

const campoUbicacionDestino =
    document.getElementById(
        "campoUbicacionDestino"
    );

const ubicacionDestino =
    document.getElementById(
        "ubicacionDestino"
    );    

const campoCantidadMovimiento =
    document.getElementById("campoCantidadMovimiento");

const cantidadMovimiento =
    document.getElementById("cantidadMovimiento");

const campoSerieMovimiento =
    document.getElementById("campoSerieMovimiento");

const numeroSerieMovimiento =
    document.getElementById("numeroSerieMovimiento");

const listaMovimientos =
    document.getElementById("listaMovimientos");

// ===============================
// ESCÁNER
// ===============================

const botonEscanearMovimiento =
    document.getElementById(
        "botonEscanearMovimiento"
    );
const botonEscanearSerie =
    document.getElementById(
        "botonEscanearSerie"
    );    

const modalEscanerMovimiento =
    document.getElementById(
        "modalEscanerMovimiento"
    );

const cerrarEscanerMovimiento =
    document.getElementById(
        "cerrarEscanerMovimiento"
    );

let lectorMovimiento = null;

// ===============================
// ABRIR ESCÁNER
// ===============================

async function abrirEscanerMovimiento() {

    modalEscanerMovimiento.style.display =
        "flex";

    lectorMovimiento =
        new Html5Qrcode(
            "lectorMovimiento"
        );

    try {

        await lectorMovimiento.start(
            {
                facingMode:
                    "environment"
            },
            {
                fps: 10,
                qrbox: {
                    width: 250,
                    height: 150
                }
            },
            async function (
                codigoLeido
            ) {

                codigoProducto.value =
                    codigoLeido;

                await buscarProductoMovimiento();

                cerrarEscaner();

            },
            function () {
                // Ignorar lecturas fallidas
            }
        );

    } catch (error) {

        console.error(
            "Error al abrir la cámara:",
            error
        );

        alert(
            "No se pudo abrir la cámara."
        );

        cerrarEscaner();

    }

}

// ===============================
// ABRIR ESCÁNER DE SERIE
// ===============================

async function abrirEscanerSerie() {

    modalEscanerMovimiento.style.display =
        "flex";

    lectorMovimiento =
        new Html5Qrcode(
            "lectorMovimiento"
        );

    try {

        await lectorMovimiento.start(
            {
                facingMode:
                    "environment"
            },
            {
                fps: 10,
                qrbox: {
                    width: 250,
                    height: 150
                }
            },

            async function (
                serieLeida
            ) {

                serieLeida =
                    serieLeida.trim();

                // ===============================
                // SALIDA
                // ===============================

                if (
                    tipoMovimiento.value ===
                    "SALIDA"
                ) {

                    const opciones =
                        Array.from(
                            numeroSerieMovimiento.options
                        );

                    const serieEncontrada =
                        opciones.find(
                            function (opcion) {

                                return (
                                    opcion.value ===
                                    serieLeida
                                );

                            }
                        );

                    if (!serieEncontrada) {

                        await cerrarEscaner();

                        alert(
                            "La serie escaneada no está disponible para este producto."
                        );

                        return;

                    }

                    numeroSerieMovimiento.value =
                        serieLeida;

                    numeroSerieMovimiento.dispatchEvent(
                        new Event("change")
                    );

                }


                // ===============================
                // ENTRADA
                // ===============================

                if (
                    tipoMovimiento.value ===
                    "ENTRADA"
                ) {

                    let opcionSerie =
                        Array.from(
                            numeroSerieMovimiento.options
                        ).find(
                            function (opcion) {

                                return (
                                    opcion.value ===
                                    serieLeida
                                );

                            }
                        );

                    if (!opcionSerie) {

                        opcionSerie =
                            document.createElement(
                                "option"
                            );

                        opcionSerie.value =
                            serieLeida;

                        opcionSerie.textContent =
                            serieLeida;

                        numeroSerieMovimiento.appendChild(
                            opcionSerie
                        );

                    }

                    numeroSerieMovimiento.value =
                        serieLeida;

                }

                await cerrarEscaner();

            },

            function () {

                // Ignorar lecturas fallidas

            }
        );

    } catch (error) {

        console.error(
            "Error al abrir el escáner de serie:",
            error
        );

        alert(
            "No se pudo abrir la cámara."
        );

        await cerrarEscaner();

    }

}

// ===============================
// CERRAR ESCÁNER
// ===============================

async function cerrarEscaner() {

    if (lectorMovimiento) {

        try {

            await lectorMovimiento.stop();

        } catch (error) {

            console.log(
                "El escáner ya estaba detenido."
            );

        }

        try {

            lectorMovimiento.clear();

        } catch (error) {

            console.log(
                "No fue necesario limpiar el lector."
            );

        }

        lectorMovimiento = null;

    }

    modalEscanerMovimiento.style.display =
        "none";

}


// ===============================
// EVENTOS DEL ESCÁNER
// ===============================

botonEscanearMovimiento.addEventListener(
    "click",
    abrirEscanerMovimiento
);

botonEscanearSerie.addEventListener(
    "click",
    abrirEscanerSerie
);

cerrarEscanerMovimiento.addEventListener(
    "click",
    cerrarEscaner
);

// ===============================
// MOSTRAR DESTINO EN TRASLADO
// ===============================

tipoMovimiento.addEventListener(
    "change",
    function () {

                // Mostrar "Entregado a"
        // solamente en SALIDA
        if (
            tipoMovimiento.value ===
            "SALIDA"
        ) {
            campoEntregadoA.style.display =
                "flex";

            personalMovimiento.required =
                true;

        } else {
            campoEntregadoA.style.display =
                "none";

            personalMovimiento.required =
                false;

            personalMovimiento.value =
                "";
        }

        if (
            tipoMovimiento.value ===
            "TRASLADO"
        ) {

            campoUbicacionDestino.style.display =
                "flex";

            ubicacionDestino.required =
                true;

        } else {

            campoUbicacionDestino.style.display =
                "none";

            ubicacionDestino.required =
                false;

            ubicacionDestino.value =
                "";

        }

    }
);


// ===============================
// OCULTAR CAMPOS AL INICIAR
// ===============================

campoCantidadMovimiento.style.display =
    "none";

campoSerieMovimiento.style.display =
    "none";


// ===============================
// CARGAR UBICACIONES
// ===============================

async function cargarUbicaciones() {

    ubicacionMovimiento.innerHTML = `
        <option value="">
            Cargando ubicaciones...
        </option>
    `;

    ubicacionDestino.innerHTML = `
        <option value="">
            Cargando ubicaciones...
        </option>
    `;

    try {

        const respuesta = await fetch(
            "/api/ubicaciones"
        );

        const ubicaciones =
            await respuesta.json();

        if (!respuesta.ok) {

            ubicacionMovimiento.innerHTML = `
                <option value="">
                    No se pudieron cargar las ubicaciones
                </option>
            `;

            ubicacionDestino.innerHTML = `
                <option value="">
                    No se pudieron cargar las ubicaciones
                </option>
            `;

            return;
        }

        ubicacionMovimiento.innerHTML = `
            <option value="">
                Selecciona una ubicación
            </option>
        `;

        ubicacionDestino.innerHTML = `
            <option value="">
                Selecciona ubicación de destino
            </option>
        `;

        ubicaciones.forEach(
            function (item) {

                const opcion =
                    document.createElement(
                        "option"
                    );

                opcion.value =
                    item.codigo;

                opcion.textContent =
                    `${item.codigo} — ${item.estado}`;

                ubicacionMovimiento.appendChild(
                    opcion
                );


                const opcionDestino =
                    document.createElement(
                        "option"
                    );

                opcionDestino.value =
                    item.codigo;

                opcionDestino.textContent =
                    `${item.codigo} — ${item.estado}`;

                ubicacionDestino.appendChild(
                    opcionDestino
                );

            }
        );

    } catch (error) {

        console.error(
            "Error al cargar ubicaciones:",
            error
        );

        ubicacionMovimiento.innerHTML = `
            <option value="">
                Error al cargar ubicaciones
            </option>
        `;

        ubicacionDestino.innerHTML = `
            <option value="">
                Error al cargar ubicaciones
            </option>
        `;

    }

}


// ===============================
// BUSCAR PRODUCTO
// ===============================

async function buscarProductoMovimiento() {

    const codigo =
        codigoProducto.value.trim();

    if (!codigo) {

        campoCantidadMovimiento.style.display =
            "none";

        campoSerieMovimiento.style.display =
            "none";

        return;
    }

    try {

        const respuesta = await fetch(
            `/api/buscar/${encodeURIComponent(codigo)}`
        );

        const datos =
            await respuesta.json();

        if (
            !respuesta.ok ||
            !datos.encontrado
        ) {

            campoCantidadMovimiento.style.display =
                "none";

            campoSerieMovimiento.style.display =
                "none";

            return;
        }

        if (
            datos.tipoBusqueda ===
            "CANTIDAD"
        ) {

            campoCantidadMovimiento.style.display =
                "flex";

            campoSerieMovimiento.style.display =
                "none";

            cantidadMovimiento.required = true;
            numeroSerieMovimiento.required = false;

            numeroSerieMovimiento.value = "";

// Si es una SALIDA,
// mostrar solo ubicaciones con stock
if (
    tipoMovimiento.value ===
        "SALIDA" ||
    tipoMovimiento.value ===
        "TRASLADO"
) {


    ubicacionMovimiento.innerHTML = `
    <option value="">
        Selecciona una ubicación
    </option>
`;

    

    const ubicacionesProducto =
        datos.producto.ubicaciones || [];

    if (
        ubicacionesProducto.length === 0
    ) {

        ubicacionMovimiento.innerHTML = `
            <option value="">
                Producto sin stock
            </option>
        `;

        return;

    }

    ubicacionesProducto.forEach(
        function (item) {

            const opcion =
                document.createElement(
                    "option"
                );

            opcion.value =
                item.ubicacion;

            opcion.textContent =
                `${item.ubicacion} — Stock: ${item.cantidad}`;

            ubicacionMovimiento.appendChild(
                opcion
            );

        }
    );

}

        } else {

            campoCantidadMovimiento.style.display =
                "none";

            campoSerieMovimiento.style.display =
                "flex";

            cantidadMovimiento.required = false;
            numeroSerieMovimiento.required = true;

            cantidadMovimiento.value = "";

// Si es una SALIDA o TRASLADO,
// cargar las series disponibles

if (
    tipoMovimiento.value ===
        "SALIDA" ||
    tipoMovimiento.value ===
        "TRASLADO"
) {

    ubicacionMovimiento.innerHTML = `
        <option value="">
            Se asignará según la serie
        </option>
    `;

    numeroSerieMovimiento.innerHTML = `
        <option value="">
            Selecciona una serie
        </option>
    `;

    const seriesProducto =
        datos.producto.series || [];

    seriesProducto.forEach(
        function (item) {

            // Solo mostrar series
            // que estén actualmente
            // en una ubicación
            if (!item.ubicacion) {
                return;
            }

            const opcion =
                document.createElement(
                    "option"
                );

            opcion.value =
                item.numero_serie;

            opcion.textContent =
                `${item.numero_serie} — ${item.ubicacion}`;

            opcion.dataset.ubicacion =
                item.ubicacion;

            numeroSerieMovimiento.appendChild(
                opcion
            );

        }
    );

    numeroSerieMovimiento.value = "";

}


        }

    } catch (error) {

        console.error(
            "Error al buscar producto:",
            error
        );

    }

}

// ===============================
// SELECCIONAR UBICACIÓN SEGÚN SERIE
// ===============================

numeroSerieMovimiento.addEventListener(
    "change",
    function () {

        const opcionSeleccionada =
            numeroSerieMovimiento.options[
                numeroSerieMovimiento.selectedIndex
            ];

        const ubicacionSerie =
            opcionSeleccionada.dataset.ubicacion;

        if (!ubicacionSerie) {
            return;
        }

        // Buscar si la ubicación ya existe
        // dentro del selector
        let opcionUbicacion =
            Array.from(
                ubicacionMovimiento.options
            ).find(
                function (opcion) {
                    return (
                        opcion.value ===
                        ubicacionSerie
                    );
                }
            );

        // Si no existe, agregarla
        if (!opcionUbicacion) {

            opcionUbicacion =
                document.createElement(
                    "option"
                );

            opcionUbicacion.value =
                ubicacionSerie;

            opcionUbicacion.textContent =
                ubicacionSerie;

            ubicacionMovimiento.appendChild(
                opcionUbicacion
            );
        }

        // Seleccionar automáticamente
        // la ubicación de la serie
        ubicacionMovimiento.value =
            ubicacionSerie;
    }
);


// ===============================
// EVENTO AL SALIR DEL CÓDIGO
// ===============================

codigoProducto.addEventListener(
    "blur",
    buscarProductoMovimiento
);


// Confirmación accesible: solo presenta datos, no ejecuta operaciones.
function confirmarMovimientoMovil(filas) {
    return new Promise(resolve => {
        const fondo = document.createElement('div');
        fondo.className = 'confirmacion-movimiento-fondo';
        const panel = document.createElement('section');
        panel.className = 'confirmacion-movimiento-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        const titulo = document.createElement('h2');
        titulo.id = 'titulo-confirmacion-movimiento';
        titulo.textContent = 'Revisar movimiento';
        panel.setAttribute('aria-labelledby', titulo.id);
        const descripcion = document.createElement('p');
        descripcion.textContent = 'Comprueba los datos antes de registrar el movimiento.';
        const detalle = document.createElement('dl');
        for (const [etiqueta, valor] of filas) {
            const dt = document.createElement('dt');
            dt.textContent = etiqueta;
            const dd = document.createElement('dd');
            dd.textContent = valor;
            detalle.append(dt, dd);
        }
        const acciones = document.createElement('div');
        acciones.className = 'confirmacion-movimiento-acciones';
        const cancelar = document.createElement('button');
        cancelar.type = 'button';
        cancelar.textContent = 'Volver a editar';
        const aceptar = document.createElement('button');
        aceptar.type = 'button';
        aceptar.className = 'confirmacion-movimiento-aceptar';
        aceptar.textContent = 'Confirmar registro';
        acciones.append(cancelar, aceptar);
        panel.append(titulo, descripcion, detalle, acciones);
        fondo.appendChild(panel);
        const focoAnterior = document.activeElement;
        const terminar = valor => {
            document.removeEventListener('keydown', teclado);
            fondo.remove();
            if (focoAnterior?.isConnected) focoAnterior.focus();
            resolve(valor);
        };
        const teclado = evento => {
            if (evento.key === 'Escape') { evento.preventDefault(); terminar(false); }
            if (evento.key === 'Tab') {
                const elementos = [cancelar, aceptar];
                const actual = elementos.indexOf(document.activeElement);
                if (evento.shiftKey && actual <= 0) { evento.preventDefault(); aceptar.focus(); }
                else if (!evento.shiftKey && actual === 1) { evento.preventDefault(); cancelar.focus(); }
            }
        };
        cancelar.addEventListener('click', () => terminar(false));
        aceptar.addEventListener('click', () => terminar(true));
        fondo.addEventListener('click', evento => { if (evento.target === fondo) terminar(false); });
        document.addEventListener('keydown', teclado);
        document.body.appendChild(fondo);
        cancelar.focus();
    });
}

// ===============================
// ENVIAR MOVIMIENTO
// ===============================

function mostrarResultadoMovimiento(mensaje, esError = false) {
    let aviso = document.getElementById('resultado-registro-movimiento');
    if (!aviso) {
        aviso = document.createElement('div');
        aviso.id = 'resultado-registro-movimiento';
        aviso.className = 'resultado-registro-movimiento';
        aviso.setAttribute('role', 'status');
        aviso.setAttribute('aria-live', 'polite');
        document.body.appendChild(aviso);
    }
    clearTimeout(mostrarResultadoMovimiento.temporizador);
    aviso.textContent = mensaje;
    aviso.classList.toggle('es-error', esError);
    aviso.classList.add('visible');
    mostrarResultadoMovimiento.temporizador = setTimeout(() => aviso.classList.remove('visible'), 6500);
}

let guardandoMovimiento = false;

formMovimiento.addEventListener(
    "submit",
    async function (evento) {

        evento.preventDefault();
        if (guardandoMovimiento) return;
        const tipoActual = tipoMovimiento.value;
        if (tipoActual === 'TRASLADO' &&
            (!ubicacionDestino.value || ubicacionDestino.value === ubicacionMovimiento.value)) {
            alert('Selecciona una ubicación de destino distinta del origen.');
            return;
        }
        if (!['ENTRADA', 'SALIDA', 'TRASLADO'].includes(tipoActual) ||
            !codigoProducto.value.trim() || !ubicacionMovimiento.value) {
            alert('Selecciona un tipo de movimiento, producto y ubicación válidos.');
            return;
        }
        if (tipoActual === 'SALIDA' && !personalMovimiento.value) {
            alert('Selecciona a quién se entrega el producto.');
            return;
        }
        if (campoCantidadMovimiento.style.display !== 'none') {
            const numero = Number(cantidadMovimiento.value);
            if (!Number.isSafeInteger(numero) || numero <= 0) {
                alert('La cantidad debe ser un número entero mayor que cero.');
                return;
            }
        }
        if (campoSerieMovimiento.style.display !== 'none' &&
            !numeroSerieMovimiento.value.trim()) {
            alert('Selecciona o ingresa un número de serie.');
            return;
        }
        // Confirmar los datos antes de registrar; cancelar no modifica el formulario.
        const ubicacionOrigenTexto = ubicacionMovimiento.selectedOptions[0]?.textContent.trim() || ubicacionMovimiento.value;
        const ubicacionDestinoTexto = ubicacionDestino.selectedOptions[0]?.textContent.trim() || ubicacionDestino.value;
        const personalTexto = personalMovimiento.selectedOptions[0]?.textContent.trim() || '';
        const filasConfirmacion = [
            ['Tipo', tipoActual],
            ['Producto', codigoProducto.value.trim()],
            ['Origen / ubicación', ubicacionOrigenTexto],
            ...(tipoActual === 'TRASLADO' ? [['Destino', ubicacionDestinoTexto]] : []),
            ...(tipoActual === 'SALIDA' ? [['Entregado a', personalTexto]] : []),
            ...(campoCantidadMovimiento.style.display !== 'none' ? [['Cantidad', cantidadMovimiento.value]] : []),
            ...(campoSerieMovimiento.style.display !== 'none' ? [['Serie', numeroSerieMovimiento.value.trim()]] : [])
        ];
        if (!await confirmarMovimientoMovil(filasConfirmacion)) return;
        if (guardandoMovimiento) return;

        guardandoMovimiento = true;
        const botonesEnviar = [...formMovimiento.querySelectorAll('button[type="submit"], input[type="submit"]')];
        const etiquetasOriginales = botonesEnviar.map(boton => boton.tagName === 'INPUT' ? boton.value : boton.textContent);
        botonesEnviar.forEach(boton => {
            boton.disabled = true;
            boton.setAttribute('aria-busy', 'true');
            if (boton.tagName === 'INPUT') boton.value = 'Registrando…';
            else boton.textContent = 'Registrando…';
        });

        const datos = {

            tipoMovimiento:
                tipoMovimiento.value,

            codigoProducto:
                codigoProducto.value.trim(),

            ubicacion:
                ubicacionMovimiento.value,

            ubicacionDestino:
                tipoMovimiento.value === 'TRASLADO' ? ubicacionDestino.value : null,
            
            personalId:
                tipoMovimiento.value === "SALIDA"
              ? Number(personalMovimiento.value)
              : null,    

            cantidad:
                cantidadMovimiento.value
                    ? Number(
                        cantidadMovimiento.value
                    )
                    : null,

            numeroSerie:
                numeroSerieMovimiento.value.trim() ||
                null

        };

        try {

            const respuesta = await fetch(
                "/api/movimientos",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify(
                        datos
                    )
                }
            );

            const resultado =
                await respuesta.json();

            if (!respuesta.ok) {

                mostrarResultadoMovimiento(resultado.mensaje || "No se pudo registrar el movimiento.", true);

                return;
            }

            mostrarResultadoMovimiento(resultado.mensaje || 'Movimiento registrado correctamente.');

            formMovimiento.reset();

            campoCantidadMovimiento.style.display =
                "none";

            campoSerieMovimiento.style.display =
                "none";

            cantidadMovimiento.required =
                false;

            numeroSerieMovimiento.required =
                false;

            cargarUbicaciones();

            cargarMovimientos();

        } catch (error) {

            console.error(
                "Error al registrar movimiento:",
                error
            );

            mostrarResultadoMovimiento('Error de conexión al registrar el movimiento. Revisa el historial antes de volver a intentarlo.', true);

        } finally {
            guardandoMovimiento = false;
            botonesEnviar.forEach((boton, indice) => {
                boton.disabled = false;
                boton.removeAttribute('aria-busy');
                if (boton.tagName === 'INPUT') boton.value = etiquetasOriginales[indice];
                else boton.textContent = etiquetasOriginales[indice];
            });
        }

    }
);


// ===============================
// CARGAR HISTORIAL
// ===============================

// Evita que una respuesta anterior sobrescriba un historial más reciente.
let solicitudHistorialActual = 0;
let cargandoHistorial = false;

async function cargarMovimientos() {
    const solicitud = ++solicitudHistorialActual;
    cargandoHistorial = true;
    listaMovimientos.setAttribute('aria-busy', 'true');
    // Mantener los registros visibles durante la actualización.
    if (!historialMovimientos.length) {
        listaMovimientos.textContent = 'Cargando movimientos...';
    }
    try {
        const respuesta = await fetch('/api/movimientos', { cache: 'no-store' });
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        const movimientos = await respuesta.json();
        if (solicitud !== solicitudHistorialActual) return;
        if (!Array.isArray(movimientos)) throw new Error('Formato de historial inválido');
        mostrarMovimientos(movimientos);
    } catch (error) {
        if (solicitud !== solicitudHistorialActual) return;
        console.error('Error al cargar movimientos:', error);
        // No borrar registros ya consultados cuando falla la conexión.
        if (historialMovimientos.length) renderHistorial();
        else listaMovimientos.replaceChildren();
        const aviso = document.createElement('p');
        aviso.setAttribute('role', 'alert');
        aviso.textContent = 'No se pudo actualizar el historial. ';
        const reintentar = document.createElement('button');
        reintentar.type = 'button';
        reintentar.textContent = 'Reintentar';
        reintentar.addEventListener('click', cargarMovimientos);
        aviso.appendChild(reintentar);
        listaMovimientos.prepend(aviso);
    } finally {
        if (solicitud === solicitudHistorialActual) {
            cargandoHistorial = false;
            listaMovimientos.removeAttribute('aria-busy');
        }
    }
}


// ===============================
// MOSTRAR HISTORIAL
// ===============================

let historialMovimientos = [];
const filtroTipoHistorial = document.getElementById('filtroTipoHistorial');
const filtroTextoHistorial = document.getElementById('filtroTextoHistorial');
const contadorHistorial = document.getElementById('contadorHistorial');
function movimientosFiltrados(){
 const tipo=filtroTipoHistorial.value;
 const texto=filtroTextoHistorial.value.trim().toLocaleLowerCase('es');
 return historialMovimientos.filter(item=>{
  if(tipo && item.tipo_movimiento!==tipo)return false;
  return !texto || [item.codigo_producto,item.nombre_producto,item.ubicacion,
    item.ubicacion_destino,item.numero_serie,item.entregado_a].some(valor=>
      String(valor??'').toLocaleLowerCase('es').includes(texto));
 });
}
function mostrarMovimientos(movimientos){
 historialMovimientos=Array.isArray(movimientos)?movimientos:[];
 renderHistorial();
}
function renderHistorial(){
 const filtrados=movimientosFiltrados();
 contadorHistorial.textContent=`Mostrando ${filtrados.length} de ${historialMovimientos.length} movimientos`;
 listaMovimientos.replaceChildren();
 if(!filtrados.length){
  const p=document.createElement('p');
  p.textContent=historialMovimientos.length?'No hay movimientos con esos filtros.':'Todavía no hay movimientos registrados.';
  listaMovimientos.appendChild(p);return;
 }
 for(const item of filtrados){
  const tarjeta=document.createElement('div');tarjeta.className='tarjeta';
  const titulo=document.createElement('h3');titulo.textContent=item.tipo_movimiento||'Movimiento';tarjeta.appendChild(titulo);
  const filas=[['Producto',item.codigo_producto],['Nombre',item.nombre_producto],
   [item.tipo_movimiento==='TRASLADO'?'Origen':'Ubicación',item.ubicacion],
   ...(item.tipo_movimiento==='TRASLADO'?[['Destino',item.ubicacion_destino||'No registrado']]:[]),
   ['Cantidad',item.cantidad],['N° serie',item.numero_serie],
   ...(item.tipo_movimiento==='SALIDA'?[['Entregado a',item.entregado_a]]:[]),
   ['Fecha',item.fecha_movimiento]];
  for(const [etiqueta,valor] of filas){
   if(valor===undefined||valor===null||valor==='')continue;
   const parrafo=document.createElement('p');const negrita=document.createElement('strong');
   negrita.textContent=etiqueta+': ';parrafo.appendChild(negrita);
   parrafo.appendChild(document.createTextNode(String(valor)));tarjeta.appendChild(parrafo);
  }
  listaMovimientos.appendChild(tarjeta);
 }
}
filtroTipoHistorial.addEventListener('change',renderHistorial);
filtroTextoHistorial.addEventListener('input',renderHistorial);
document.getElementById('limpiarHistorial').addEventListener('click',()=>{
 filtroTipoHistorial.value='';filtroTextoHistorial.value='';renderHistorial();
});
document.getElementById('exportarHistorialCsv').addEventListener('click',()=>{
 const encabezados=['ID','Tipo','Producto','Nombre','Origen / ubicación','Destino','Cantidad','Serie','Entregado a','Fecha'];
 const campos=['id','tipo_movimiento','codigo_producto','nombre_producto','ubicacion','ubicacion_destino','cantidad','numero_serie','entregado_a','fecha_movimiento'];
 const celda=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const filas=[encabezados.map(celda).join(';'),...movimientosFiltrados().map(item=>campos.map(k=>celda(item[k])).join(';'))];
 const blob=new Blob(['\uFEFF'+filas.join('\r\n')],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');
 a.href=url;a.download='historial-movimientos.csv';document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
});

// ===============================
// CARGAR PERSONAL PARA SALIDAS
// ===============================

async function cargarPersonalMovimiento() {

    try {

        const respuesta = await fetch(
            "/api/personal"
        );

        const personal =
            await respuesta.json();

        if (!respuesta.ok) {
            console.error(
                "Error al cargar personal:",
                personal
            );
            return;
        }

        personalMovimiento.innerHTML = `
            <option value="">
                Selecciona técnico o asistente
            </option>
        `;

        const personalDisponible =
            personal.filter(
                function (persona) {

                    return (
                        persona.estado === "ACTIVO" &&
                        (
                            persona.cargo === "TECNICO" ||
                            persona.cargo === "ASISTENTE"
                        )
                    );
                }
            );

        personalDisponible.forEach(
            function (persona) {

                const opcion =
                    document.createElement(
                        "option"
                    );

                opcion.value =
                    persona.id;

                opcion.textContent =
                    `${persona.nombre} — ${persona.cargo}`;

                personalMovimiento.appendChild(
                    opcion
                );
            }
        );

    } catch (error) {

        console.error(
            "Error al cargar personal:",
            error
        );
    }
}


// Cargar técnicos y asistentes
cargarPersonalMovimiento();


// ===============================
// INICIAR
// ===============================

cargarUbicaciones();
cargarMovimientos();


// Alternativa de lectura sin cámara: lector USB o ingreso manual.
let modoCodigoManualMovimiento = 'producto';
const formCodigoManualMovimiento=document.getElementById('formCodigoManualMovimiento');
const campoCodigoManualMovimiento=document.getElementById('codigoManualMovimiento');
const mensajeCodigoManualMovimiento=document.getElementById('mensajeCodigoManualMovimiento');
botonEscanearMovimiento.addEventListener('click',()=>{
 modoCodigoManualMovimiento='producto';
 campoCodigoManualMovimiento.value='';
 campoCodigoManualMovimiento.focus();
});
botonEscanearSerie.addEventListener('click',()=>{
 modoCodigoManualMovimiento='serie';
 campoCodigoManualMovimiento.value='';
 campoCodigoManualMovimiento.focus();
});
formCodigoManualMovimiento.addEventListener('submit',async evento=>{
 evento.preventDefault();
 const valor=campoCodigoManualMovimiento.value.trim();
 if(!valor){mensajeCodigoManualMovimiento.textContent='Ingresa un código.';return;}
 if(modoCodigoManualMovimiento==='producto'){
   codigoProducto.value=valor;
   await buscarProductoMovimiento();
   await cerrarEscaner();
   return;
 }
 const tipo=tipoMovimiento.value;
 if(tipo!=='ENTRADA' && tipo!=='SALIDA' && tipo!=='TRASLADO'){
   mensajeCodigoManualMovimiento.textContent='Selecciona un tipo de movimiento.';
   return;
 }
 let opcion=[...numeroSerieMovimiento.options].find(x=>x.value===valor);
 if(tipo!=='ENTRADA' && !opcion){
   mensajeCodigoManualMovimiento.textContent='La serie no está disponible para el movimiento seleccionado.';
   return;
 }
 if(tipo==='ENTRADA' && !opcion){
   opcion=new Option(valor,valor);
   numeroSerieMovimiento.add(opcion);
 }
 numeroSerieMovimiento.value=valor;
 numeroSerieMovimiento.dispatchEvent(new Event('change',{bubbles:true}));
 await cerrarEscaner();
});
