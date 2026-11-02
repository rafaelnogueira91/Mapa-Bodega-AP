// ===============================
// ELEMENTOS
// ===============================

const formSolicitud =
    document.getElementById("formSolicitud");

const supervisorSolicitud =
    document.getElementById("supervisorSolicitud");

const personalDestinoSolicitud =
    document.getElementById(
        "personalDestinoSolicitud"
    );

const productoSolicitud =
    document.getElementById("productoSolicitud");

const buscarProductoSolicitud =
    document.getElementById(
        "buscarProductoSolicitud"
    );

const resultadosProductos =
    document.getElementById(
        "resultadosProductos"
    );

const cantidadSolicitud =
    document.getElementById(
        "cantidadSolicitud"
    );

const botonAgregarProducto =
    document.getElementById(
        "botonAgregarProducto"
    );

const productosSolicitud =
    document.getElementById(
        "productosSolicitud"
    );

const observacionesSolicitud =
    document.getElementById(
        "observacionesSolicitud"
    );

const listaSolicitudes =
    document.getElementById(
        "listaSolicitudes"
    );


// ===============================
// VARIABLES
// ===============================

let productosDisponibles = [];
let disponibilidadProductos = new Map();
let stockPorBodega = new Map();
let bodegaProyectoSeleccionada = null;
let consultaStockProyectoVersion = 0;
let stockProyectoConsultado = false;

let detalleSolicitud = [];
let creandoSolicitud = false;
const botonCrearSolicitud = formSolicitud.querySelector('button[type="submit"]');
const estadoCreacionSolicitud = document.getElementById("estadoCreacionSolicitud");

let solicitudesDisponibles = [];
// Permisos de presentación; el servidor sigue siendo la autoridad.
let rolSolicitudesActual = null;
const puedeGestionarEntrega = () => ['ADMIN', 'BODEGA'].includes(rolSolicitudesActual);
const puedeCrearSolicitud = () => ['ADMIN', 'SUPERVISOR', 'BODEGA'].includes(rolSolicitudesActual);
const puedeCambiarPrioridad = () => ['ADMIN', 'SUPERVISOR'].includes(rolSolicitudesActual);
function aplicarPermisosSolicitudes() {
    if (formSolicitud) formSolicitud.hidden = !puedeCrearSolicitud();
}



// Filtros de consulta locales: no alteran el estado de las solicitudes.
const filtroEstadoSolicitud = document.getElementById('filtroEstadoSolicitud');
const buscarSolicitudRegistrada = document.getElementById('buscarSolicitudRegistrada');
const contadorSolicitudes = document.getElementById('contadorSolicitudes');

const ordenSolicitudes = document.getElementById('ordenSolicitudes');
const filtroPrioridadSolicitud = document.getElementById('filtroPrioridadSolicitud');
const indicadoresSolicitudes = document.getElementById('indicadoresSolicitudes');
const sinResultadosSolicitudes = document.getElementById('sinResultadosSolicitudes');

// Alerta visual: solicitudes abiertas durante 48 horas o más (no modifica su estado).
const HORAS_ALERTA_SOLICITUD = 48;
const HORAS_ALERTA_URGENTE = 12;
function horasDesdeSolicitud(fecha) {
    if (!fecha) return null;
    const texto = String(fecha).trim();
    // SQLite suele entregar UTC sin sufijo de zona horaria.
    const normalizada = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(texto)
        ? texto.replace(' ', 'T') + 'Z' : texto;
    const instante = Date.parse(normalizada);
    if (!Number.isFinite(instante)) return null;
    return Math.max(0, (Date.now() - instante) / 3600000);
}
function solicitudAtrasada(solicitud) {
    const horas = horasDesdeSolicitud(solicitud.fecha_solicitud);
    return solicitud.estado !== 'ENTREGADA' && horas !== null && horas >= HORAS_ALERTA_SOLICITUD;
}
function solicitudUrgenteAtrasada(solicitud) {
    const horas = horasDesdeSolicitud(solicitud.fecha_solicitud);
    return solicitud.prioridad === 'URGENTE' && solicitud.estado !== 'ENTREGADA' && horas !== null && horas >= HORAS_ALERTA_URGENTE;
}

function actualizarIndicadoresSolicitudes() {
    const conteos = { 'PENDIENTE': 0, 'EN PREPARACIÓN': 0, 'ENTREGADA': 0 };
    solicitudesDisponibles.forEach(solicitud => {
        if (Object.prototype.hasOwnProperty.call(conteos, solicitud.estado)) conteos[solicitud.estado]++;
    });
    const valores = {
        totalSolicitudes: solicitudesDisponibles.length,
        totalPendientes: conteos.PENDIENTE,
        totalPreparacion: conteos['EN PREPARACIÓN'],
        totalEntregadas: conteos.ENTREGADA,
        totalAtrasadas: solicitudesDisponibles.filter(solicitudAtrasada).length,
        totalUrgentes: solicitudesDisponibles.filter(s => s.prioridad === 'URGENTE' && s.estado !== 'ENTREGADA').length,
        totalUrgentesAtrasadas: solicitudesDisponibles.filter(solicitudUrgenteAtrasada).length
    };
    Object.entries(valores).forEach(([id, valor]) => {
        const elemento = document.getElementById(id);
        if (elemento) elemento.textContent = String(valor);
    });
    indicadoresSolicitudes?.querySelectorAll('[data-filtro-estado]').forEach(boton => {
        boton.setAttribute('aria-pressed', String(boton.dataset.filtroEstado === (filtroEstadoSolicitud?.value || '') && !(filtroPrioridadSolicitud?.value)));
    });
    indicadoresSolicitudes?.querySelectorAll('[data-filtro-prioridad]').forEach(boton => {
        boton.setAttribute('aria-pressed', String(boton.dataset.filtroPrioridad === (filtroPrioridadSolicitud?.value || '') && !(filtroEstadoSolicitud?.value)));
    });
}
indicadoresSolicitudes?.addEventListener('click', evento => {
    const boton = evento.target.closest('[data-filtro-estado]');
    const botonPrioridad = evento.target.closest('[data-filtro-prioridad]');
    if (botonPrioridad && indicadoresSolicitudes.contains(botonPrioridad) && filtroPrioridadSolicitud) {
        filtroPrioridadSolicitud.value = botonPrioridad.dataset.filtroPrioridad;
        if (filtroEstadoSolicitud) filtroEstadoSolicitud.value = '';
        aplicarFiltrosSolicitudes();
        return;
    }
    if (!boton || !indicadoresSolicitudes.contains(boton) || !filtroEstadoSolicitud) return;
    if (filtroPrioridadSolicitud) filtroPrioridadSolicitud.value = '';
    filtroEstadoSolicitud.value = boton.dataset.filtroEstado;
    aplicarFiltrosSolicitudes();
});

// Orden visual exclusivamente: no modifica prioridades ni registros de la base de datos.
function ordenarTarjetasSolicitudes() {
    if (!listaSolicitudes) return;
    const modo = ordenSolicitudes?.value || 'prioridad';
    const tarjetas = [...listaSolicitudes.querySelectorAll('.solicitud-registrada')];
    tarjetas.sort((a, b) => {
        const sa = solicitudesDisponibles.find(s => String(s.id) === a.dataset.solicitudId);
        const sb = solicitudesDisponibles.find(s => String(s.id) === b.dataset.solicitudId);
        if (!sa || !sb) return 0;
        const edadA = horasDesdeSolicitud(sa.fecha_solicitud) ?? 0;
        const edadB = horasDesdeSolicitud(sb.fecha_solicitud) ?? 0;
        if (modo === 'numero') return Number(sa.id) - Number(sb.id);
        if (modo === 'recientes') return edadA - edadB;
        if (modo === 'antiguas') return edadB - edadA;
        const nivel = s => s.estado === 'ENTREGADA' ? 1 : 0;
        const rango = { URGENTE: 0, ALTA: 1, NORMAL: 2 };
        return nivel(sa) - nivel(sb) || (rango[sa.prioridad] ?? 2) - (rango[sb.prioridad] ?? 2) || Number(solicitudUrgenteAtrasada(sb)) - Number(solicitudUrgenteAtrasada(sa)) || Number(solicitudAtrasada(sb)) - Number(solicitudAtrasada(sa)) || edadB - edadA;
    });
    tarjetas.forEach(tarjeta => listaSolicitudes.appendChild(tarjeta));
}

function aplicarFiltrosSolicitudes() {
    const estado = filtroEstadoSolicitud?.value || '';
    const prioridad = filtroPrioridadSolicitud?.value || '';
    const busqueda = (buscarSolicitudRegistrada?.value || '').trim().toLocaleLowerCase('es');
    let visibles = 0;
    listaSolicitudes.querySelectorAll('.solicitud-registrada').forEach(tarjeta => {
        const coincideEstado = !estado || (estado === 'ATRASADA'
            ? tarjeta.dataset.atrasada === 'true' : estado === 'URGENTE_ATRASADA'
            ? tarjeta.dataset.urgenteAtrasada === 'true' : tarjeta.dataset.estado === estado);
        const coincideTexto = !busqueda || tarjeta.textContent.toLocaleLowerCase('es').includes(busqueda);
        const visible = coincideEstado && coincideTexto && (!prioridad || tarjeta.dataset.prioridad === prioridad)
            && !(prioridad === 'URGENTE' && !estado && tarjeta.dataset.estado === 'ENTREGADA');
        tarjeta.hidden = !visible;
        if (visible) visibles++;
    });
    ordenarTarjetasSolicitudes();
    actualizarIndicadoresSolicitudes();
    if (sinResultadosSolicitudes) sinResultadosSolicitudes.hidden = visibles !== 0 || solicitudesDisponibles.length === 0;
    if (contadorSolicitudes) contadorSolicitudes.textContent =
        `${visibles} de ${solicitudesDisponibles.length} solicitudes visibles`;
}
filtroEstadoSolicitud?.addEventListener('change', aplicarFiltrosSolicitudes);
buscarSolicitudRegistrada?.addEventListener('input', aplicarFiltrosSolicitudes);
ordenSolicitudes?.addEventListener('change', aplicarFiltrosSolicitudes);
filtroPrioridadSolicitud?.addEventListener('change', aplicarFiltrosSolicitudes);

// Actualiza alertas por el paso del tiempo sin destruir formularios abiertos.
function actualizarAlertasEnPantalla() {
    if (!listaSolicitudes) return;
    const porId = new Map(solicitudesDisponibles.map(s => [String(s.id), s]));
    listaSolicitudes.querySelectorAll('.solicitud-registrada').forEach(tarjeta => {
        const solicitud = porId.get(tarjeta.dataset.solicitudId);
        if (!solicitud) return;
        const urgente = solicitudUrgenteAtrasada(solicitud);
        const atrasada = solicitudAtrasada(solicitud);
        tarjeta.dataset.urgenteAtrasada = String(urgente);
        tarjeta.dataset.atrasada = String(atrasada);
        const cabecera = tarjeta.querySelector('.cabecera-solicitud');
        if (!cabecera) return;
        let aviso = cabecera.querySelector('.alerta-solicitud');
        const mensaje = urgente ? '⚠ Urgente sin entregar hace 12 h o más'
            : atrasada ? '⚠ Sin entregar hace 48 h o más' : '';
        if (!mensaje) {
            aviso?.remove();
        } else {
            if (!aviso) {
                aviso = document.createElement('span');
                aviso.className = 'alerta-solicitud';
                aviso.setAttribute('role', 'status');
                cabecera.appendChild(aviso);
            }
            if (aviso.textContent !== mensaje) aviso.textContent = mensaje;
        }
    });
    aplicarFiltrosSolicitudes();
}

// Los relojes siguen avanzando incluso sin recargar la página.
// Se omite el trabajo en pestañas ocultas para evitar tareas innecesarias.
setInterval(() => {
    if (!document.hidden) actualizarAlertasEnPantalla();
}, 60 * 1000);
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) actualizarAlertasEnPantalla();
});

