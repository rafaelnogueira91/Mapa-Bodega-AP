// ===============================
// ELEMENTOS DEL FORMULARIO
// ===============================

const tipoControl =
    document.getElementById("tipoControl");

const campoSerie =
    document.getElementById("campoSerie");

const campoCantidad =
    document.getElementById("campoCantidad");

const numeroSerie =
    document.getElementById("numeroSerie");

const cantidad =
    document.getElementById("cantidad");

const formProducto =
    document.getElementById("formProducto");

const selectUbicacion =
    document.getElementById("ubicacion");



// Fotografía: cámara del teléfono o galería, usando el mismo campo que recibe el servidor.
const fotoProducto = document.getElementById("foto");
const capturaProducto = document.getElementById("capturaProducto");
const galeriaProducto = document.getElementById("galeriaProducto");
const vistaFotoProducto = document.getElementById("vistaFotoProducto");
const imagenFotoProducto = document.getElementById("imagenFotoProducto");
const nombreFotoProducto = document.getElementById("nombreFotoProducto");
const mensajeFotoProducto = document.getElementById("mensajeFotoProducto");
let urlVistaFotoProducto = null;

document.getElementById("abrirCamaraProducto").addEventListener("click", () => capturaProducto.click());
document.getElementById("abrirGaleriaProducto").addEventListener("click", () => galeriaProducto.click());

function limpiarFotoProducto() {
    fotoProducto.value = "";
    capturaProducto.value = "";
    galeriaProducto.value = "";
    if (urlVistaFotoProducto) URL.revokeObjectURL(urlVistaFotoProducto);
    urlVistaFotoProducto = null;
    imagenFotoProducto.removeAttribute("src");
    nombreFotoProducto.textContent = "";
    vistaFotoProducto.hidden = true;
    mensajeFotoProducto.textContent = "Puedes tomar una foto desde el celular o elegir una imagen guardada.";
}

function seleccionarFotoProducto(entrada) {
    const archivo = entrada.files && entrada.files[0];
    if (!archivo) return;
    if (!archivo.type.startsWith("image/")) {
        mensajeFotoProducto.textContent = "Selecciona una imagen válida.";
        entrada.value = "";
        return;
    }
    // Mantener el nombre de campo 'foto' para el POST multipart existente.
    try {
        const transferencia = new DataTransfer();
        transferencia.items.add(archivo);
        fotoProducto.files = transferencia.files;
    } catch (error) {
        mensajeFotoProducto.textContent = "No se pudo adjuntar la imagen en este navegador. Intenta desde otro navegador.";
        return;
    }
    if (urlVistaFotoProducto) URL.revokeObjectURL(urlVistaFotoProducto);
    urlVistaFotoProducto = URL.createObjectURL(archivo);
    imagenFotoProducto.src = urlVistaFotoProducto;
    nombreFotoProducto.textContent = archivo.name;
    vistaFotoProducto.hidden = false;
    mensajeFotoProducto.textContent = "Fotografía lista para guardar con el producto.";
}

capturaProducto.addEventListener("change", () => seleccionarFotoProducto(capturaProducto));
galeriaProducto.addEventListener("change", () => seleccionarFotoProducto(galeriaProducto));
document.getElementById("quitarFotoProducto").addEventListener("click", limpiarFotoProducto);

// ===============================
// OCULTAR CAMPOS AL INICIAR
// ===============================

campoSerie.style.display = "none";
campoCantidad.style.display = "none";


// ===============================
// TIPO DE CONTROL
// ===============================

tipoControl.addEventListener(
    "change",
    function () {

        const tipoSeleccionado =
            tipoControl.value;

        if (
            tipoSeleccionado === "SERIE"
        ) {

            campoSerie.style.display =
                "flex";

            campoCantidad.style.display =
                "none";

            numeroSerie.required = true;
            cantidad.required = false;

            cantidad.value = "";

        } else if (
            tipoSeleccionado === "CANTIDAD"
        ) {

            campoSerie.style.display =
                "none";

            campoCantidad.style.display =
                "flex";

            numeroSerie.required = false;
            cantidad.required = true;

            numeroSerie.value = "";

        } else {

            campoSerie.style.display =
                "none";

            campoCantidad.style.display =
                "none";

            numeroSerie.required = false;
            cantidad.required = false;

        }

    }
);


// ===============================
// CARGAR UBICACIONES DESDE LA BD
// ===============================

async function cargarUbicaciones() {

    selectUbicacion.innerHTML = `
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

            selectUbicacion.innerHTML = `
                <option value="">
                    No se pudieron cargar las ubicaciones
                </option>
            `;

            return;

        }

        selectUbicacion.innerHTML = `
            <option value="">
                Selecciona una ubicación
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

                selectUbicacion.appendChild(
                    opcion
                );

            }
        );

    } catch (error) {

        console.error(
            "Error al cargar ubicaciones:",
            error
        );

        selectUbicacion.innerHTML = `
            <option value="">
                Error al cargar ubicaciones
            </option>
        `;

    }

}


// ===============================
// ENVIAR PRODUCTO AL SERVIDOR
// ===============================

formProducto.addEventListener(
    "submit",
    async function (evento) {

        evento.preventDefault();

        const datosFormulario =
            new FormData(formProducto);

        try {

            const respuesta = await fetch(
                "/api/productos",
                {
                    method: "POST",
                    body: datosFormulario
                }
            );

            const textoRespuesta = await respuesta.text();
            let resultado = {};
            try { resultado = JSON.parse(textoRespuesta); } catch (_) { /* Error HTTP sin JSON */ }

            if (!respuesta.ok) {

                alert(
                    resultado.mensaje || resultado.error ||
                    `No se pudo guardar el producto (HTTP ${respuesta.status}).`
                );

                return;

            }

            alert(
                resultado.mensaje
            );

            // Limpiar formulario

            formProducto.reset();
            limpiarFotoProducto();

            campoSerie.style.display =
                "none";

            campoCantidad.style.display =
                "none";

            numeroSerie.required = false;
            cantidad.required = false;

            // Recargar ubicaciones
            // para actualizar sus estados

            cargarUbicaciones();

        } catch (error) {

            console.error(
                "Error al guardar producto:",
                error
            );

            alert(
                `No se pudo conectar con el servidor: ${error.message || 'error desconocido'}`
            );

        }

    }
);


// ===============================
// INICIAR
// ===============================

cargarUbicaciones();