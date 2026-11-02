const formPersonal =
    document.getElementById("formPersonal");

const nombrePersonal =
    document.getElementById("nombrePersonal");

const rutPersonal =
    document.getElementById("rutPersonal");

const cargoPersonal =
    document.getElementById("cargoPersonal");

const telefonoPersonal =
    document.getElementById("telefonoPersonal");

const correoPersonal =
    document.getElementById("correoPersonal");

const listaPersonal =
    document.getElementById("listaPersonal");


// Búsqueda local sobre los registros recibidos: no cambia datos ni API.
const buscarPersonal = document.getElementById("buscarPersonal");
const filtrarCargoPersonal = document.getElementById("filtrarCargoPersonal");
const mostrarRegistroPersonal = document.getElementById("mostrarRegistroPersonal");
const seccionRegistroPersonal = document.getElementById("seccionRegistroPersonal");
const contadorPersonal = document.getElementById("contadorPersonal");
let personalCargado = [];
const normalizarPersonal = (valor) => String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const normalizarRutPersonal = (valor) => normalizarPersonal(valor).replace(/[^0-9k]/g, "");
mostrarRegistroPersonal.addEventListener("click", () => {
    const abrir = seccionRegistroPersonal.hidden;
    seccionRegistroPersonal.hidden = !abrir;
    mostrarRegistroPersonal.setAttribute("aria-expanded", String(abrir));
    mostrarRegistroPersonal.textContent = abrir ? "Cerrar registro" : "+ Registrar persona";
    if (abrir) nombrePersonal.focus();
});
function filtrarPersonalVisible() {
    const termino = normalizarPersonal(String(buscarPersonal.value || "").trim());
    const rutBuscado = normalizarRutPersonal(String(buscarPersonal.value || "").trim());
    const cargo = filtrarCargoPersonal.value;
    let visibles = 0;
    Array.from(listaPersonal.querySelectorAll(".tarjeta-personal")).forEach((tarjeta) => {
        const nombre = normalizarPersonal(tarjeta.dataset.nombre);
        const rut = normalizarPersonal(tarjeta.dataset.rut);
        const rutNormalizado = normalizarRutPersonal(tarjeta.dataset.rut);
        const coincideTexto = !termino || nombre.includes(termino) || rut.includes(termino) || (rutBuscado && rutNormalizado.includes(rutBuscado));
        const coincideCargo = !cargo || tarjeta.dataset.cargo === cargo;
        tarjeta.hidden = !(coincideTexto && coincideCargo);
        if (!tarjeta.hidden) visibles++;
    });
    contadorPersonal.textContent = `${visibles} de ${personalCargado.length} personas visibles`;
    let aviso = document.getElementById("sinCoincidenciasPersonal");
    if (!aviso) {
        aviso = document.createElement("p");
        aviso.id = "sinCoincidenciasPersonal";
        listaPersonal.appendChild(aviso);
    }
    aviso.textContent = "No se encontraron personas con esos filtros.";
    aviso.hidden = visibles !== 0 || personalCargado.length === 0;
}
buscarPersonal.addEventListener("input", filtrarPersonalVisible);
filtrarCargoPersonal.addEventListener("change", filtrarPersonalVisible);

// ===============================
// REGISTRAR PERSONAL
// ===============================

formPersonal.addEventListener(
    "submit",
    async function (evento) {

        evento.preventDefault();

        const datos = {
            nombre:
                nombrePersonal.value.trim(),

            rut:
                rutPersonal.value.trim(),

            cargo:
                cargoPersonal.value,

            telefono:
                telefonoPersonal.value.trim(),

            correo:
                correoPersonal.value.trim()
        };

        try {

    const respuesta = await fetch(
        "/api/personal",
        {
            method: "POST",

            headers: {
                "Content-Type":
                    "application/json"
            },

            body: JSON.stringify(datos)
        }
    );

    const resultado =
        await respuesta.json();

    if (!respuesta.ok) {
        alert(resultado.mensaje);
        return;
    }

    alert(resultado.mensaje);

    formPersonal.reset();

    await cargarPersonal();

} catch (error) {

    console.error(
        "Error al registrar personal:",
        error
    );

    alert(
        "No se pudo registrar la persona."
    );
}
    }
);

// ===============================
// MOSTRAR PERSONAL REGISTRADO
// ===============================