// Historial persistente en este navegador, con caducidad y migración de sesión.
// No contiene datos de inventario ni credenciales. En equipos compartidos puede ser visible.
const CLAVE_HISTORIAL_AVISOS = 'bodega_ap_avisos_solicitudes_v1';
const LIMITE_AVISOS = 50;
const VIGENCIA_AVISOS_MS = 30 * 24 * 60 * 60 * 1000;
let filtroAvisos = 'TODAS';
let soloAvisosAccionables = false;
let historialAvisosSolicitudes = [];
function normalizarAvisosGuardados(datos) {
    if (!Array.isArray(datos)) return [];
    const ahora = Date.now();
    return datos.filter(a => {
        if (!a || typeof a.mensaje !== 'string' || typeof a.fecha !== 'string') return false;
        const fecha = Date.parse(a.fecha);
        return Number.isFinite(fecha) && fecha <= ahora && ahora - fecha <= VIGENCIA_AVISOS_MS;
    }).slice(0, LIMITE_AVISOS).map(a => ({
        tipo: String(a.tipo || ''), mensaje: a.mensaje,
        solicitudId: a.solicitudId == null ? null : String(a.solicitudId),
        clave: String(a.clave || ''), fecha: a.fecha, leida: a.leida === true
    }));
}
// La identidad se obtiene de la sesión validada por el servidor, nunca de un
// identificador editable en el navegador. No se migra el historial global:
// hacerlo expondría avisos de otros usuarios en equipos compartidos.
let claveAvisosUsuario = null;
let avisosIdentidadLista = false;
let generacionSesionAvisos = 0;
function limpiarAvisosSesion() {
    generacionSesionAvisos++;
    claveAvisosUsuario = null;
    avisosIdentidadLista = false;
    historialAvisosSolicitudes = [];
    // No reutilizar entregas pendientes del usuario anterior.
    if (typeof entregasParcialesSinConfirmar !== "undefined") entregasParcialesSinConfirmar.clear();
    // Los registros del usuario anterior no deben permanecer visibles.
    rolSolicitudesActual = null;
    aplicarPermisosSolicitudes();
    solicitudesDisponibles = [];
    if (listaSolicitudes) listaSolicitudes.replaceChildren();
    if (typeof actualizarIndicadoresSolicitudes === 'function') actualizarIndicadoresSolicitudes();
    firmaSolicitudesServidor = null;
    sincronizacionPendiente = false;
    document.querySelectorAll('.aviso-nuevas-solicitudes, .aviso-cambios-solicitudes, .aviso-cambios-urgentes').forEach(n => n.remove());
    if (typeof renderizarHistorialAvisos === 'function') renderizarHistorialAvisos();
}
let verificacionSesionEnCurso = null;
function iniciarHistorialAvisosUsuario() {
    if (verificacionSesionEnCurso) return verificacionSesionEnCurso;
    const tarea = verificarHistorialAvisosUsuario();
    verificacionSesionEnCurso = tarea;
    void tarea.finally(() => { if (verificacionSesionEnCurso === tarea) verificacionSesionEnCurso = null; });
    return tarea;
}
async function verificarHistorialAvisosUsuario() {
    const generacionInicio = generacionSesionAvisos;
    try {
        const respuesta = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
        if (!respuesta.ok) {
            if (respuesta.status === 401 || respuesta.status === 403) {
                limpiarAvisosSesion();
            }
            throw new Error('Sesión no disponible');
        }
        const usuario = await respuesta.json();
        if (generacionInicio !== generacionSesionAvisos) return false;
        if (!Number.isSafeInteger(Number(usuario.id)) || Number(usuario.id) <= 0)
            throw new Error('Identidad inválida');
        const clave = `${CLAVE_HISTORIAL_AVISOS}_usuario_${Number(usuario.id)}`;
        if (claveAvisosUsuario !== clave) {
            limpiarAvisosSesion();
            claveAvisosUsuario = clave;
            const guardado = localStorage.getItem(clave);
            historialAvisosSolicitudes = normalizarAvisosGuardados(JSON.parse(guardado || '[]'));
            avisosIdentidadLista = true;
            recuperarEntregasParcialesPendientes();
        }
        rolSolicitudesActual = String(usuario.rol || '').toUpperCase();
        aplicarPermisosSolicitudes();
        avisosIdentidadLista = true;
        guardarHistorialAvisos();
        if (typeof renderizarHistorialAvisos === 'function') renderizarHistorialAvisos();
        return true;
    } catch (_) {
        // No incrementar la generación repetidamente si ya está limpia.
        // Fallos transitorios no equivalen a cerrar sesión. Conservar datos ya cargados.
        return false;
    }
}
function guardarHistorialAvisos() {
    historialAvisosSolicitudes = normalizarAvisosGuardados(historialAvisosSolicitudes);
    if (!avisosIdentidadLista || !claveAvisosUsuario) return;
    try { localStorage.setItem(claveAvisosUsuario, JSON.stringify(historialAvisosSolicitudes)); }
    catch (_) { /* Historial disponible en memoria. */ }
}
void iniciarHistorialAvisosUsuario();

// Evita duplicar el mismo evento detectado en consultas repetidas.
// Las notificaciones urgentes conservan una clasificación explícita.
function registrarAvisoSolicitud(tipo, mensaje, solicitudId = null) {
    if (!avisosIdentidadLista) return;
    const id = solicitudId == null ? null : String(solicitudId);
    const clave = `${tipo}|${id ?? ''}|${mensaje}`;
    const existente = historialAvisosSolicitudes.find(a => a.clave === clave);
    if (existente) return;
    historialAvisosSolicitudes.unshift({ tipo, mensaje, solicitudId: id, clave,
        fecha: new Date().toISOString(), leida: false });
    historialAvisosSolicitudes = historialAvisosSolicitudes.slice(0, LIMITE_AVISOS);
    guardarHistorialAvisos();
    renderizarHistorialAvisos();
}

function avisoEsUrgente(aviso) {
    return String(aviso.tipo || '').toUpperCase().includes('URGENT');
}

// Resaltado temporal accesible al navegar desde una notificación.
let temporizadorResaltadoSolicitud = null;
let tarjetaResaltadaSolicitud = null;
function destacarSolicitudDesdeAviso(tarjeta) {
    if (temporizadorResaltadoSolicitud !== null) clearTimeout(temporizadorResaltadoSolicitud);
    if (tarjetaResaltadaSolicitud) {
        tarjetaResaltadaSolicitud.classList.remove('solicitud-destacada-aviso');
    }
    tarjetaResaltadaSolicitud = tarjeta;
    tarjeta.classList.add('solicitud-destacada-aviso');
    temporizadorResaltadoSolicitud = setTimeout(() => {
        tarjeta.classList.remove('solicitud-destacada-aviso');
        if (tarjetaResaltadaSolicitud === tarjeta) tarjetaResaltadaSolicitud = null;
        temporizadorResaltadoSolicitud = null;
    }, 5000);
}

function instalarEstiloResaltadoSolicitudes() {
    if (document.getElementById('estilo-resaltado-solicitudes')) return;
    const estilo = document.createElement('style');
    estilo.id = 'estilo-resaltado-solicitudes';
    estilo.textContent = `
        .solicitud-destacada-aviso { outline: 3px solid #d97706; outline-offset: 3px; background-color: #fff7ed; transition: background-color .25s ease; }
        @media (prefers-reduced-motion: reduce) { .solicitud-destacada-aviso { transition: none; } }
    `;
    document.head.appendChild(estilo);
}

function irASolicitudDesdeAviso(solicitudId) {
    const id = String(solicitudId);
    const existe = solicitudesDisponibles.some(s => String(s.id) === id);
    if (!existe) {
        window.alert('La solicitud ya no está disponible en el listado actual.');
        return;
    }
    // Mostrar la solicitud incluso si estaba oculta por filtros previos.
    if (filtroEstadoSolicitud) filtroEstadoSolicitud.value = '';
    if (filtroPrioridadSolicitud) filtroPrioridadSolicitud.value = '';
    if (buscarSolicitudRegistrada) buscarSolicitudRegistrada.value = '';
    aplicarFiltrosSolicitudes();
    const tarjeta = [...listaSolicitudes.querySelectorAll('.solicitud-registrada')]
        .find(elemento => elemento.dataset.solicitudId === id);
    if (!tarjeta) return;
    document.getElementById('historial-avisos-solicitudes').hidden = true;
    document.getElementById('boton-historial-avisos')?.setAttribute('aria-expanded', 'false');
    instalarEstiloResaltadoSolicitudes();
    destacarSolicitudDesdeAviso(tarjeta);
    tarjeta.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    tarjeta.setAttribute('tabindex', '-1');
    tarjeta.focus({ preventScroll: true });
}

function avisoRequiereAtencion(aviso) {
    if (aviso.leida || aviso.solicitudId == null) return false;
    const solicitud = solicitudesDisponibles.find(s => String(s.id) === String(aviso.solicitudId));
    return Boolean(solicitud && solicitud.estado !== 'ENTREGADA');
}

function renderizarHistorialAvisos() {
    const panel = document.getElementById('historial-avisos-solicitudes');
    const boton = document.getElementById('boton-historial-avisos');
    if (!panel || !boton) return;
    const sinLeer = historialAvisosSolicitudes.filter(a => !a.leida).length;
    const accionables = historialAvisosSolicitudes.filter(avisoRequiereAtencion).length;
    boton.textContent = `Notificaciones recientes (${sinLeer} sin leer · ${accionables} por atender)`;
    const marcarTodas = document.getElementById('marcar-avisos-leidos');
    if (marcarTodas) marcarTodas.disabled = sinLeer === 0;
    panel.replaceChildren();
    if (!historialAvisosSolicitudes.length) {
        const vacio = document.createElement('p');
        vacio.textContent = 'No hay notificaciones recientes guardadas en este navegador.';
        panel.appendChild(vacio);
        return;
    }
    const lista = document.createElement('ul');
    const visibles = historialAvisosSolicitudes.map((aviso, indice) => ({ aviso, indice })).filter(({ aviso }) =>
        filtroAvisos === 'TODAS' || (filtroAvisos === 'SIN_LEER' && !aviso.leida) ||
        (filtroAvisos === 'URGENTES' && avisoEsUrgente(aviso))
    ).filter(({ aviso }) => !soloAvisosAccionables || avisoRequiereAtencion(aviso));
    if (!visibles.length) {
        const vacioFiltro = document.createElement('p');
        vacioFiltro.textContent = 'No hay notificaciones para este filtro.';
        panel.appendChild(vacioFiltro);
        return;
    }
    visibles.forEach(({ aviso, indice }) => {
        const item = document.createElement('li');
        const fecha = new Date(aviso.fecha);
        const descripcion = document.createElement('span');
        descripcion.textContent = `${aviso.leida ? '' : '● Sin leer — '}${Number.isNaN(fecha.getTime()) ? '' : fecha.toLocaleString('es-CL')} — ${aviso.mensaje}`;
        item.appendChild(descripcion);
        if (avisoEsUrgente(aviso)) {
            const prioridad = document.createElement('strong');
            prioridad.textContent = ' · URGENTE';
            prioridad.style.color = '#9a3412';
            item.appendChild(prioridad);
        }
        if (avisoRequiereAtencion(aviso)) {
            const estado = document.createElement('strong');
            estado.textContent = ' · Por atender';
            item.appendChild(estado);
        }
        if (!aviso.leida) {
            const marcar = document.createElement('button');
            marcar.type = 'button';
            marcar.textContent = 'Marcar como leída';
            marcar.style.marginLeft = '8px';
            marcar.addEventListener('click', () => {
                historialAvisosSolicitudes[indice].leida = true;
                guardarHistorialAvisos();
                renderizarHistorialAvisos();
            });
            item.appendChild(marcar);
        }
        if (aviso.solicitudId != null) {
            const abrir = document.createElement('button');
            abrir.type = 'button';
            abrir.textContent = `Ver solicitud #${aviso.solicitudId}`;
            abrir.style.marginLeft = '8px';
            abrir.addEventListener('click', () => irASolicitudDesdeAviso(aviso.solicitudId));
            item.appendChild(abrir);
        }
        lista.appendChild(item);
    });
    panel.appendChild(lista);
}

