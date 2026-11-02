// ===============================
// ELEMENTOS GENERALES
// ===============================

const modalUbicacion =
    document.getElementById("modalUbicacion");

const cerrarModal =
    document.getElementById("cerrarModal");

const tituloUbicacion =
    document.getElementById("tituloUbicacion");

const detalleProducto =
    document.querySelector(".detalle-producto");

const contenedorPasillos =
    document.getElementById("contenedorPasillos");

const tituloBodegaMapa =
    document.getElementById("tituloBodegaMapa");

const contenedorBodegas =
    document.querySelector(".contenedor-bodegas");


// ===============================
// ELEMENTOS DEL BUSCADOR
// ===============================

const buscarProducto =
    document.getElementById("buscarProducto");

const botonBuscarProducto =
    document.getElementById("botonBuscarProducto");

const resultadoBusqueda =
    document.getElementById("resultadoBusqueda");


// ===============================
// ELEMENTOS DEL ESCÁNER
// ===============================

const botonEscanear =
    document.getElementById("botonEscanear");

const modalEscaner =
    document.getElementById("modalEscaner");

const cerrarEscaner =
    document.getElementById("cerrarEscaner");

const mensajeEscaner =
    document.getElementById("mensajeEscaner");

let lectorCodigo = null;

let escanerActivo = false;


// ===============================
// BODEGA ACTUAL
// ===============================

let bodegaActual = null;

// Una solicitud lenta no debe dejar el mapa cargando indefinidamente.
async function consultarMapa(url, tiempoMaximo = 12000) {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), tiempoMaximo);
    try {
        const respuesta = await fetch(url, { signal: controlador.signal });
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        const datos = await respuesta.json();
        if (!Array.isArray(datos)) throw new Error('Respuesta de ubicaciones inválida');
        return datos;
    } finally {
        clearTimeout(temporizador);
    }
}

let versionCargaMapa = 0;
// Mantener un registro permite cancelar consultas de estados al cambiar de bodega.
const consultasEstadoActivas = new Set();

function cancelarConsultasEstado() {
    for (const controlador of consultasEstadoActivas) controlador.abort();
    consultasEstadoActivas.clear();
}



// ===============================
// CARGAR BODEGAS DESDE LA BD
// ===============================

async function cargarBodegas() {

    contenedorBodegas.innerHTML = `
        <p>
            Cargando bodegas...
        </p>
    `;

    try {

        const ubicaciones = await consultarMapa('/api/ubicaciones');

        const bodegas =
            [
                ...new Set(
                    ubicaciones.map(
                        function (item) {

                            return Number(
                                item.bodega
                            );

                        }
                    )
                )
            ]
                .filter(
                    function (numero) {

                        return !Number.isNaN(
                            numero
                        );

                    }
                )
                .sort(
                    function (a, b) {

                        return a - b;

                    }
                );

        contenedorBodegas.innerHTML = "";

        if (bodegas.length === 0) {

            contenedorBodegas.innerHTML = `
                <p>
                    No hay bodegas creadas.
                </p>
            `;

            return [];

        }

        bodegas.forEach(
            function (numeroBodega) {

                const boton =
                    document.createElement(
                        "button"
                    );

                boton.className =
                    "boton-bodega";

                boton.dataset.bodega =
                    numeroBodega;

                boton.textContent =
                    `Bodega ${numeroBodega}`;

                boton.addEventListener(
                    "click",
                    function () {

                        mostrarBodega(
                            numeroBodega
                        );

                    }
                );

                contenedorBodegas.appendChild(
                    boton
                );

            }
        );

        return bodegas;

    } catch (error) {

        console.error(
            "Error al cargar bodegas:",
            error
        );

        contenedorBodegas.innerHTML = '<p>Error al cargar las bodegas.</p>';
        const reintentar = document.createElement('button');
        reintentar.type = 'button';
        reintentar.textContent = 'Reintentar';
        reintentar.addEventListener('click', cargarBodegas);
        contenedorBodegas.appendChild(reintentar);

        return [];

    }

}


// ===============================
// MOSTRAR BODEGA
// ===============================