async function cargarPersonal() {

    try {

        const respuesta = await fetch(
            "/api/personal"
        );

        const personal =
            await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(personal?.mensaje || "Error HTTP al cargar personal.");
        }

        if (!Array.isArray(personal)) {
            throw new Error("El servidor devolvió una lista de personal inválida.");
        }

        personalCargado = personal;
        // Construir los datos como texto, nunca como HTML proporcionado por usuarios.
        listaPersonal.replaceChildren();

        if (personal.length === 0) {
            const aviso = document.createElement("p");
            aviso.textContent = "Aún no hay personal registrado.";
            listaPersonal.appendChild(aviso);
            filtrarPersonalVisible();
            return;
        }

        personal.forEach(function (persona) {
            const tarjeta = document.createElement("div");
            tarjeta.classList.add("tarjeta-personal");
            tarjeta.dataset.nombre = persona.nombre || "";
            tarjeta.dataset.rut = persona.rut || "";
            tarjeta.dataset.cargo = String(persona.cargo || "").toUpperCase();
            const titulo = document.createElement("h3");
            titulo.textContent = persona.nombre || "Sin nombre";
            tarjeta.appendChild(titulo);

            const campos = [
                ["RUT", persona.rut],
                ["Cargo", persona.cargo],
                ["Teléfono", persona.telefono],
                ["Correo", persona.correo],
                ["Estado", persona.estado]
            ];
            campos.forEach(function ([etiqueta, valor]) {
                const parrafo = document.createElement("p");
                const nombreCampo = document.createElement("strong");
                nombreCampo.textContent = etiqueta + ": ";
                parrafo.appendChild(nombreCampo);
                const valorCampo = document.createElement("span");
                valorCampo.textContent = String(valor ?? "-") || "-";
                if (etiqueta === "Estado") {
                    valorCampo.className = "personal-estado " + (String(valor).toUpperCase() === "ACTIVO" ? "activo" : "inactivo");
                }
                parrafo.appendChild(valorCampo);
                tarjeta.appendChild(parrafo);
            });

            const boton = document.createElement("button");
            boton.type = "button";
            boton.classList.add("boton-estado-personal");
            boton.dataset.id = String(persona.id);
            boton.dataset.estado = String(persona.estado || "");
            boton.textContent = persona.estado === "ACTIVO" ? "Desactivar" : "Activar";
            tarjeta.appendChild(boton);
            listaPersonal.appendChild(tarjeta);
        });
        filtrarPersonalVisible();

    } catch (error) {

        console.error("Error al cargar personal:", error);
        // No sustituir registros visibles por un falso estado vacío.
        if (!listaPersonal.children.length) {
            const aviso = document.createElement("p");
            aviso.setAttribute("role", "alert");
            aviso.textContent = "No se pudo cargar el personal. Intenta nuevamente.";
            listaPersonal.appendChild(aviso);
        }
    }
}


// Cargar personal al abrir la página
cargarPersonal();

// ===============================
// ACTIVAR / DESACTIVAR PERSONAL
// ===============================

listaPersonal.addEventListener(
    "click",
    async function (evento) {

        if (
            !evento.target.classList.contains(
                "boton-estado-personal"
            )
        ) {
            return;
        }

        const boton = evento.target;

        const id =
            boton.dataset.id;

        const estadoActual =
            boton.dataset.estado;

        const nuevoEstado =
            estadoActual === "ACTIVO"
                ? "INACTIVO"
                : "ACTIVO";

        const confirmar = confirm(
            nuevoEstado === "INACTIVO"
                ? "¿Deseas desactivar a esta persona?"
                : "¿Deseas activar nuevamente a esta persona?"
        );

        if (!confirmar) {
            return;
        }

        try {

            const respuesta = await fetch(
                `/api/personal/${id}/estado`,
                {
                    method: "PUT",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        estado: nuevoEstado
                    })
                }
            );

            const resultado =
                await respuesta.json();

            if (!respuesta.ok) {
                alert(resultado.mensaje);
                return;
            }

            alert(resultado.mensaje);

            await cargarPersonal();

        } catch (error) {

            console.error(
                "Error al cambiar estado:",
                error
            );

            alert(
                "No se pudo cambiar el estado."
            );
        }
    }
);