function inicializarHistorialAvisos() {
    if (!listaSolicitudes?.parentNode || document.getElementById('boton-historial-avisos')) return;
    const contenedor = document.createElement('div');
    contenedor.style.cssText = 'margin:12px 0';
    const boton = document.createElement('button');
    boton.id = 'boton-historial-avisos';
    boton.type = 'button';
    boton.setAttribute('aria-expanded', 'false');
    const panel = document.createElement('div');
    panel.id = 'historial-avisos-solicitudes';
    panel.hidden = true;
    panel.style.cssText = 'max-height:260px;overflow:auto;padding:10px;border:1px solid #ccc;border-radius:6px;margin-top:8px';
    boton.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        boton.setAttribute('aria-expanded', String(!panel.hidden));
    });
    const marcarTodas = document.createElement('button');
    marcarTodas.id = 'marcar-avisos-leidos';
    marcarTodas.type = 'button';
    marcarTodas.textContent = 'Marcar todas como leídas';
    marcarTodas.style.marginLeft = '8px';
    marcarTodas.addEventListener('click', () => {
        historialAvisosSolicitudes.forEach(a => { a.leida = true; });
        guardarHistorialAvisos();
        renderizarHistorialAvisos();
    });
    const selector = document.createElement('select');
    selector.id = 'filtro-avisos-solicitudes';
    selector.setAttribute('aria-label', 'Filtrar notificaciones');
    selector.style.marginLeft = '8px';
    [['TODAS', 'Todas'], ['SIN_LEER', 'Sin leer'], ['URGENTES', 'Urgentes']].forEach(([valor, texto]) => {
        const opcion = document.createElement('option');
        opcion.value = valor;
        opcion.textContent = texto;
        selector.appendChild(opcion);
    });
    selector.addEventListener('change', () => {
        filtroAvisos = selector.value;
        renderizarHistorialAvisos();
    });
    const filtroAccionables = document.createElement('label');
    filtroAccionables.style.marginLeft = '8px';
    const casilla = document.createElement('input');
    casilla.type = 'checkbox';
    casilla.setAttribute('aria-label', 'Mostrar solo avisos pendientes de atención');
    casilla.addEventListener('change', () => {
        soloAvisosAccionables = casilla.checked;
        renderizarHistorialAvisos();
    });
    filtroAccionables.append(casilla, document.createTextNode(' Solo por atender'));
    contenedor.append(boton, marcarTodas, selector, filtroAccionables, panel);
    listaSolicitudes.parentNode.insertBefore(contenedor, listaSolicitudes);
    renderizarHistorialAvisos();
}
inicializarHistorialAvisos();

// Aviso no intrusivo para nuevas solicitudes detectadas desde otro usuario.
let idsSolicitudesConocidas = null;
function avisarSolicitudesNuevas(solicitudes) {
    const idsActuales = new Set(solicitudes.map(s => String(s.id)));
    if (idsSolicitudesConocidas === null) {
        idsSolicitudesConocidas = idsActuales;
        return; // No anunciar solicitudes antiguas al entrar por primera vez.
    }
    const nuevas = solicitudes.filter(s => !idsSolicitudesConocidas.has(String(s.id)));
    idsSolicitudesConocidas = idsActuales;
    if (!nuevas.length || !listaSolicitudes) return;
    let aviso = document.getElementById('aviso-nuevas-solicitudes');
    if (!aviso) {
        aviso = document.createElement('div');
        aviso.id = 'aviso-nuevas-solicitudes';
        aviso.setAttribute('role', 'status');
        aviso.setAttribute('aria-live', 'polite');
        aviso.style.cssText = 'padding:12px;margin:12px 0;border:1px solid #d7a73c;border-radius:8px;background:#fff8e7;color:#493600;display:flex;gap:12px;align-items:center;flex-wrap:wrap';
        const mensaje = document.createElement('span');
        mensaje.className = 'mensaje-aviso-solicitudes';
        aviso.appendChild(mensaje);
        const cerrar = document.createElement('button');
        cerrar.type = 'button';
        cerrar.textContent = 'Cerrar aviso';
        cerrar.addEventListener('click', () => aviso.remove());
        aviso.appendChild(cerrar);
        listaSolicitudes.parentNode.insertBefore(aviso, listaSolicitudes);
    }
    const urgentes = nuevas.filter(s => s.prioridad === 'URGENTE').length;
    aviso.querySelector('.mensaje-aviso-solicitudes').textContent =
        `${nuevas.length} solicitud(es) nueva(s) recibida(s).` +
        (urgentes ? ` ${urgentes} urgente(s) requieren atención.` : '');
    nuevas.forEach(s => registrarAvisoSolicitud(s.prioridad === 'URGENTE' ? 'URGENTE_NUEVA' : 'NUEVA', `Nueva solicitud #${s.id}${s.prioridad === 'URGENTE' ? ' (urgente)' : ''}.`, s.id));
}

// Cambios de estado detectados entre consultas, sin anunciar el primer listado.
let estadosSolicitudesConocidos = null;
function avisarCambiosEstadoSolicitudes(solicitudes) {
    const actuales = new Map(solicitudes.map(s => [String(s.id), String(s.estado || '')]));
    if (estadosSolicitudesConocidos === null) {
        estadosSolicitudesConocidos = actuales;
        return;
    }
    const cambios = solicitudes.filter(s => {
        const id = String(s.id);
        return estadosSolicitudesConocidos.has(id) &&
            estadosSolicitudesConocidos.get(id) !== String(s.estado || '');
    }).map(s => ({ id: String(s.id), anterior: estadosSolicitudesConocidos.get(String(s.id)), actual: String(s.estado || '') }));
    estadosSolicitudesConocidos = actuales;
    if (!cambios.length || !listaSolicitudes?.parentNode) return;
    let aviso = document.getElementById('aviso-cambios-estado-solicitudes');
    if (!aviso) {
        aviso = document.createElement('div');
        aviso.id = 'aviso-cambios-estado-solicitudes';
        aviso.setAttribute('role', 'status');
        aviso.setAttribute('aria-live', 'polite');
        aviso.style.cssText = 'padding:12px;margin:12px 0;border:1px solid #8aa9d0;border-radius:8px;background:#eef5ff;color:#173a63;display:flex;gap:12px;align-items:center;flex-wrap:wrap';
        const mensaje = document.createElement('span');
        mensaje.className = 'mensaje-cambios-estado-solicitudes';
        aviso.appendChild(mensaje);
        const cerrar = document.createElement('button');
        cerrar.type = 'button';
        cerrar.textContent = 'Cerrar aviso';
        cerrar.addEventListener('click', () => aviso.remove());
        aviso.appendChild(cerrar);
        listaSolicitudes.parentNode.insertBefore(aviso, listaSolicitudes);
    }
    const entregadas = cambios.filter(c => c.actual === 'ENTREGADA').length;
    const preparacion = cambios.filter(c => c.actual === 'EN PREPARACIÓN').length;
    const resumen = [`${cambios.length} solicitud(es) cambiaron de estado.`];
    if (preparacion) resumen.push(`${preparacion} en preparación.`);
    if (entregadas) resumen.push(`${entregadas} entregada(s).`);
    if (cambios.length === 1) resumen.push(`Solicitud #${cambios[0].id}: ${cambios[0].anterior} → ${cambios[0].actual}.`);
    aviso.querySelector('.mensaje-cambios-estado-solicitudes').textContent = resumen.join(' ');
    cambios.forEach(c => registrarAvisoSolicitud(solicitudes.find(s => String(s.id) === c.id)?.prioridad === 'URGENTE' ? 'URGENTE_ESTADO' : 'ESTADO', `Solicitud #${c.id}: ${c.anterior} → ${c.actual}.`, c.id));
    // Diferenciar los cambios urgentes sin bloquear el trabajo en pantalla.
    const urgentes = cambios.filter(c => {
        const solicitud = solicitudes.find(s => String(s.id) === c.id);
        return solicitud?.prioridad === 'URGENTE' && c.actual !== 'ENTREGADA';
    });
    let avisoUrgente = document.getElementById('aviso-cambios-urgentes');
    if (!urgentes.length) {
        if (avisoUrgente) avisoUrgente.remove();
        return;
    }
    if (!avisoUrgente) {
        avisoUrgente = document.createElement('div');
        avisoUrgente.id = 'aviso-cambios-urgentes';
        avisoUrgente.setAttribute('role', 'alert');
        avisoUrgente.style.cssText = 'padding:12px;margin:12px 0;border:2px solid #b45309;border-radius:8px;background:#fff3dc;color:#78350f;display:flex;gap:12px;align-items:center;flex-wrap:wrap';
        const mensajeUrgente = document.createElement('span');
        mensajeUrgente.className = 'mensaje-cambios-urgentes';
        avisoUrgente.appendChild(mensajeUrgente);
        const cerrarUrgente = document.createElement('button');
        cerrarUrgente.type = 'button';
        cerrarUrgente.textContent = 'Cerrar aviso';
        cerrarUrgente.addEventListener('click', () => avisoUrgente.remove());
        avisoUrgente.appendChild(cerrarUrgente);
        listaSolicitudes.parentNode.insertBefore(avisoUrgente, listaSolicitudes);
    }
    avisoUrgente.querySelector('.mensaje-cambios-urgentes').textContent =
        `⚠ ${urgentes.length} solicitud(es) urgente(s) cambiaron de estado y siguen sin entregar.` +
        (urgentes.length === 1 ? ` Solicitud #${urgentes[0].id}: ${urgentes[0].anterior} → ${urgentes[0].actual}.` : '');
    // El cambio urgente ya fue registrado arriba; evitar un segundo aviso histórico.
}

// Sincronización entre usuarios: consultar cambios del servidor sin interrumpir ediciones.
let sincronizacionSolicitudesEnCurso = false;
let firmaSolicitudesServidor = null;
let sincronizacionPendiente = false;

async function sincronizarSolicitudesRemotas() {
    if (document.hidden || sincronizacionSolicitudesEnCurso) return;
    sincronizacionSolicitudesEnCurso = true;
    try {
        if (!await iniciarHistorialAvisosUsuario()) return;
        const generacionConsulta = generacionSesionAvisos;
        const respuesta = await fetch('/api/solicitudes', { cache: 'no-store' });
        if (!respuesta.ok) return; // Conservar datos existentes ante fallos de red.
        const datos = await respuesta.json();
        if (generacionConsulta !== generacionSesionAvisos || !avisosIdentidadLista) return;
        if (!Array.isArray(datos)) return;
        const firma = JSON.stringify(datos);
        if (firmaSolicitudesServidor === null) {
            firmaSolicitudesServidor = JSON.stringify(solicitudesDisponibles);
        }
        if (firma === firmaSolicitudesServidor && !sincronizacionPendiente) return;
        // No reemplazar controles o detalles que un usuario está manipulando.
        if (listaSolicitudes?.contains(document.activeElement) &&
            document.activeElement?.matches('input, select, textarea, button')) {
            sincronizacionPendiente = true;
            return;
        }
        await cargarSolicitudes(generacionConsulta);
        sincronizacionPendiente = false;
    } catch (error) {
        console.warn('No se pudo sincronizar solicitudes; se conservan los datos actuales.', error);
    } finally {
        sincronizacionSolicitudesEnCurso = false;
    }
}

setInterval(sincronizarSolicitudesRemotas, 60 * 1000);
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) sincronizarSolicitudesRemotas();
});

// ===============================
// CARGAR SUPERVISORES
// ===============================