async function mostrarBodega(
    numeroBodega
) {

    bodegaActual =
        Number(numeroBodega);
    const versionActual = ++versionCargaMapa;
    cancelarConsultasEstado();

    tituloBodegaMapa.textContent =
        `Bodega ${bodegaActual}`;

    const botonesBodega =
        document.querySelectorAll(
            ".boton-bodega"
        );

    botonesBodega.forEach(
        function (boton) {

            boton.classList.remove(
                "activa"
            );

            if (
                Number(
                    boton.dataset.bodega
                ) === bodegaActual
            ) {

                boton.classList.add(
                    "activa"
                );

            }

        }
    );

    contenedorPasillos.innerHTML = `
        <p>
            Cargando ubicaciones...
        </p>
    `;

    try {

        const todasUbicaciones = await consultarMapa('/api/ubicaciones');
        if (versionActual !== versionCargaMapa) return;

        const ubicacionesBodega =
            todasUbicaciones.filter(
                function (item) {

                    return (
                        Number(
                            item.bodega
                        ) ===
                        bodegaActual
                    );

                }
            );

        // Las posiciones guardadas definen la geometría real; el ancho de pantalla no la modifica.
        const estructuras = await cargarEstructurasMapa(numeroBodega);
        if (versionActual !== versionCargaMapa) return;
        construirMapa(ubicacionesBodega, estructuras);

        await cargarEstadosUbicaciones(versionActual);

    } catch (error) {

        console.error(
            "Error al cargar mapa:",
            error
        );

        if (versionActual !== versionCargaMapa) return;
        contenedorPasillos.innerHTML = '<p>No se pudo cargar el mapa.</p>';
        const reintentar = document.createElement('button');
        reintentar.type = 'button';
        reintentar.textContent = 'Reintentar';
        reintentar.addEventListener('click', () => mostrarBodega(numeroBodega));
        contenedorPasillos.appendChild(reintentar);

    }

}


// ===============================
// CONSTRUIR MAPA DESDE LA BD
// ===============================