async function cargarSupervisores() {

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

        const supervisores =
            personal.filter(
                function (persona) {

                    return (
                        persona.estado === "ACTIVO" &&
                        persona.cargo === "SUPERVISOR"
                    );
                }
            );

        supervisorSolicitud.innerHTML = `
            <option value="">
                Selecciona un supervisor
            </option>
        `;

        supervisores.forEach(
            function (supervisor) {

                const opcion =
                    document.createElement(
                        "option"
                    );

                opcion.value =
                    supervisor.id;

                opcion.textContent =
                    supervisor.nombre;

                supervisorSolicitud.appendChild(
                    opcion
                );
            }
        );

    } catch (error) {

        console.error(
            "Error al cargar supervisores:",
            error
        );
    }
}

// ===============================
// CARGAR TÉCNICOS Y ASISTENTES
// ===============================

async function cargarPersonalDestino() {

    try {

        const respuesta =
            await fetch("/api/personal");

        const personal =
            await respuesta.json();

        if (!respuesta.ok) {

            console.error(
                "Error al cargar personal:",
                personal
            );

            return;
        }

        const disponibles =
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

        personalDestinoSolicitud.innerHTML = `
            <option value="">
                Selecciona técnico o asistente
            </option>
        `;

        disponibles.forEach(
            function (persona) {

                const opcion =
                    document.createElement(
                        "option"
                    );

                opcion.value =
                    persona.id;

                opcion.textContent =
                    `${persona.nombre} — ${persona.cargo}`;

                personalDestinoSolicitud.appendChild(
                    opcion
                );
            }
        );

    } catch (error) {

        console.error(
            "Error al cargar técnicos y asistentes:",
            error
        );
    }
}


// ===============================
// CARGAR PRODUCTOS
// ===============================

async function cargarProductos() {

    try {

        const respuesta = await fetch(
            "/api/productos"
        );

        const productos =
            await respuesta.json();

        if (!respuesta.ok) {

            console.error(
                "Error al cargar productos:",
                productos
            );

            return;
        }

        productosDisponibles =
            productos;

        // La disponibilidad es informativa; el servidor valida stock al entregar.
        try {
            const respuestaStock = await fetch("/api/productos/disponibilidad");
            if (respuestaStock.ok) {
                const filas = await respuestaStock.json();
                disponibilidadProductos = new Map(filas.map(f => [Number(f.productoId), f]));
            }
        } catch (errorStock) {
            console.warn("Disponibilidad no disponible", errorStock);
        }

        // No reutilizar cifras de una consulta anterior si la nueva falla.
        stockPorBodega = new Map();
        try {
            const respuestaBodegas = await fetch("/api/productos/disponibilidad-bodegas", { cache: "no-store" });
            if (respuestaBodegas.ok) {
                const filasBodegas = await respuestaBodegas.json();
                stockPorBodega = new Map();
                for (const fila of filasBodegas) {
                    const id = Number(fila.productoId);
                    if (!stockPorBodega.has(id)) stockPorBodega.set(id, []);
                    stockPorBodega.get(id).push(fila);
                }
            }
        } catch (errorBodegas) {
            console.warn("Desglose por bodega no disponible", errorBodegas);
        }

        console.log(
            "Productos cargados:",
            productosDisponibles
        );

    } catch (error) {

        console.error(
            "Error al cargar productos:",
            error
        );
    }
}


// ===============================
// BUSCAR PRODUCTOS
// ===============================

buscarProductoSolicitud.addEventListener(
    "input",
    function () {

        const texto =
            buscarProductoSolicitud.value
                .trim()
                .toLowerCase();

        // Si vuelve a escribir,
        // se elimina la selección anterior
        productoSolicitud.value = "";

        if (!texto) {

            resultadosProductos.innerHTML =
                "";

            return;
        }

        const coincidencias =
            productosDisponibles.filter(
                function (producto) {

                    const codigo =
                        String(
                            producto.codigo
                        ).toLowerCase();

                    const nombre =
                        String(
                            producto.nombre
                        ).toLowerCase();

                    return (
                        codigo.includes(texto) ||
                        nombre.includes(texto)
                    );
                }
            );

        resultadosProductos.innerHTML = "";

        if (coincidencias.length === 0) {

            resultadosProductos.innerHTML = `
                <p>
                    No se encontraron productos.
                </p>
            `;

            return;
        }

        coincidencias
            .slice(0, 10)
            .forEach(
                function (producto) {

                    const boton =
                        document.createElement(
                            "button"
                        );

                    boton.type = "button";

                    boton.className =
                        "resultado-producto";

                    const stock = disponibilidadProductos.get(Number(producto.id));
                    const etiquetaStock = stock && stock.libre !== null
                        ? ` | Libre: ${stock.libre} / Reservado: ${stock.reservado}`
                        : " | Disponibilidad no consultada";
                    boton.textContent =
                        `${producto.codigo} — ${producto.nombre}${etiquetaStock}`;

                    boton.addEventListener(
                        "click",
                        function () {

                            productoSolicitud.value =
                                producto.id;

                            buscarProductoSolicitud.value =
                                `${producto.codigo} — ${producto.nombre}`;

                            resultadosProductos.innerHTML =
                                "";
                        }
                    );

                    resultadosProductos.appendChild(
                        boton
                    );
                }
            );
    }
);


// ===============================
// MOSTRAR PRODUCTOS SOLICITADOS
// ===============================

function mostrarDetalleSolicitud() {

    if (detalleSolicitud.length === 0) {

        productosSolicitud.innerHTML = `
            <p>
                Todavía no hay productos agregados.
            </p>
        `;

        return;
    }

    let contenido = "";

    detalleSolicitud.forEach(
        function (item, indice) {

            const stock = disponibilidadProductos.get(Number(item.productoId));
            const libre = stock && stock.libre !== null ? Number(stock.libre) : null;
            const faltante = libre !== null && item.cantidad > libre;
            const bodegas = stockPorBodega.get(Number(item.productoId)) || [];
            const stockBodega = bodegaProyectoSeleccionada === null ? null :
                bodegas.find(b => Number(b.bodega) === bodegaProyectoSeleccionada);
            const fisicoProyecto = stockBodega ? Number(stockBodega.total) : 0;
            const faltaEnBodega = bodegaProyectoSeleccionada !== null && stockProyectoConsultado && item.cantidad > fisicoProyecto;
            const detalleBodegas = bodegaProyectoSeleccionada === null
                ? "Selecciona un proyecto para consultar su bodega"
                : `Bodega ${bodegaProyectoSeleccionada}: ${stockProyectoConsultado ? `${fisicoProyecto} unidades físicas` : "disponibilidad no verificada"}`;
            const advertencia = bodegaProyectoSeleccionada !== null && faltaEnBodega
                ? `<p role="status" style="color:#a33"><strong>Reposición necesaria en la bodega del proyecto:</strong> ${fisicoProyecto} unidades físicas, solicitadas ${item.cantidad}. La solicitud puede quedar pendiente de reposición.</p>`
                : (faltante ? `<p role="status" style="color:#a33">Stock libre general insuficiente. Puedes solicitar reposición.</p>` : "");

            contenido += `
                <div class="tarjeta">

                    <p>
                        <strong>
                            ${item.nombre}
                        </strong>
                    </p>

                    <p>Stock libre: ${libre === null ? "No consultada" : libre}</p>
                    <p>Disponibilidad de la bodega del proyecto: ${detalleBodegas}</p>
                    ${advertencia}

                    <label>
                        Cantidad solicitada
                        <input type="number" class="cantidad-detalle-solicitud"
                            data-indice="${indice}" min="1" step="1"
                            value="${item.cantidad}" aria-label="Cantidad del producto ${indice + 1}">
                    </label>

                    <button
                        type="button"
                        class="boton-eliminar-producto"
                        data-indice="${indice}"
                    >
                        Quitar
                    </button>

                </div>
            `;
        }
    );

    productosSolicitud.innerHTML =
        contenido;
}


// ===============================
// AGREGAR PRODUCTO
// ===============================

botonAgregarProducto.addEventListener(
    "click",
    function () {

        const productoId =
            Number(
                productoSolicitud.value
            );

        const cantidad =
            Number(
                cantidadSolicitud.value
            );

        if (!productoId) {

            alert(
                "Debes buscar y seleccionar un producto."
            );

            return;
        }

        if (!Number.isSafeInteger(cantidad) || cantidad <= 0) {

            alert(
                "Debes indicar una cantidad válida."
            );

            return;
        }

        const producto =
            productosDisponibles.find(
                function (item) {

                    return (
                        Number(item.id) ===
                        productoId
                    );
                }
            );

        if (!producto) {

            alert(
                "No se pudo identificar el producto seleccionado."
            );

            return;
        }

        // Revisar si ya fue agregado
        const productoExistente =
            detalleSolicitud.find(
                function (item) {

                    return (
                        item.productoId ===
                        productoId
                    );
                }
            );

        if (productoExistente) {

            productoExistente.cantidad +=
                cantidad;

        } else {

            detalleSolicitud.push({

                productoId:
                    productoId,

                nombre:
                    `${producto.codigo} — ${producto.nombre}`,

                cantidad:
                    cantidad
            });
        }

        if (!Number.isSafeInteger(detalleSolicitud.find(item => item.productoId === productoId).cantidad)) {
            if (productoExistente) productoExistente.cantidad -= cantidad;
            else detalleSolicitud = detalleSolicitud.filter(item => item.productoId !== productoId);
            alert("La cantidad total excede el máximo permitido.");
            return;
        }
        mostrarDetalleSolicitud();

        // Limpiar para buscar otro producto
        productoSolicitud.value = "";

        buscarProductoSolicitud.value =
            "";

        resultadosProductos.innerHTML =
            "";

        cantidadSolicitud.value = 1;
    }
);


// ===============================
// QUITAR PRODUCTO
// ===============================

productosSolicitud.addEventListener(
    "click",
    function (evento) {

        if (
            !evento.target.classList.contains(
                "boton-eliminar-producto"
            )
        ) {
            return;
        }

        const indice =
            Number(
                evento.target.dataset.indice
            );

        detalleSolicitud.splice(
            indice,
            1
        );

        mostrarDetalleSolicitud();
    }
);


// Permitir corregir cantidades antes de enviar, sin eliminar y agregar de nuevo.
productosSolicitud.addEventListener("change", function (evento) {
    if (!evento.target.classList.contains("cantidad-detalle-solicitud")) return;
    const indice = Number(evento.target.dataset.indice);
    const cantidad = Number(evento.target.value);
    if (!Number.isSafeInteger(indice) || indice < 0 || indice >= detalleSolicitud.length) return;
    if (!Number.isSafeInteger(cantidad) || cantidad <= 0) {
        alert("La cantidad debe ser un número entero mayor que cero.");
        evento.target.value = detalleSolicitud[indice].cantidad;
        return;
    }
    detalleSolicitud[indice].cantidad = cantidad;
    mostrarDetalleSolicitud();
});

// ===============================
// CREAR SOLICITUD
// ===============================

formSolicitud.addEventListener(
    "submit",
    async function (evento) {

        evento.preventDefault();
        if (!puedeCrearSolicitud()) return alert('Tu perfil no puede crear solicitudes.');
        if (creandoSolicitud) return;

        if (!supervisorSolicitud.value) {

            alert(
                "Debes seleccionar un supervisor."
            );

            return;
        }

        const proyectoSeleccionado = document.getElementById("proyectoSolicitud");
        if (!proyectoSeleccionado || !proyectoSeleccionado.value) {
            alert("Selecciona el proyecto antes de crear la solicitud. La bodega se vinculará al proyecto.");
            proyectoSeleccionado?.focus();
            return;
        }

        if (!personalDestinoSolicitud.value) {
            alert(
                "Debes seleccionar para quién es la solicitud."
            );
            return;
        }

        if (detalleSolicitud.length === 0) {

            alert(
                "Debes agregar al menos un producto."
            );

            return;
        }

        // Validar nuevamente todas las cantidades antes de enviar.
        if (detalleSolicitud.some(item => !Number.isSafeInteger(item.cantidad) || item.cantidad <= 0)) {
            alert("Revisa las cantidades de los productos solicitados.");
            return;
        }

        const datos = {

            supervisorId:
                Number(
                    supervisorSolicitud.value
                ),

            personalDestinoId:
                Number(personalDestinoSolicitud.value),

            proyectoId: document.getElementById("proyectoSolicitud").value || null,

            prioridad: document.getElementById("prioridadSolicitud").value,

            observaciones:
                observacionesSolicitud.value.trim(),

            productos:
                detalleSolicitud.map(
                    function (item) {

                        return {
                            productoId:
                                item.productoId,

                            cantidad:
                                item.cantidad
                        };
                    }
                )
        };

        // Reutilizar la clave solo para un reintento con contenido idéntico.
        // Si el usuario cambia proyecto, destinatario o productos tras un fallo
        // de red, la nueva solicitud no debe confundirse con la anterior.
        const contenidoSolicitud = JSON.stringify(datos);
        if (window.contenidoSolicitudPendiente !== contenidoSolicitud) {
            window.claveSolicitudPendiente = null;
            window.contenidoSolicitudPendiente = contenidoSolicitud;
        }
        if (!window.claveSolicitudPendiente) {
            // getRandomValues permite generar la clave también en navegadores sin randomUUID.
            const bytes = new Uint8Array(16);
            crypto.getRandomValues(bytes);
            window.claveSolicitudPendiente = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        }
        creandoSolicitud = true;
        botonCrearSolicitud.disabled = true;
        botonCrearSolicitud.textContent = "Guardando solicitud...";
        if (estadoCreacionSolicitud) estadoCreacionSolicitud.textContent = "Guardando solicitud, espera un momento...";

        try {

            const respuesta = await fetch(
                "/api/solicitudes",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",
                        "Idempotency-Key": window.claveSolicitudPendiente
                    },

                    body:
                        contenidoSolicitud
                }
            );

            const resultado =
                await respuesta.json();

            if (!respuesta.ok) {

                // Un rechazo definitivo (datos o permisos) no creó la solicitud.
                // Usar una clave nueva al corregir el formulario; conservarla ante
                // errores transitorios, cuyo resultado podría ser incierto.
                if (respuesta.status >= 400 && respuesta.status < 500 &&
                    respuesta.status !== 409 && respuesta.status !== 429) {
                    window.claveSolicitudPendiente = null;
                    window.contenidoSolicitudPendiente = null;
                }
                alert(resultado.mensaje || "No se pudo guardar la solicitud.");
                if (estadoCreacionSolicitud) estadoCreacionSolicitud.textContent = resultado.mensaje || "No se pudo guardar la solicitud.";
                return;
            }

            alert(
                resultado.mensaje
            );

            window.claveSolicitudPendiente = null;
            window.contenidoSolicitudPendiente = null;
            // Limpiar solicitud
            detalleSolicitud = [];

            mostrarDetalleSolicitud();

            buscarProductoSolicitud.value =
                "";

            productoSolicitud.value =
                "";

            cantidadSolicitud.value = 1;

            observacionesSolicitud.value =
                "";
            if (estadoCreacionSolicitud) estadoCreacionSolicitud.textContent = `Solicitud #${resultado.solicitudId} creada correctamente.`;
            await cargarSolicitudes();

        } catch (error) {

            console.error(
                "Error al crear solicitud:",
                error
            );

            alert("No se pudo confirmar la creación. Revisa el listado antes de reintentar para evitar duplicados.");
            if (estadoCreacionSolicitud) estadoCreacionSolicitud.textContent = "No se pudo confirmar el resultado. Comprueba el listado antes de reintentar.";
        } finally {
            creandoSolicitud = false;
            botonCrearSolicitud.disabled = false;
            botonCrearSolicitud.textContent = "Crear solicitud";
        }
    }
);

// ===============================
// CARGAR SOLICITUDES
// ===============================

let versionCargaSolicitudes = 0;
let reintentoCargaSolicitudes = null;
function mostrarErrorCargaSolicitudes(mensaje) {
    let aviso = document.getElementById('error-carga-solicitudes');
    if (!aviso) {
        aviso = document.createElement('div');
        aviso.id = 'error-carga-solicitudes';
        aviso.setAttribute('role', 'alert');
        aviso.style.cssText = 'padding:12px;margin:10px 0;border:1px solid #b45309;border-radius:8px;background:#fff8e7;color:#713f12';
        listaSolicitudes.parentNode.insertBefore(aviso, listaSolicitudes);
    }
    aviso.replaceChildren(document.createTextNode(mensaje + ' '));
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.textContent = 'Reintentar';
    boton.addEventListener('click', () => cargarSolicitudes());
    aviso.appendChild(boton);
}
function limpiarErrorCargaSolicitudes() {
    document.getElementById('error-carga-solicitudes')?.remove();
}
async function cargarSolicitudes(generacionEsperada = null) {
    const versionActual = ++versionCargaSolicitudes;

    try {
        if (!await iniciarHistorialAvisosUsuario()) {
            if (versionActual === versionCargaSolicitudes) mostrarErrorCargaSolicitudes('No se pudo verificar la sesión para cargar solicitudes.');
            return;
        }
        const generacionCarga = generacionSesionAvisos;
        if (generacionEsperada !== null && generacionEsperada !== generacionCarga) return;

        const respuesta = await fetch('/api/solicitudes', { cache: 'no-store', credentials: 'same-origin' });
        if (!respuesta.ok) throw new Error(`Error HTTP ${respuesta.status} al consultar solicitudes`);
        const solicitudes = await respuesta.json();
        if (!Array.isArray(solicitudes)) throw new Error('Respuesta de solicitudes inválida');
        // Una respuesta anterior al cambio de sesión nunca puede pintar datos.
        if (versionActual !== versionCargaSolicitudes || generacionCarga !== generacionSesionAvisos || !avisosIdentidadLista) return;
        solicitudesDisponibles = solicitudes;
        limpiarErrorCargaSolicitudes();
        if (respuesta.ok && Array.isArray(solicitudes)) {
            firmaSolicitudesServidor = JSON.stringify(solicitudes);
        }
        if (respuesta.ok && Array.isArray(solicitudes)) {
            avisarSolicitudesNuevas(solicitudes);
            avisarCambiosEstadoSolicitudes(solicitudes);
        }
        actualizarIndicadoresSolicitudes();

        if (solicitudes.length === 0) {

            listaSolicitudes.innerHTML = `
                <p>
                    Todavía no hay solicitudes registradas.
                </p>
            `;
            aplicarFiltrosSolicitudes();
            return;
        }

        let contenido = "";
        // Los nombres de proyectos vienen de la base de datos y se muestran como texto.
        const escaparProyecto = valor => String(valor ?? '').replace(/[&<>"']/g, caracter => ({
            '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
        }[caracter]));

        solicitudes.forEach(
            function (solicitud) {

                let productos = "";

                solicitud.productos.forEach(
                    function (producto) {

                        productos += `
                            <div class="producto-solicitud-registrada">

                                <strong>
                                    ${producto.codigo} — ${producto.nombre}
                                </strong>

                                <span>
                                    Cantidad: ${producto.cantidad}
                                </span>

                            </div>
                        `;
                    }
                );

                contenido += `
                    <div class="tarjeta solicitud-registrada" data-solicitud-id="${solicitud.id}" data-estado="${escaparProyecto(solicitud.estado)}" data-atrasada="${solicitudAtrasada(solicitud)}" data-urgente-atrasada="${solicitudUrgenteAtrasada(solicitud)}" data-prioridad="${escaparProyecto(solicitud.prioridad || 'NORMAL')}">

                        <div class="cabecera-solicitud">

                            <h3>
                                Solicitud #${solicitud.id}
                            </h3>

                            <span class="prioridad-solicitud">Prioridad: ${escaparProyecto(solicitud.prioridad || 'NORMAL')}</span>
                            ${solicitud.estado === 'PENDIENTE' && puedeCambiarPrioridad() ? `<div class="control-prioridad"><label>Cambiar prioridad <select class="selector-prioridad" data-id="${solicitud.id}"><option value="NORMAL" ${(!solicitud.prioridad || solicitud.prioridad === 'NORMAL') ? 'selected' : ''}>Normal</option><option value="ALTA" ${solicitud.prioridad === 'ALTA' ? 'selected' : ''}>Alta</option><option value="URGENTE" ${solicitud.prioridad === 'URGENTE' ? 'selected' : ''}>Urgente</option></select></label></div>` : ''}
                            <span class="estado-solicitud">
                                ${escaparProyecto(solicitud.estado)}
                            </span>
                            ${solicitudUrgenteAtrasada(solicitud) ? '<span class="alerta-solicitud" role="status">⚠ Urgente sin entregar hace 12 h o más</span>' : (solicitudAtrasada(solicitud) ? '<span class="alerta-solicitud">⚠ Sin entregar hace 48 h o más</span>' : '')}

                        </div>

                        <p>
                            <strong>Supervisor:</strong>
                            ${solicitud.supervisor}
                        </p>

                        <p>
                            <strong>Solicitado para:</strong>
${solicitud.personalDestino
                        ? `  ${solicitud.personalDestino} — ${solicitud.personalDestinoCargo}`
                        : "No registrado"
                    }
                        </p>

                        <p>
                            <strong>Fecha:</strong>
                            ${solicitud.fechaSolicitud}
                        </p>
                        <p>
                            <strong>Proyecto:</strong>
                            ${solicitud.proyectoId
                                ? `${escaparProyecto(solicitud.proyectoCodigo || solicitud.proyectoId)} — ${escaparProyecto(solicitud.proyectoNombre || 'Sin nombre')}`
                                : 'Sin proyecto asociado'}
                        </p>

                        <div class="productos-solicitud-registrada">

                            <strong>
                                Productos solicitados:
                            </strong>

                            ${productos}

                        </div>

                        ${solicitud.estado === "PENDIENTE" && puedeGestionarEntrega()
                        ? `
            <button
                type="button"
                class="boton-iniciar-preparacion"
                data-id="${solicitud.id}"
            >
                Iniciar preparación
            </button>
        `
                        : ""
                    }

${solicitud.estado === "EN PREPARACIÓN" && puedeGestionarEntrega()
                        ? `
            <button
                type="button"
                class="boton-preparar-entrega"
                data-id="${solicitud.id}"
            >
                Preparar entrega
            </button>
        `
                        : ""
                    }

                        ${solicitud.observaciones
                        ? `
                                    <p>
                                        <strong>Observaciones:</strong>
                                        ${solicitud.observaciones}
                                    </p>
                                `
                        : ""
                    }

                        <div class="historial-solicitud-contenedor">
                            <button type="button" class="boton-ver-historial" data-id="${solicitud.id}" aria-expanded="false">
                                Ver historial de preparación y entrega
                            </button>
                            <div class="historial-solicitud" hidden aria-live="polite"></div>
                        </div>
                        <div class="historial-entregas-parciales-contenedor">
                            <button type="button" class="boton-historial-entregas-parciales" data-id="${solicitud.id}" aria-expanded="false">Ver entregas parciales</button>
                            <div class="historial-entregas-parciales" hidden aria-live="polite"></div>
                        </div>
                        <div class="historial-prioridad-contenedor">
                            <button type="button" class="boton-historial-prioridad" data-id="${solicitud.id}" aria-expanded="false">Ver cambios de prioridad</button>
                            <div class="historial-prioridad" hidden aria-live="polite"></div>
                        </div>
                    </div>
                `;
            }
        );

        listaSolicitudes.innerHTML =
            contenido;
        aplicarFiltrosSolicitudes();

    } catch (error) {
        console.error('Error al cargar solicitudes:', error);
        if (versionActual === versionCargaSolicitudes) {
            mostrarErrorCargaSolicitudes('No se pudieron actualizar las solicitudes. Se conservarán los datos visibles.');
        }
    }
}