async function cargarEstructurasMapa(bodega) {
    try {
        // Cada consulta usa el mismo límite de espera que el listado principal.
        // Evita que una API de estructuras lenta deje el mapa bloqueado.
        const consultarEstructura = async (url) => {
            const controlador = new AbortController();
            consultasEstadoActivas.add(controlador);
            const temporizador = setTimeout(() => controlador.abort(), 12000);
            try {
                const respuesta = await fetch(url, { signal: controlador.signal });
                if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}: ${url}`);
                const datos = await respuesta.json();
                if (!Array.isArray(datos)) throw new Error(`Formato inválido: ${url}`);
                return datos;
            } finally {
                clearTimeout(temporizador);
                consultasEstadoActivas.delete(controlador);
            }
        };

        const estructuras = (await consultarEstructura('/api/estructuras'))
            .filter(e => e && Number(e.bodega) === Number(bodega));
        const resultados = await Promise.all(estructuras.map(async e => ({
            ...e,
            ubicaciones: await consultarEstructura(`/api/estructuras/${encodeURIComponent(e.id)}/posiciones`)
        })));
        return resultados;
    } catch (error) {
        console.warn('No se pudo consultar la geometría de los racks:', error);
        // El mapa mantiene su representación de respaldo si no hay estructuras.
        return [];
    }
}

function escaparTextoMapa(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function dibujarRackGuardado(estructura, ubicacionesPorCodigo) {
    const modulos = Number(estructura.modulos);
    const niveles = Number(estructura.niveles);
    const posiciones = Number(estructura.posiciones);
    if (![modulos,niveles,posiciones].every(n => Number.isSafeInteger(n) && n > 0) || modulos * niveles * posiciones > 500) return '';
    const mapa = new Map(estructura.ubicaciones.map(p => [`${p.modulo}-${p.nivel}-${p.posicion}`, p.codigo]));
    let contenido = '';
    for (let nivel = niveles; nivel >= 1; nivel--) {
        contenido += `<div class="ap-rack-nivel" style="--modulos:${modulos}"><span class="ap-rack-nivel-etiqueta">N${nivel}</span>`;
        for (let modulo = 1; modulo <= modulos; modulo++) {
            contenido += `<div class="ap-rack-modulo" style="--posiciones:${posiciones}">`;
            for (let posicion = 1; posicion <= posiciones; posicion++) {
                const codigo = mapa.get(`${modulo}-${nivel}-${posicion}`);
                if (codigo && ubicacionesPorCodigo.has(codigo)) {
                    const seguro = escaparTextoMapa(codigo);
                    contenido += `<div class="ubicacion disponible" data-codigo="${seguro}" title="${seguro}">${seguro}</div>`;
                } else {
                    contenido += '<div class="ap-rack-hueco" aria-hidden="true"></div>';
                }
            }
            contenido += '</div>';
        }
        contenido += '</div>';
    }
    return `<section class="ap-rack-estructura"><h4>${escaparTextoMapa(estructura.nombre)}</h4><div class="ap-rack-scroll" tabindex="0" aria-label="Rack ${escaparTextoMapa(estructura.nombre)}: desplazar horizontalmente para ver todas las posiciones"><div class="ap-rack-fijo">${contenido}</div></div></section>`;
}

function construirMapa(ubicacionesBodega, estructuras = []) {
    contenedorPasillos.innerHTML = '';
    if (!ubicacionesBodega || ubicacionesBodega.length === 0) {
        contenedorPasillos.textContent = 'Esta bodega no tiene ubicaciones creadas.';
        return;
    }
    const porCodigo = new Map(ubicacionesBodega.map(u => [u.codigo, u]));
    const asignadas = new Set();
    const pasillos = new Map();
    for (const u of ubicacionesBodega) {
        const numero = Number(u.pasillo);
        if (!pasillos.has(numero)) pasillos.set(numero, []);
        pasillos.get(numero).push(u);
    }
    for (const numero of [...pasillos.keys()].sort((a,b) => a-b)) {
        const pasillo = document.createElement('div');
        pasillo.className = 'pasillo ap-pasillo-rack';
        const titulo = document.createElement('h3');
        titulo.textContent = `Pasillo ${numero}`;
        pasillo.appendChild(titulo);
        for (const estructura of estructuras.filter(e => Number(e.pasillo) === numero)) {
            const html = dibujarRackGuardado(estructura, porCodigo);
            if (!html) continue;
            const envoltorio = document.createElement('div');
            envoltorio.innerHTML = html;
            pasillo.appendChild(envoltorio.firstElementChild);
            estructura.ubicaciones.forEach(p => { if (porCodigo.has(p.codigo)) asignadas.add(p.codigo); });
        }
        // Las ubicaciones creadas manualmente siguen visibles, sin inventar niveles o módulos.
        const sueltas = pasillos.get(numero).filter(u => !asignadas.has(u.codigo))
            .sort((a,b) => Number(a.ubicacion)-Number(b.ubicacion));
        if (sueltas.length) {
            const grupo = document.createElement('div');
            grupo.className = 'ap-rack-sin-estructura';
            const subtitulo = document.createElement('h4');
            subtitulo.textContent = 'Ubicaciones sin estructura asignada';
            grupo.appendChild(subtitulo);
            const rejilla = document.createElement('div');
            rejilla.className = 'ubicaciones ap-rack-ubicaciones';
            for (const u of sueltas) {
                const celda = document.createElement('div');
                celda.className = 'ubicacion disponible';
                celda.dataset.codigo = u.codigo;
                celda.textContent = u.codigo;
                rejilla.appendChild(celda);
            }
            grupo.appendChild(rejilla);
            pasillo.appendChild(grupo);
        }
        contenedorPasillos.appendChild(pasillo);
    }
}


// ===============================
// OBTENER UBICACIONES VISIBLES
// ===============================

function obtenerUbicacionesVisibles() {

    return document.querySelectorAll(
        ".ubicacion"
    );

}


// ===============================
// CARGAR ESTADO DE UBICACIONES
// ===============================

async function cargarEstadosUbicaciones(versionActual = versionCargaMapa) {
    const ubicaciones = obtenerUbicacionesVisibles();
    // Evita consultas secuenciales lentas cuando la bodega contiene muchos racks.
    const concurrencia = Math.min(6, ubicaciones.length);
    let siguiente = 0;

    async function procesarSiguiente() {
        while (siguiente < ubicaciones.length && versionActual === versionCargaMapa) {
            const ubicacion = ubicaciones[siguiente++];
            const codigoUbicacion = ubicacion.dataset.codigo;
            if (!codigoUbicacion) continue;
            const controlador = new AbortController();
            consultasEstadoActivas.add(controlador);
            const temporizador = setTimeout(() => controlador.abort(), 12000);
            try {
                const respuesta = await fetch(
                    `/api/ubicaciones/${encodeURIComponent(codigoUbicacion)}`,
                    { signal: controlador.signal }
                );
                if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
                const datos = await respuesta.json();
                // No actualizar un elemento desconectado ni una bodega ya reemplazada.
                if (versionActual !== versionCargaMapa || !ubicacion.isConnected) return;
                aplicarEstadoVisual(ubicacion, datos);
            } catch (error) {
                // No marcar como disponible una ubicación cuyo estado no pudo consultarse.
                if (error.name !== 'AbortError') {
                    console.warn('No se pudo consultar el estado:', codigoUbicacion, error);
                }
            } finally {
                clearTimeout(temporizador);
                consultasEstadoActivas.delete(controlador);
            }
        }
    }

    await Promise.all(Array.from({ length: concurrencia }, procesarSiguiente));
}


// ===============================
// APLICAR COLOR SEGÚN ESTADO
// ===============================

function aplicarEstadoVisual(
    elemento,
    datos
) {

    elemento.classList.remove(
        "disponible",
        "ocupada",
        "parcial"
    );

    const tieneProductos =
        datos.productos &&
        datos.productos.length > 0;

    if (
        !tieneProductos ||
        datos.estado === "Disponible"
    ) {

        elemento.classList.add(
            "disponible"
        );

        return;
    }

    if (
        datos.estado ===
        "Por completar"
    ) {

        elemento.classList.add(
            "parcial"
        );

        return;
    }

    elemento.classList.add(
        "ocupada"
    );

}


// ===============================
// CLICK EN UNA UBICACIÓN
// ===============================

contenedorPasillos.addEventListener(
    "click",
    async function (evento) {

        const ubicacion =
            evento.target.closest(
                ".ubicacion"
            );

        if (!ubicacion) {
            return;
        }

        const codigoUbicacion =
            ubicacion.dataset.codigo;

        tituloUbicacion.textContent =
            codigoUbicacion;

        modalUbicacion.style.display =
            "flex";

        detalleProducto.innerHTML = `
            <p>
                Cargando información...
            </p>
        `;

        try {

            const respuesta =
                await fetch(
                    `/api/ubicaciones/${codigoUbicacion}`
                );

            if (!respuesta.ok) {

                detalleProducto.innerHTML = `
                    <div class="foto-producto">
                        <span>📦</span>
                    </div>

                    <div class="info-producto">

                        <p>
                            <strong>
                                Estado:
                            </strong>

                            Disponible
                        </p>

                        <p>
                            Esta ubicación no tiene
                            productos asignados.
                        </p>

                    </div>
                `;

                return;

            }

            const resultado =
                await respuesta.json();

            aplicarEstadoVisual(
                ubicacion,
                resultado
            );

            mostrarProducto(
                resultado
            );

        } catch (error) {

            console.error(
                "Error al consultar ubicación:",
                error
            );

            detalleProducto.innerHTML = `
                <p>
                    Error al consultar la ubicación.
                </p>
            `;

        }

    }
);


// ===============================
// MOSTRAR PRODUCTOS
// ===============================

function mostrarProducto(datos) {

    const productos =
        datos.productos || [];

    if (productos.length === 0) {

        detalleProducto.innerHTML = `
            <div class="foto-producto">
                <span>📦</span>
            </div>

            <div class="info-producto">

                <p>
                    <strong>
                        Estado:
                    </strong>
                    Disponible
                </p>

                <p>
                    Esta ubicación no tiene
                    productos asignados.
                </p>

            </div>
        `;

        return;
    }

    let contenidoProductos = "";

    productos.forEach(
        function (producto) {

            let contenidoFoto = `
                <span>📦</span>
            `;

            if (producto.foto) {

                contenidoFoto = `
                    <img
                        src="${producto.foto}"
                        alt="${producto.nombre}"
                        style="
                            width: 100%;
                            height: 100%;
                            object-fit: cover;
                            border-radius: 12px;
                        "
                    >
                `;

            }

            let detalleControl = "";

            if (
                producto.tipoControl ===
                "SERIE"
            ) {

                detalleControl = `
                    <p>
                        <strong>
                            N° Serie:
                        </strong>
                        ${producto.numeroSerie || "-"}
                    </p>
                `;

            }

            if (
                producto.tipoControl ===
                "CANTIDAD"
            ) {

                detalleControl = `
                    <p>
                        <strong>
                            Cantidad:
                        </strong>
                        ${producto.cantidad ?? 0}
                    </p>
                `;

            }

            contenidoProductos += `
                <div class="ap-producto-ubicacion">

                    <div class="foto-producto">
                        ${contenidoFoto}
                    </div>

                    <div class="info-producto">

                        <p>
                            <strong>
                                Producto:
                            </strong>
                            ${producto.nombre}
                        </p>

                        <p>
                            <strong>
                                Código:
                            </strong>
                            ${producto.codigo}
                        </p>

                        <p>
                            <strong>
                                Descripción:
                            </strong>
                            ${producto.descripcion || "-"}
                        </p>

                        <p>
                            <strong>
                                Tipo de control:
                            </strong>
                            ${producto.tipoControl}
                        </p>

                        ${detalleControl}

                    </div>

                </div>
            `;

        }
    );

    detalleProducto.innerHTML = `
        <div style="width: 100%;">

            <p>
                <strong>
                    Estado ubicación:
                </strong>
                ${datos.estado}
            </p>

            <p>
                <strong>
                    Productos almacenados:
                </strong>
                ${productos.length}
            </p>

            ${contenidoProductos}

        </div>
    `;

}


// ===============================
// BUSCAR PRODUCTO
// ===============================

botonBuscarProducto.addEventListener(
    "click",
    async function () {

        const termino =
            buscarProducto.value.trim();

        if (!termino) {

            resultadoBusqueda.textContent =
                "Ingresa un código, nombre, descripción o número de serie.";

            return;

        }

        resultadoBusqueda.textContent =
            "Buscando...";

        try {

            const respuesta =
                await fetch(
                    `/api/buscar/${encodeURIComponent(termino)}`
                );

            const datos =
                await respuesta.json();

            if (!respuesta.ok) {

                resultadoBusqueda.textContent =
                    datos.mensaje ||
                    "No se pudo realizar la búsqueda.";

                return;

            }

            if (!datos.encontrado) {

                resultadoBusqueda.textContent =
                    "No se encontró el producto.";

                return;

            }

            mostrarResultadoBusqueda(
                datos
            );

        } catch (error) {

            console.error(
                "Error al buscar producto:",
                error
            );

            resultadoBusqueda.textContent =
                "Error al buscar el producto.";

        }

    }
);


// ===============================
// BUSCAR CON ENTER
// ===============================

buscarProducto.addEventListener(
    "keydown",
    function (evento) {

        if (
            evento.key === "Enter"
        ) {

            botonBuscarProducto.click();

        }

    }
);


// ===============================
// MOSTRAR RESULTADO DE BÚSQUEDA
// ===============================

function mostrarResultadoBusqueda(
    datos
) {

    // ===============================
    // BÚSQUEDA DIRECTA POR SERIE
    // ===============================

    if (
        datos.tipoBusqueda ===
            "SERIE" &&
        datos.producto.numero_serie
    ) {

        const ubicacion =
            datos.producto.ubicacion;

        resultadoBusqueda.innerHTML = `
            <strong>
                ${datos.producto.nombre}
            </strong>

            <div>

                Serie:
                ${datos.producto.numero_serie}

                -

                Ubicación:

                ${
                    ubicacion
                        ? `
                            <button
                                type="button"
                                class="boton-resultado-ubicacion"
                                onclick="resaltarUbicacion('${ubicacion}')"
                            >
                                ${ubicacion}
                            </button>
                        `
                        : "Sin ubicación"
                }

            </div>
        `;

        if (ubicacion) {

            resaltarUbicacion(
                ubicacion
            );

        }

        return;

    }


    // ===============================
    // PRODUCTO POR CANTIDAD
    // ===============================

    if (
        datos.tipoBusqueda ===
        "CANTIDAD"
    ) {

        let textoUbicaciones = "";

        datos.producto.ubicaciones.forEach(
            function (item) {

                textoUbicaciones += `
                    <div>

                        <button
                            type="button"
                            class="boton-resultado-ubicacion"
                            onclick="resaltarUbicacion('${item.ubicacion}')"
                        >
                            ${item.ubicacion}
                        </button>

                        -

                        Cantidad:
                        ${item.cantidad}

                    </div>
                `;

            }
        );

        resultadoBusqueda.innerHTML = `
            <strong>
                ${datos.producto.nombre}
            </strong>

            ${textoUbicaciones}
        `;

        if (
            datos.producto
                .ubicaciones.length > 0
        ) {

            resaltarUbicacion(
                datos.producto
                    .ubicaciones[0]
                    .ubicacion
            );

        }

        return;

    }


    // ===============================
    // PRODUCTO SERIADO POR CÓDIGO
    // ===============================

    if (
        datos.tipoBusqueda ===
            "SERIE" &&
        datos.producto.series
    ) {

        let textoSeries = "";

        datos.producto.series.forEach(
            function (item) {

                textoSeries += `
                    <div>

                        Serie:
                        ${item.numero_serie}

                        -

                        Ubicación:

                        ${
                            item.ubicacion
                                ? `
                                    <button
                                        type="button"
                                        class="boton-resultado-ubicacion"
                                        onclick="resaltarUbicacion('${item.ubicacion}')"
                                    >
                                        ${item.ubicacion}
                                    </button>
                                `
                                : "Sin ubicación"
                        }

                    </div>
                `;

            }
        );

        resultadoBusqueda.innerHTML = `
            <strong>
                ${datos.producto.nombre}
            </strong>

            ${textoSeries}
        `;

        if (
            datos.producto
                .series.length > 0 &&
            datos.producto
                .series[0]
                .ubicacion
        ) {

            resaltarUbicacion(
                datos.producto
                    .series[0]
                    .ubicacion
            );

        }

    }

}


// ===============================
// RESALTAR UBICACIÓN
// ===============================

async function resaltarUbicacion(
    codigoUbicacion
) {

    const coincidencia =
        codigoUbicacion.match(
            /^B(\d+)-/
        );

    if (coincidencia) {

        const numeroBodega =
            Number(
                coincidencia[1]
            );

        if (
            numeroBodega !==
            bodegaActual
        ) {

            await mostrarBodega(
                numeroBodega
            );

        }

    }

    const ubicaciones =
        obtenerUbicacionesVisibles();

    ubicaciones.forEach(
        function (ubicacion) {

            ubicacion.style.outline =
                "none";

        }
    );

    const ubicacionEncontrada =
        Array.from(
            ubicaciones
        ).find(
            function (ubicacion) {

                return (
                    ubicacion.dataset.codigo ===
                    codigoUbicacion
                );

            }
        );

    if (!ubicacionEncontrada) {

        return;

    }

    ubicacionEncontrada.style.outline =
        "4px solid #ffcc00";

    ubicacionEncontrada.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

}


// ===============================
// ABRIR ESCÁNER
// ===============================

botonEscanear.addEventListener(
    "click",
    async function () {

        modalEscaner.style.display =
            "flex";

        mensajeEscaner.textContent =
            "Iniciando cámara...";

        try {

            lectorCodigo =
                new Html5Qrcode(
                    "lectorCodigo"
                );

            escanerActivo = true;

            await lectorCodigo.start(
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
                codigoDetectado,
                function () {
                    // Sigue buscando
                }
            );

            mensajeEscaner.textContent =
                "Apunta la cámara al código.";

        } catch (error) {

            console.error(
                "Error al iniciar cámara:",
                error
            );

            mensajeEscaner.textContent =
                "No se pudo abrir la cámara.";

            escanerActivo = false;

        }

    }
);


// ===============================
// CÓDIGO DETECTADO
// ===============================

async function codigoDetectado(
    codigo
) {

    if (!escanerActivo) {
        return;
    }

    buscarProducto.value =
        codigo.trim();

    mensajeEscaner.textContent =
        `Código detectado: ${codigo}`;

    await detenerEscaner();

    modalEscaner.style.display =
        "none";

    botonBuscarProducto.click();

}


// ===============================
// DETENER ESCÁNER
// ===============================

async function detenerEscaner() {

    if (
        lectorCodigo &&
        escanerActivo
    ) {

        try {

            await lectorCodigo.stop();

            lectorCodigo.clear();

        } catch (error) {

            console.error(
                "Error al detener escáner:",
                error
            );

        }

    }

    lectorCodigo = null;

    escanerActivo = false;

}


// ===============================
// CERRAR ESCÁNER
// ===============================

cerrarEscaner.addEventListener(
    "click",
    async function () {

        await detenerEscaner();

        modalEscaner.style.display =
            "none";

    }
);


// ===============================
// CERRAR MODAL UBICACIÓN
// ===============================

cerrarModal.addEventListener(
    "click",
    function () {

        modalUbicacion.style.display =
            "none";

    }
);


modalUbicacion.addEventListener(
    "click",
    function (evento) {

        if (
            evento.target ===
            modalUbicacion
        ) {

            modalUbicacion.style.display =
                "none";

        }

    }
);


// ===============================
// INICIAR MAPA
// ===============================

async function iniciarMapa() {

    const bodegas =
        await cargarBodegas();

    if (
        bodegas.length > 0
    ) {

        await mostrarBodega(
            bodegas[0]
        );

    } else {

        tituloBodegaMapa.textContent =
            "Sin bodegas";

        contenedorPasillos.innerHTML = `
            <p>
                Crea una ubicación para comenzar.
            </p>
        `;

    }

}


iniciarMapa();