// Exportación local del historial: evita inyección de fórmulas en hojas de cálculo.
function celdaCsvHistorial(valor) {
    let texto = String(valor ?? '');
    if (/^[\s]*[=+@\-]/.test(texto)) texto = "'" + texto;
    return '"' + texto.replace(/"/g, '""') + '"';
}

function descargarCsvHistorial(id, registros) {
    const encabezado = ['Solicitud', 'Acción', 'Fecha', 'Usuario'];
    const filas = registros.map(r => [id, r.accion, r.fecha, r.usuario || 'Usuario no disponible']);
    const csv = '\uFEFF' + [encabezado, ...filas].map(fila => fila.map(celdaCsvHistorial).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `historial-solicitud-${id}.csv`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
}

// Historial de cada solicitud: consulta bajo demanda, sin modificar su estado.
function escaparHistorial(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, caracter => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[caracter]));
}

listaSolicitudes.addEventListener('click', async evento => {
    const boton = evento.target.closest('.boton-ver-historial');
    if (!boton) return;
    const tarjeta = boton.closest('.solicitud-registrada');
    const panel = tarjeta?.querySelector('.historial-solicitud');
    if (!panel) return;
    if (!panel.hidden) {
        panel.hidden = true;
        boton.setAttribute('aria-expanded', 'false');
        boton.textContent = 'Ver historial de preparación y entrega';
        return;
    }
    panel.hidden = false;
    boton.setAttribute('aria-expanded', 'true');
    boton.textContent = 'Ocultar historial';
    panel.textContent = 'Cargando historial...';
    boton.disabled = true;
    try {
        const respuesta = await fetch(`/api/solicitudes/${encodeURIComponent(boton.dataset.id)}/historial`);
        if (!respuesta.ok) throw new Error('No se pudo consultar el historial.');
        const registros = await respuesta.json();
        if (!Array.isArray(registros)) throw new Error('Respuesta de historial no válida.');
        if (!registros.length) {
            panel.textContent = 'Aún no hay eventos de preparación o entrega registrados.';
        } else {
            const lista = document.createElement('ol');
            registros.forEach(registro => {
                const item = document.createElement('li');
                const accion = registro.accion === 'ENTREGA' ? 'Entrega confirmada' :
                    registro.accion === 'PREPARACION' ? 'Preparación iniciada' : String(registro.accion || 'Acción');
                const fecha = registro.fecha ? new Date(registro.fecha.replace(' ', 'T') + (/[zZ]|[+-]\d\d:\d\d$/.test(registro.fecha) ? '' : 'Z')) : null;
                const fechaTexto = fecha && !Number.isNaN(fecha.getTime())
                    ? fecha.toLocaleString('es-CL') : (registro.fecha || 'Fecha no disponible');
                item.innerHTML = `<strong>${escaparHistorial(accion)}</strong> — ${escaparHistorial(fechaTexto)} — ${escaparHistorial(registro.usuario || 'Usuario no disponible')}`;
                lista.appendChild(item);
            });
            const controles = document.createElement('div');
            const actualizar = document.createElement('button');
            actualizar.type = 'button';
            actualizar.textContent = 'Actualizar historial';
            actualizar.addEventListener('click', () => {
                panel.hidden = true;
                boton.setAttribute('aria-expanded', 'false');
                boton.click();
            });
            const exportar = document.createElement('button');
            exportar.type = 'button';
            exportar.textContent = 'Exportar historial CSV';
            exportar.addEventListener('click', () => descargarCsvHistorial(boton.dataset.id, registros));
            controles.append(actualizar, exportar);
            panel.replaceChildren(lista, controles);
        }
    } catch (error) {
        panel.textContent = error.message || 'Error al cargar el historial.';
    } finally {
        boton.disabled = false;
    }
});

// Detalle de entregas parciales consultado al servidor y renderizado sin HTML dinámico.
listaSolicitudes.addEventListener('click', async evento => {
    const boton = evento.target.closest('.boton-historial-entregas-parciales');
    if (!boton || !listaSolicitudes.contains(boton)) return;
    const panel = boton.closest('.historial-entregas-parciales-contenedor')?.querySelector('.historial-entregas-parciales');
    if (!panel) return;
    if (!panel.hidden) {
        panel.hidden = true;
        boton.setAttribute('aria-expanded', 'false');
        boton.textContent = 'Ver entregas parciales';
        return;
    }
    panel.hidden = false;
    boton.setAttribute('aria-expanded', 'true');
    boton.textContent = 'Ocultar entregas parciales';
    panel.textContent = 'Cargando entregas parciales...';
    boton.disabled = true;
    try {
        const id = Number(boton.dataset.id);
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Solicitud inválida.');
        const respuesta = await fetch(`/api/solicitudes/${id}/entregas-parciales`);
        if (!respuesta.ok) throw new Error('No se pudieron consultar las entregas parciales.');
        const datos = await respuesta.json();
        if (Number(datos.solicitudId) !== id || !Array.isArray(datos.entregas)) throw new Error('Respuesta de entregas no válida.');
        if (!datos.entregas.length) {
            panel.textContent = 'Esta solicitud aún no tiene entregas parciales.';
        } else {
            const solicitud = solicitudesDisponibles.find(s => Number(s.id) === id);
            const lista = document.createElement('ol');
            for (const entrega of datos.entregas) {
                const item = document.createElement('li');
                const encabezado = document.createElement('strong');
                encabezado.textContent = `Entrega #${entrega.entregaId} — ${entrega.fecha || 'Fecha no disponible'}`;
                item.appendChild(encabezado);
                const responsable = document.createElement('p');
                responsable.textContent = `Usuario: ${entrega.usuarioId ?? 'No disponible'} · Destinatario: ${entrega.personalDestinoId ?? 'No disponible'}`;
                item.appendChild(responsable);
                const materiales = document.createElement('ul');
                for (const producto of (Array.isArray(entrega.productos) ? entrega.productos : [])) {
                    const original = solicitud?.productos?.find(p => Number(p.productoId) === Number(producto.productoId));
                    const linea = document.createElement('li');
                    linea.textContent = `${original?.nombre || `Producto #${producto.productoId}`} (${original?.codigo || producto.productoId}): ${producto.cantidad} unidad(es)`;
                    materiales.appendChild(linea);
                }
                item.appendChild(materiales);
                lista.appendChild(item);
            }
            panel.replaceChildren(lista);
        }
    } catch (error) {
        panel.textContent = error.message || 'Error al consultar las entregas parciales.';
    } finally {
        boton.disabled = false;
    }
});

// Consulta independiente del historial de prioridades; no modifica la solicitud.
listaSolicitudes.addEventListener('click', async evento => {
    const boton = evento.target.closest('.boton-historial-prioridad');
    if (!boton) return;
    const panel = boton.closest('.historial-prioridad-contenedor')?.querySelector('.historial-prioridad');
    if (!panel) return;
    if (!panel.hidden) {
        panel.hidden = true;
        boton.setAttribute('aria-expanded', 'false');
        boton.textContent = 'Ver cambios de prioridad';
        return;
    }
    panel.hidden = false;
    boton.setAttribute('aria-expanded', 'true');
    boton.textContent = 'Ocultar cambios de prioridad';
    panel.textContent = 'Consultando cambios de prioridad...';
    boton.disabled = true;
    try {
        const respuesta = await fetch(`/api/solicitudes/${encodeURIComponent(boton.dataset.id)}/historial-prioridades`);
        if (!respuesta.ok) throw new Error('No se pudo consultar los cambios de prioridad.');
        const registros = await respuesta.json();
        if (!Array.isArray(registros)) throw new Error('Respuesta de historial no válida.');
        if (!registros.length) {
            panel.textContent = 'Esta solicitud no registra cambios de prioridad.';
        } else {
            const lista = document.createElement('ol');
            registros.forEach(registro => {
                const item = document.createElement('li');
                const fecha = registro.fecha ? new Date(registro.fecha.replace(' ', 'T') + (/[zZ]|[+-]\d\d:\d\d$/.test(registro.fecha) ? '' : 'Z')) : null;
                const fechaTexto = fecha && !Number.isNaN(fecha.getTime()) ? fecha.toLocaleString('es-CL') : (registro.fecha || 'Fecha no disponible');
                item.textContent = `${registro.prioridad_anterior || 'Sin dato'} → ${registro.prioridad_nueva || 'Sin dato'} · ${fechaTexto} · ${registro.usuario || 'Usuario no disponible'}`;
                lista.appendChild(item);
            });
            panel.replaceChildren(lista);
        }
    } catch (error) {
        panel.textContent = error.message || 'Error al cargar cambios de prioridad.';
    } finally {
        boton.disabled = false;
    }
});

// ===============================
// INICIAR PREPARACIÓN
// ===============================

listaSolicitudes.addEventListener(
    "click",
    async function (evento) {

        if (
            !evento.target.classList.contains(
                "boton-iniciar-preparacion"
            )
        ) {
            return;
        }

        const solicitudId =
            Number(evento.target.dataset.id);

        const confirmar = confirm(
            `¿Deseas iniciar la preparación de la solicitud #${solicitudId}?`
        );

        if (!confirmar) {
            return;
        }

        try {

            evento.target.disabled = true;

            const respuesta = await fetch(
                `/api/solicitudes/${solicitudId}/preparar`,
                {
                    method: "PUT"
                }
            );

            const resultado =
                await respuesta.json();

            if (!respuesta.ok) {

                alert(resultado.mensaje);

                evento.target.disabled = false;

                return;
            }

            alert(resultado.mensaje);

            await cargarSolicitudes();

        } catch (error) {

            console.error(
                "Error al iniciar preparación:",
                error
            );

            alert(
                "No se pudo iniciar la preparación."
            );

            evento.target.disabled = false;
        }
    }
);

// ===============================
// PREPARAR ENTREGA
// ===============================

listaSolicitudes.addEventListener(
    "click",
    async function (evento) {

        if (
            !evento.target.classList.contains(
                "boton-preparar-entrega"
            )
        ) {
            return;
        }

        const solicitudId =
            Number(evento.target.dataset.id);

        const tarjeta =
            evento.target.closest(
                ".solicitud-registrada"
            );

        if (!tarjeta) {
            return;
        }

        // Evitar abrir dos veces
        if (
            tarjeta.querySelector(
                ".panel-preparar-entrega"
            )
        ) {
            return;
        }

        const solicitud =
            solicitudesDisponibles.find(
                function (item) {
                    return (
                        Number(item.id) ===
                        solicitudId
                    );
                }
            );

        if (!solicitud) {
            alert(
                "No se encontró la solicitud."
            );
            return;
        }

        if (!solicitud.personalDestinoId) {
            alert(
                "La solicitud no tiene un destinatario registrado."
            );
            return;
        }

        const panel =
            document.createElement("div");

        panel.className =
            "panel-preparar-entrega";

        panel.innerHTML = `
            <h4>
                Preparación de entrega
            </h4>

            <div class="destinatario-preparacion">
                <strong>Destinatario:</strong>

                <span>
                    ${
                        solicitud.personalDestino
                            ? `${solicitud.personalDestino} — ${solicitud.personalDestinoCargo}`
                            : "No registrado"
                    }
                </span>
            </div>

            <div class="detalle-preparacion">
                Cargando productos...
            </div>

            <button
                type="button"
                class="boton-confirmar-entrega"
                data-id="${solicitudId}"
            >
                Confirmar entrega
            </button>
            <button type="button" class="boton-entrega-parcial" data-id="${solicitudId}"
                title="${entregasParcialesSinConfirmar.has(solicitudId) ? 'Reintentar la entrega anterior sin duplicar descuentos' : 'Registrar cantidades entregadas'}">
                ${entregasParcialesSinConfirmar.has(solicitudId)
                    ? 'Verificar entrega pendiente de confirmación'
                    : 'Registrar entrega parcial (por cantidad)'}
            </button>
        `;

        tarjeta.appendChild(panel);

        evento.target.style.display =
            "none";

        // ===============================
        // CARGAR PRODUCTOS PARA PREPARACIÓN
        // ===============================

        const detallePreparacion =
            panel.querySelector(
                ".detalle-preparacion"
            );

        let contenidoPreparacion = "";

        for (
            const producto
            of solicitud.productos
        ) {

            try {

                const respuestaProducto =
                    await fetch(
                        `/api/buscar/${encodeURIComponent(
                            producto.codigo
                        )}`
                    );

                const resultadoProducto =
                    await respuestaProducto.json();

                if (
                    !respuestaProducto.ok ||
                    !resultadoProducto.encontrado
                ) {

                    contenidoPreparacion += `
                        <div class="producto-preparacion">

                            <strong>
                                ${producto.codigo} — ${producto.nombre}
                            </strong>

                            <p>
                                Solicitado: ${producto.cantidad}
                            </p>

                            <p>
                                Producto no disponible en bodega.
                            </p>

                        </div>
                    `;

                    continue;
                }

                // ===============================
                // PRODUCTO POR CANTIDAD
                // ===============================

                if (
                    resultadoProducto.tipoBusqueda ===
                    "CANTIDAD"
                ) {

                    let ubicaciones = "";

                    resultadoProducto.producto.ubicaciones
                        .forEach(
                            function (ubicacion) {

                                ubicaciones += `
                                    <div class="ubicacion-preparacion">

                                        <strong>
                                            ${ubicacion.ubicacion}
                                        </strong>

                                        <span>
                                            Disponible:
                                            ${ubicacion.cantidad}
                                        </span>

                                    </div>
                                `;
                            }
                        );

                    contenidoPreparacion += `
                        <div class="producto-preparacion">

                            <h4>
                                ${producto.codigo} — ${producto.nombre}
                            </h4>

                            <p>
                                <strong>Solicitado:</strong>
                                ${producto.cantidad}
                            </p>

                            <p>
                                <strong>
                                    Ubicación y disponibilidad:
                                </strong>
                            </p>

                            ${
                                ubicaciones ||
                                "<p>No hay stock disponible en bodega.</p>"
                            }

                        </div>
                    `;
                }

                // ===============================
                // PRODUCTO POR SERIE
                // ===============================

                if (
                    resultadoProducto.tipoBusqueda ===
                    "SERIE"
                ) {

                    let series = "";

                    resultadoProducto.producto.series
                        .filter(
                            function (serie) {
                                return serie.ubicacion;
                            }
                        )
                        .forEach(
                            function (serie) {

                                series += `
                                    <div class="serie-preparacion">

                                        <label>

                                            <input
                                                type="radio"
                                                name="serie-${solicitudId}-${producto.productoId}"
                                                value="${serie.numero_serie}"
                                                data-ubicacion="${serie.ubicacion}"
                                            >

                                            ${serie.numero_serie}
                                            —
                                            ${serie.ubicacion}

                                        </label>

                                    </div>
                                `;
                            }
                        );

                    contenidoPreparacion += `
                        <div class="producto-preparacion">

                            <h4>
                                ${producto.codigo} — ${producto.nombre}
                            </h4>

                            <p>
                                <strong>Solicitado:</strong>
                                ${producto.cantidad}
                            </p>

                            <p>
                                <strong>
                                    Selecciona la serie a preparar:
                                </strong>
                            </p>

                            ${
                                series ||
                                "<p>No hay series disponibles en bodega.</p>"
                            }

                        </div>
                    `;
                }

            } catch (errorProducto) {

                console.error(
                    "Error al cargar producto:",
                    producto.codigo,
                    errorProducto
                );

                contenidoPreparacion += `
                    <div class="producto-preparacion">

                        <strong>
                            ${producto.codigo} — ${producto.nombre}
                        </strong>

                        <p>
                            Error al consultar el producto.
                        </p>

                    </div>
                `;
            }
        }

        detallePreparacion.innerHTML =
            contenidoPreparacion;
    }
);


// Impide dos envíos simultáneos de la misma solicitud, incluso si la lista se vuelve a dibujar.
const solicitudesConEntregaParcialEnCurso = new Set();
// Una desconexión puede ocurrir después del COMMIT. Conservar la misma
// operación en memoria hasta conocer su resultado evita un segundo descuento
// si el usuario vuelve a pulsar el botón tras dos fallos de red.
const entregasParcialesSinConfirmar = new Map();
const CLAVE_ENTREGAS_PARCIALES_PENDIENTES = "mapaBodega:entregasParcialesSinConfirmar:v2";
function claveEntregasParcialesUsuario() {
    return avisosIdentidadLista && claveAvisosUsuario
        ? `${CLAVE_ENTREGAS_PARCIALES_PENDIENTES}:${claveAvisosUsuario}` : null;
}
// sessionStorage conserva la operación tras recargar la pestaña, pero no la
// comparte con otras pestañas ni la mantiene al cerrar la sesión del navegador.
function guardarEntregasParcialesPendientes() {
    try {
        const claveUsuario = claveEntregasParcialesUsuario();
        if (!claveUsuario) return;
        if (entregasParcialesSinConfirmar.size) {
            sessionStorage.setItem(claveUsuario,
                JSON.stringify([...entregasParcialesSinConfirmar]));
        } else {
            sessionStorage.removeItem(claveUsuario);
        }
    } catch (error) {
        console.warn("No se pudo conservar la entrega pendiente tras una recarga:", error);
    }
}
function recuperarEntregasParcialesPendientes() {
    try {
        const claveUsuario = claveEntregasParcialesUsuario();
        if (!claveUsuario) return;
        entregasParcialesSinConfirmar.clear();
        const almacenado = sessionStorage.getItem(claveUsuario);
        if (!almacenado) return;
        const registros = JSON.parse(almacenado);
        if (!Array.isArray(registros) || registros.length > 100) throw new Error("Registro inválido");
        const idsVistos = new Set();
        for (const registro of registros) {
            if (!Array.isArray(registro) || registro.length !== 2) throw new Error("Registro inválido");
            const [id, operacion] = registro;
            if (!Number.isSafeInteger(id) || id <= 0 || !operacion ||
                operacion.url !== `/api/solicitudes/${id}/entregar-parcial` ||
                typeof operacion.clave !== "string" || !/^[a-zA-Z0-9_-]{16,128}$/.test(operacion.clave) ||
                !operacion.carga || !Number.isSafeInteger(operacion.carga.personalId) ||
                operacion.carga.personalId <= 0 ||
                !Array.isArray(operacion.carga.productos) || !operacion.carga.productos.length ||
                operacion.carga.productos.length > 500 || idsVistos.has(id)) {
                throw new Error("Registro inválido");
            }
            const productosVistos = new Set();
            for (const producto of operacion.carga.productos) {
                if (!producto || producto.tipoControl !== "CANTIDAD" ||
                    !Number.isSafeInteger(producto.productoId) || producto.productoId <= 0 ||
                    !Number.isSafeInteger(producto.cantidad) || producto.cantidad <= 0 ||
                    productosVistos.has(producto.productoId)) {
                    throw new Error("Material pendiente inválido");
                }
                productosVistos.add(producto.productoId);
            }
            idsVistos.add(id);
            entregasParcialesSinConfirmar.set(id, operacion);
        }
    } catch (error) {
        entregasParcialesSinConfirmar.clear();
        try { const claveUsuario = claveEntregasParcialesUsuario(); if (claveUsuario) sessionStorage.removeItem(claveUsuario); } catch (_) { /* almacenamiento bloqueado */ }
    }
}
// La recuperación ocurre después de validar /api/auth/me.

// Un 5xx no confirma si el servidor alcanzó a registrar la operación.
// Conservar la clave para consultar/reintentar sin generar otro descuento.
function respuestaEntregaParcialConcluyente(respuesta) {
    return respuesta.ok || (respuesta.status >= 400 && respuesta.status < 500);
}

// La confirmación depende del estado HTTP, no de que el cuerpo sea JSON válido.
// Una respuesta 2xx vacía no debe mostrarse como un fallo de entrega.
async function leerResultadoEntregaParcial(respuesta) {
    try {
        const resultado = await respuesta.json();
        return resultado && typeof resultado === "object" && !Array.isArray(resultado) ? resultado : {};
    } catch (_) {
        return {};
    }
}

// Reintentar una pérdida de conexión con EXACTAMENTE la misma clave y carga.
// Nunca repetir automáticamente respuestas HTTP de error: podrían ser rechazos de negocio.
async function enviarEntregaParcialConReintento(url, carga, clave, enviar = fetch) {
    const opciones = {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": clave },
        body: JSON.stringify(carga)
    };
    try {
        return await enviar(url, opciones);
    } catch (error) {
        // fetch rechaza por errores de red (TypeError); no por HTTP 4xx/5xx.
        if (!(error instanceof TypeError)) throw error;
        return enviar(url, opciones);
    }
}

// Entregas parciales: consultar siempre el saldo vigente al servidor.
// Los productos seriados se excluyen hasta disponer de selección individual.
listaSolicitudes.addEventListener("click", async function (evento) {
    const boton = evento.target.closest(".boton-entrega-parcial");
    if (!boton || !listaSolicitudes.contains(boton)) return;
    const solicitudId = Number(boton.dataset.id);
    if (solicitudesConEntregaParcialEnCurso.has(solicitudId)) return;
    const solicitud = solicitudesDisponibles.find(s => Number(s.id) === solicitudId);
    if (!solicitud || !solicitud.personalDestinoId) {
        alert("La solicitud no tiene un destinatario válido.");
        return;
    }
    solicitudesConEntregaParcialEnCurso.add(solicitudId);
    boton.disabled = true;
    try {
        const pendienteDeConfirmacion = entregasParcialesSinConfirmar.get(solicitudId);
        if (pendienteDeConfirmacion) {
            // Mostrar el alcance del reintento antes de reenviar una operación
            // que pudo haber sido confirmada aunque se perdiera la respuesta.
            const resumenPendiente = pendienteDeConfirmacion.carga.productos
                .map(p => `Producto #${p.productoId}: ${p.cantidad} unidad(es)`)
                .join("\n");
            if (!confirm(`Esta solicitud tiene una entrega sin confirmación.\nSe verificará la MISMA operación, sin cambiar cantidades:\n${resumenPendiente}\n\n¿Verificar ahora?`)) return;
            // No permitir editar las cantidades ni generar una clave nueva hasta
            // resolver si la entrega anterior quedó confirmada en el servidor.
            const respuestaAnterior = await enviarEntregaParcialConReintento(
                pendienteDeConfirmacion.url, pendienteDeConfirmacion.carga, pendienteDeConfirmacion.clave
            );
            // Resolver la clave antes de interpretar el cuerpo: un 2xx/4xx puede
            // traer JSON inválido o vacío, sin que eso vuelva incierto el COMMIT.
            if (respuestaEntregaParcialConcluyente(respuestaAnterior)) {
                entregasParcialesSinConfirmar.delete(solicitudId);
                guardarEntregasParcialesPendientes();
            }
            const resultadoAnterior = await leerResultadoEntregaParcial(respuestaAnterior);
            if (!respuestaAnterior.ok) throw new Error(resultadoAnterior.mensaje || "No se pudo recuperar la entrega anterior.");
            alert(resultadoAnterior.mensaje || "Entrega anterior confirmada.");
            await cargarSolicitudes();
            return;
        }
        const respuestaSaldos = await fetch(`/api/solicitudes/${solicitudId}/saldos`);
        const datos = await respuestaSaldos.json();
        if (!respuestaSaldos.ok) throw new Error(datos.mensaje || "No se pudieron consultar los saldos.");
        const filas = Array.isArray(datos.detalle) ? datos.detalle : [];
        const productos = [];
        for (const item of filas) {
            const productoId = Number(item.productoId ?? item.producto_id);
            const pendiente = Number(item.saldoPendiente ?? item.pendiente);
            const original = solicitud.productos.find(p => Number(p.productoId) === productoId);
            if (!original || original.tipoControl !== "CANTIDAD" || !Number.isSafeInteger(pendiente) || pendiente <= 0) continue;
            const entrada = prompt(`Cantidad a entregar de ${original.codigo} — ${original.nombre} (pendiente: ${pendiente}).\nEscribe 0 para omitir:`, "0");
            if (entrada === null) return;
            if (!/^(0|[1-9]\d*)$/.test(entrada.trim())) {
                alert("Ingresa una cantidad entera válida."); return;
            }
            const cantidad = Number(entrada.trim());
            if (!Number.isSafeInteger(cantidad) || cantidad > pendiente) {
                alert(`La cantidad no puede superar el saldo pendiente (${pendiente}).`); return;
            }
            if (cantidad > 0) productos.push({ productoId, tipoControl: "CANTIDAD", cantidad });
        }
        if (!productos.length) { alert("No se seleccionaron cantidades para entregar."); return; }
        if (!confirm(`¿Registrar la entrega parcial de ${productos.length} producto(s) de la solicitud #${solicitudId}?`)) return;
        const claveEntrega = crypto.randomUUID();
        const operacion = {
            url: `/api/solicitudes/${solicitudId}/entregar-parcial`,
            carga: { personalId: Number(solicitud.personalDestinoId), productos },
            clave: claveEntrega
        };
        // Se conserva antes del primer envío, porque el servidor puede confirmar
        // la transacción aunque se pierda la respuesta HTTP.
        entregasParcialesSinConfirmar.set(solicitudId, operacion);
        guardarEntregasParcialesPendientes();
        const respuesta = await enviarEntregaParcialConReintento(
            operacion.url, operacion.carga, operacion.clave
        );
        // La respuesta HTTP define si el reintento sigue pendiente, no el
        // formato de su cuerpo. No conservar claves de operaciones confirmadas.
        if (respuestaEntregaParcialConcluyente(respuesta)) {
            entregasParcialesSinConfirmar.delete(solicitudId);
            guardarEntregasParcialesPendientes();
        }
        const resultado = await leerResultadoEntregaParcial(respuesta);
        if (!respuesta.ok) throw new Error(resultado.mensaje || "No se pudo registrar la entrega parcial.");
        alert(resultado.mensaje || "Entrega parcial registrada.");
        await cargarSolicitudes();
    } catch (error) {
        console.error("Entrega parcial:", error);
        alert(error.message || "Error al procesar la entrega parcial.");
    } finally {
        solicitudesConEntregaParcialEnCurso.delete(solicitudId);
        boton.disabled = false;
    }
});

// ===============================
// CONFIRMAR ENTREGA
// ===============================
// Bloqueo por solicitud, independiente del estado visual del botón.
const solicitudesConEntregaCompletaEnCurso = new Set();


listaSolicitudes.addEventListener(
    "click",
    async function (evento) {

        if (
            !evento.target.classList.contains(
                "boton-confirmar-entrega"
            )
        ) {
            return;
        }

        const boton =
            evento.target;

        const solicitudId =
            Number(boton.dataset.id);

        // El bloqueo se adquiere antes de mostrar el diálogo de confirmación.
        // Un segundo clic no puede iniciar otra entrega de la misma solicitud.
        if (!Number.isInteger(solicitudId) || boton.disabled || solicitudesConEntregaCompletaEnCurso.has(solicitudId)) {
            return;
        }
        solicitudesConEntregaCompletaEnCurso.add(solicitudId);
        try {
        await procesarEntregaCompleta(solicitudId, boton);
        } finally {
            solicitudesConEntregaCompletaEnCurso.delete(solicitudId);
        }
    }
);

async function procesarEntregaCompleta(solicitudId, boton) {
        const tarjeta =
            boton.closest(
                ".solicitud-registrada"
            );

        if (!tarjeta) {
            return;
        }

        const solicitud =
            solicitudesDisponibles.find(
                function (item) {
                    return (
                        Number(item.id) ===
                        solicitudId
                    );
                }
            );

        if (!solicitud) {
            alert(
                "No se encontró la solicitud."
            );
            return;
        }

        if (!solicitud.personalDestinoId) {
            alert(
                "La solicitud no tiene un destinatario registrado."
            );
            return;
        }

        const productosEntrega = [];

        // ===============================
        // PREPARAR PRODUCTOS
        // ===============================

        for (
            const producto
            of solicitud.productos
        ) {

            // PRODUCTO POR CANTIDAD
            if (
                producto.tipoControl ===
                "CANTIDAD"
            ) {

                productosEntrega.push({
                    productoId:
                        producto.productoId,

                    tipoControl:
                        "CANTIDAD",

                    cantidad:
                        producto.cantidad
                });

                continue;
            }

            // PRODUCTO POR SERIE
            if (
                producto.tipoControl ===
                "SERIE"
            ) {

                const serieSeleccionada =
                    tarjeta.querySelector(
                        `input[name="serie-${solicitudId}-${producto.productoId}"]:checked`
                    );

                if (!serieSeleccionada) {

                    alert(
                        `Debes seleccionar la serie para ${producto.codigo} — ${producto.nombre}.`
                    );

                    return;
                }

                productosEntrega.push({
                    productoId:
                        producto.productoId,

                    tipoControl:
                        "SERIE",

                    cantidad:
                        producto.cantidad,

                    numeroSerie:
                        serieSeleccionada.value
                });
            }
        }

        // ===============================
        // CONFIRMACIÓN
        // ===============================

        const nombrePersona =
            solicitud.personalDestino
                ? `${solicitud.personalDestino} — ${solicitud.personalDestinoCargo}`
                : "destinatario registrado";

        const confirmar =
            confirm(
                `¿Confirmas la entrega de la solicitud #${solicitudId} a ${nombrePersona}?`
            );

        if (!confirmar) {
            return;
        }

        // Evitar doble clic
        boton.disabled = true;

        boton.textContent =
            "Procesando entrega...";

        try {

            const respuesta =
                await fetch(
                    `/api/solicitudes/${solicitudId}/entregar`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                personalId:
                                    Number(
                                        solicitud.personalDestinoId
                                    ),

                                productos:
                                    productosEntrega
                            })
                    }
                );

            const resultado =
                await respuesta.json();

            if (!respuesta.ok) {
                // Un HTTP 5xx puede ocurrir después de confirmar la transacción.
                // Tratarlo como resultado incierto: verificar antes de otro POST.
                if (respuesta.status >= 500 || !Number.isInteger(respuesta.status)) {
                    throw new Error("Resultado de entrega incierto (HTTP " + respuesta.status + ")");
                }

                alert(
                    resultado.mensaje ||
                    "No se pudo realizar la entrega."
                );

                boton.disabled = false;

                boton.textContent =
                    "Confirmar entrega";

                return;
            }

            alert(
                resultado.mensaje
            );

            await cargarSolicitudes();

        } catch (error) {

            console.error(
                "Error al confirmar entrega:",
                error
            );

            // Si se perdió la respuesta, el servidor pudo haber confirmado la entrega.
            // No permitir otro POST sin consultar antes el estado persistido.
            boton.disabled = true;
            boton.textContent = "Verificando entrega...";
            try {
                await cargarSolicitudes();
                const vigente = solicitudesDisponibles.find(item => Number(item.id) === solicitudId);
                if (vigente && vigente.estado === "ENTREGADA") {
                    alert("La entrega ya está registrada. No se descontó nuevamente el inventario.");
                    return;
                }
            } catch (errorConsulta) {
                console.warn("No se pudo comprobar el estado de la entrega:", errorConsulta);
            }
            // Una lista en memoria puede ser anterior al POST. Ante duda, bloquear
            // el reintento y exigir una verificación manual tras actualizar la página.
            alert("No se pudo confirmar el resultado de la entrega. Actualiza Solicitudes y revisa su estado antes de intentar nuevamente, para evitar descuentos duplicados.");
            boton.disabled = true;
            boton.textContent = "Verifica el estado antes de reintentar";
        }
    }

// ===============================
// INICIAR
// ===============================

cargarSupervisores();
cargarPersonalDestino();
cargarProductos();
cargarSolicitudes();

// Proyectos disponibles según el supervisor elegido; la bodega se obtiene del proyecto.
(async function cargarProyectosSolicitud(){
    const selector=document.getElementById('proyectoSolicitud');
    const detalle=document.getElementById('bodegaProyectoSolicitud');
    if(!selector)return;
    selector.disabled=true;
    try {
        const respuesta=await fetch('/api/proyectos');
        if(!respuesta.ok)throw new Error('No se pudo cargar proyectos');
        const proyectos=await respuesta.json();
        const actualizar=()=>{
            const supervisor=Number(supervisorSolicitud?.value);
            const seleccionado=selector.value;
            selector.replaceChildren(new Option('Selecciona un proyecto',''));
            const disponibles=proyectos.filter(p=>p.estado==='ACTIVO' &&
                Number(p.supervisor_personal_id)===supervisor && Number(p.bodega_numero)>0);
            disponibles.forEach(p=>selector.add(new Option(`${p.codigo || p.id} — ${p.nombre}`,p.id)));
            selector.disabled=!disponibles.length;
            if(disponibles.some(p=>String(p.id)===seleccionado))selector.value=seleccionado;
            const proyecto=disponibles.find(p=>String(p.id)===selector.value);
            if(detalle)detalle.textContent=proyecto?`Bodega vinculada: ${proyecto.bodega_numero}`:
                (supervisor?'No hay proyectos con bodega asignados a este supervisor.':'Selecciona primero un supervisor.');
            bodegaProyectoSeleccionada = proyecto ? Number(proyecto.bodega_numero) : null;
            // Las existencias pueden variar mientras el supervisor cambia de proyecto.
            // Una consulta fallida no debe mostrar stock antiguo como si fuera actual.
            stockPorBodega = new Map();
            stockProyectoConsultado = false;
            const versionConsulta = ++consultaStockProyectoVersion;
            mostrarDetalleSolicitud();
            if (proyecto) {
                const bodegaConsultada = bodegaProyectoSeleccionada;
                fetch(`/api/productos/disponibilidad-bodegas?bodega=${encodeURIComponent(bodegaConsultada)}`, {cache:'no-store'})
                    .then(r => { if (!r.ok) throw new Error('Stock no disponible'); return r.json(); })
                    .then(filas => {
                        if (versionConsulta !== consultaStockProyectoVersion || bodegaProyectoSeleccionada !== bodegaConsultada) return;
                        const nuevoStock = new Map();
                        for (const fila of filas) {
                            const id = Number(fila.productoId);
                            if (!nuevoStock.has(id)) nuevoStock.set(id, []);
                            nuevoStock.get(id).push(fila);
                        }
                        stockPorBodega = nuevoStock;
                        stockProyectoConsultado = true;
                        mostrarDetalleSolicitud();
                    })
                    .catch(error => {
                        if (versionConsulta !== consultaStockProyectoVersion) return;
                        stockProyectoConsultado = false;
                        mostrarDetalleSolicitud();
                        console.warn('No se pudo actualizar el stock del proyecto', error);
                    });
            }
        };
        supervisorSolicitud?.addEventListener('change',actualizar);
        selector.addEventListener('change',actualizar);
        actualizar();
    }catch(error){
        console.error('Proyectos no disponibles',error);
        selector.replaceChildren(new Option('Error al cargar proyectos',''));
        if(detalle)detalle.textContent='No fue posible consultar las asignaciones.';
        bodegaProyectoSeleccionada = null;
        ++consultaStockProyectoVersion;
        stockProyectoConsultado = false;
        stockPorBodega = new Map();
        mostrarDetalleSolicitud();
    }
})();

// Cambios de prioridad con confirmación del servidor y recarga del listado.
document.addEventListener('change', async event => {
    const selector = event.target.closest('.selector-prioridad');
    if (!selector) return;
    selector.disabled = true;
    try {
        const respuesta = await fetch(`/api/solicitudes/${encodeURIComponent(selector.dataset.id)}/prioridad`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({prioridad:selector.value})});
        const datos = await respuesta.json();
        if (!respuesta.ok) throw new Error(datos.mensaje || 'No se pudo cambiar la prioridad.');
        await cargarSolicitudes();
    } catch (error) {
        alert(error.message);
        await cargarSolicitudes();
    } finally { selector.disabled = false; }
});
