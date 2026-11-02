const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const crypto = require("node:crypto");
const fs = require("node:fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);

// ===============================
// CONFIGURACIÓN GENERAL
// ===============================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Archivos privados: servirlos solo después de autenticar (más abajo).

// Permitir mostrar las fotos guardadas
// Fotos privadas: servirlas solo después de autenticar (más abajo).

// ===============================
// CONFIGURACIÓN MULTER
// ===============================

const directorioFotosProductos = path.join(__dirname, "uploads", "productos");
fs.mkdirSync(directorioFotosProductos, { recursive: true });

const almacenamiento = multer.diskStorage({

    destination: function (req, file, cb) {

        fs.mkdir(directorioFotosProductos, { recursive: true }, error => {
            cb(error, directorioFotosProductos);
        });

    },

    filename: function (req, file, cb) {

        const extension =
            path.extname(file.originalname);

        const nombreUnico =
            Date.now() +
            "-" +
            Math.round(Math.random() * 1000000) +
            extension;

        cb(
            null,
            nombreUnico
        );

    }

});

const subirFoto = multer({
    storage: almacenamiento,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter(req, file, cb) {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Solo se permiten fotografías de imagen.'));
        }
        cb(null, true);
    }
});

function recibirFotoProducto(req, res, next) {
    subirFoto.single('foto')(req, res, error => {
        if (!error) return next();
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ mensaje: 'La fotografía supera el límite de 10 MB.' });
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ mensaje: 'Se recibió un campo de fotografía inesperado.' });
        }
        console.error('Error al recibir fotografía del producto:', error);
        return res.status(400).json({ mensaje: error.message || 'No se pudo procesar la fotografía.' });
    });
}

// ===============================
// CONEXIÓN BASE DE DATOS
// ===============================

const rutaBD = path.join(
    __dirname,
    "database",
    "bodega.db"
);

require("fs").mkdirSync(path.dirname(rutaBD), { recursive: true });

// Permite que solicitudes simultáneas esperen brevemente a que SQLite libere
// el bloqueo de escritura, en lugar de fallar inmediatamente con SQLITE_BUSY.
// No cambia el contenido de la base de datos.
const SQLITE_BUSY_TIMEOUT_MS = 5000;

const db = new sqlite3.Database(rutaBD, (error) => {

    if (error) {

        console.error(
            "Error al conectar con la base de datos:",
            error.message
        );

        return;

    }

    console.log(
        "Base de datos conectada correctamente."
    );

});

// El tiempo de espera se aplica a esta conexión y a sus transacciones.
db.configure('busyTimeout', SQLITE_BUSY_TIMEOUT_MS);

// Inicializar las tablas esenciales ANTES de registrar rutas que crean índices o consultan stock.
// Se ejecutan en orden y no se eliminan ni reemplazan tablas existentes.
const esquemaBase = [
    'CREATE TABLE IF NOT EXISTS inventario_stock_minimo (producto_id INTEGER PRIMARY KEY REFERENCES productos(id), minimo INTEGER NOT NULL DEFAULT 0 CHECK(minimo >= 0))',
    'CREATE TABLE IF NOT EXISTS inventario_vencimientos (producto_id INTEGER PRIMARY KEY REFERENCES productos(id), fecha_vencimiento TEXT NOT NULL, aviso_dias INTEGER NOT NULL DEFAULT 30 CHECK(aviso_dias BETWEEN 0 AND 3650))',
    'CREATE TABLE IF NOT EXISTS inventario_vencimientos_series (serie_id INTEGER PRIMARY KEY REFERENCES productos_seriados(id), fecha_vencimiento TEXT NOT NULL, aviso_dias INTEGER NOT NULL DEFAULT 30 CHECK(aviso_dias BETWEEN 0 AND 3650))',
    'CREATE TABLE IF NOT EXISTS inventario_revisiones_series (id INTEGER PRIMARY KEY AUTOINCREMENT, serie_id INTEGER NOT NULL REFERENCES productos_seriados(id), fecha_revision TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, resultado TEXT NOT NULL CHECK(resultado IN (\'APROBADA\',\'OBSERVADA\',\'RECHAZADA\')), observaciones TEXT NOT NULL DEFAULT \'\')',
    'CREATE TABLE IF NOT EXISTS productos (\n\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n\n        codigo TEXT NOT NULL UNIQUE,\n\n        nombre TEXT NOT NULL,\n\n        descripcion TEXT,\n\n        tipo_control TEXT NOT NULL,\n\n        foto TEXT,\n\n        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP\n\n    )',
    "CREATE TABLE IF NOT EXISTS personal (\n\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n\n        nombre TEXT NOT NULL,\n\n        rut TEXT NOT NULL UNIQUE,\n\n        cargo TEXT NOT NULL,\n\n        telefono TEXT,\n\n        correo TEXT,\n\n        estado TEXT NOT NULL DEFAULT 'ACTIVO',\n\n        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP\n    )",
    "CREATE TABLE IF NOT EXISTS solicitudes (\n\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n\n        supervisor_id INTEGER NOT NULL,\n\n        estado TEXT NOT NULL\n            DEFAULT 'PENDIENTE',\n\n        observaciones TEXT,\n\n        fecha_solicitud DATETIME\n            DEFAULT CURRENT_TIMESTAMP,\n\n        FOREIGN KEY (supervisor_id)\n            REFERENCES personal(id)\n\n    )",
    "CREATE TABLE IF NOT EXISTS detalle_solicitudes (\n\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n\n        solicitud_id INTEGER NOT NULL,\n\n        producto_id INTEGER NOT NULL,\n\n        cantidad INTEGER NOT NULL DEFAULT 1,\n\n        estado TEXT NOT NULL\n            DEFAULT 'PENDIENTE',\n\n        FOREIGN KEY (solicitud_id)\n            REFERENCES solicitudes(id),\n\n        FOREIGN KEY (producto_id)\n            REFERENCES productos(id)\n\n    )",
    "CREATE TABLE IF NOT EXISTS ubicaciones (\n\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n\n        codigo TEXT NOT NULL UNIQUE,\n\n        bodega INTEGER NOT NULL,\n\n        pasillo INTEGER,\n\n        ubicacion INTEGER,\n\n        estado TEXT DEFAULT 'Disponible'\n\n    )",
    "CREATE TABLE IF NOT EXISTS productos_seriados (\n\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n\n        producto_id INTEGER NOT NULL,\n\n        numero_serie TEXT NOT NULL UNIQUE,\n\n        ubicacion_id INTEGER,\n\n        estado TEXT DEFAULT 'Disponible',\n\n        FOREIGN KEY (producto_id)\n            REFERENCES productos(id),\n\n        FOREIGN KEY (ubicacion_id)\n            REFERENCES ubicaciones(id)\n\n    )",
    'CREATE TABLE IF NOT EXISTS stock_cantidad (\n\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n\n        producto_id INTEGER NOT NULL,\n\n        ubicacion_id INTEGER NOT NULL,\n\n        cantidad INTEGER NOT NULL DEFAULT 0,\n\n        FOREIGN KEY (producto_id)\n            REFERENCES productos(id),\n\n        FOREIGN KEY (ubicacion_id)\n            REFERENCES ubicaciones(id)\n\n    )',
    'CREATE TABLE IF NOT EXISTS movimientos (\n\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n\n        tipo_movimiento TEXT NOT NULL,\n\n        producto_id INTEGER NOT NULL,\n\n        ubicacion_id INTEGER,\n\n        cantidad INTEGER,\n\n        numero_serie TEXT,\n\n        fecha_movimiento DATETIME\n            DEFAULT CURRENT_TIMESTAMP,\n\n        FOREIGN KEY (producto_id)\n            REFERENCES productos(id),\n\n        FOREIGN KEY (ubicacion_id)\n            REFERENCES ubicaciones(id)\n\n    )',
    "CREATE TABLE IF NOT EXISTS historial_solicitudes (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    solicitud_id INTEGER NOT NULL,\n    accion TEXT NOT NULL CHECK (accion IN ('PREPARACION', 'ENTREGA')),\n    usuario_id INTEGER NOT NULL,\n    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id)\n)",
    'CREATE TABLE IF NOT EXISTS solicitud_idempotencia (clave TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL, solicitud_id INTEGER UNIQUE, huella TEXT, creado DATETIME DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE IF NOT EXISTS historial_prioridades (id INTEGER PRIMARY KEY AUTOINCREMENT, solicitud_id INTEGER NOT NULL, prioridad_anterior TEXT NOT NULL, prioridad_nueva TEXT NOT NULL, usuario_id INTEGER NOT NULL, fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id))',
    // Registro acumulativo para futuras entregas parciales. No modifica el flujo
    // de entregas completas existente hasta integrar el endpoint transaccional.
    `CREATE TABLE IF NOT EXISTS entregas_parciales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        solicitud_id INTEGER NOT NULL REFERENCES solicitudes(id),
        usuario_id INTEGER NOT NULL,
        personal_destino_id INTEGER NOT NULL REFERENCES personal(id),
        fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS entregas_parciales_detalle (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entrega_id INTEGER NOT NULL REFERENCES entregas_parciales(id),
        producto_id INTEGER NOT NULL REFERENCES productos(id),
        cantidad INTEGER NOT NULL CHECK(cantidad > 0),
        UNIQUE(entrega_id, producto_id)
    )`,
    `CREATE TABLE IF NOT EXISTS entregas_parciales_idempotencia (
        clave TEXT PRIMARY KEY,
        solicitud_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        entrega_id INTEGER NOT NULL REFERENCES entregas_parciales(id)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_entregas_parciales_solicitud ON entregas_parciales(solicitud_id, id)',
    'CREATE INDEX IF NOT EXISTS idx_entregas_parciales_detalle_entrega ON entregas_parciales_detalle(entrega_id)' 
];
let resolverEsquema, rechazarEsquema;
const esquemaReady = new Promise((resolve, reject) => {
    resolverEsquema = resolve;
    rechazarEsquema = reject;
});
db.serialize(() => {
    let fallo = null;
    for (const sql of esquemaBase) {
        db.run(sql, error => {
            if (error && !fallo) fallo = error;
        });
    }
    // Migración compatible con bases existentes; se ejecuta antes de habilitar las rutas.
    db.all('PRAGMA table_info(solicitud_idempotencia)', (error, columnas) => {
        if (error) { if (!fallo) fallo = error; return; }
        if (!columnas.some(col => col.name === 'huella')) {
            db.run('ALTER TABLE solicitud_idempotencia ADD COLUMN huella TEXT', errorAlter => {
                if (errorAlter && !fallo) fallo = errorAlter;
            });
        }
    });
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='stock_cantidad'", (error, fila) => {
        if (fallo || error || !fila) rechazarEsquema(fallo || error || new Error('Falta stock_cantidad'));
        else resolverEsquema();
    });
});

// Recursos visuales públicos: deben cargarse incluso antes de iniciar sesión.
// Las páginas HTML, las API y los archivos de base de datos siguen protegidos.
// Limitar la exposición a directorios concretos, no a toda la carpeta public.
// Entregar el CSS unificado comprimido cuando el navegador admite gzip.
// El contenido se lee al arrancar: no se alteran reglas ni estilos.
const cssUnificado = fs.readFileSync(path.join(__dirname, 'public', 'css', 'styles.css'));
const cssGzip = require('node:zlib').gzipSync(cssUnificado, { level: 9 });
// Los ETag fuertes deben identificar los bytes realmente entregados.
const cssETagNormal = '"' + crypto.createHash('sha256').update(cssUnificado).digest('hex') + '"';
const cssETagGzip = '"' + crypto.createHash('sha256').update(cssGzip).digest('hex') + '"';
const { acceptsGzip, matchesETag } = require('./lib/css-http-cache');
app.get('/css/styles.css', (req, res) => {
    const gzipAccepted = acceptsGzip(req.get('accept-encoding'));
    const etag = gzipAccepted ? cssETagGzip : cssETagNormal;
    res.set('Vary', 'Accept-Encoding');
    res.set('Content-Type', 'text/css; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=0, must-revalidate');
    res.set('ETag', etag);
    if (gzipAccepted) res.set('Content-Encoding', 'gzip');
    if (matchesETag(req.get('if-none-match'), etag)) return res.status(304).end();
    return res.send(gzipAccepted ? cssGzip : cssUnificado);
});
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/img', express.static(path.join(__dirname, 'public', 'img')));

// Inicio protegido: las rutas de login son públicas; el resto requiere sesión.
const authReady = require('./auth')(app, db);
app.use((req,res,next)=>authReady.then(()=>next()).catch(next));
app.use((req,res,next)=>{
  if(['POST','PUT','PATCH','DELETE'].includes(req.method)){
    const origin=req.get('origin');
    if(origin){
      const allowed=new URL(`${req.protocol}://${req.get('host')}`).origin;
      if(origin!==allowed)return res.status(403).json({error:'Origen de solicitud no autorizado'});
    }
  }
  next();
});
app.use(async (req,res,next)=>{
  if(req.path==='/login.html'||req.path==='/api/auth/login'||req.path==='/favicon.ico') return next();
  try {
    await authReady;
    const crypto=require('crypto');
    const cookie=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('bodega_session='));
    const token=cookie?decodeURIComponent(cookie.split('=').slice(1).join('=')):'';
    const hash=crypto.createHash('sha256').update(token).digest('hex');
    db.get(`SELECT u.id,u.usuario,u.nombre,u.rol,u.personal_id FROM sesiones_app s JOIN usuarios_app u ON u.id=s.usuario_id WHERE s.token_hash=? AND s.expira>? AND u.activo=1`,[hash,Date.now()],(e,u)=>{
      if(e)return res.status(500).json({error:'Error de sesión'});
      if(!u)return req.path.startsWith('/api/')?res.status(401).json({error:'Inicia sesión'}):res.redirect('/login.html');
      req.usuario=u;
      // No existe todavía una relación verificable entre usuarios TECNICO y personal.
      // Evitar exponer solicitudes de otros destinatarios hasta implementar ese vínculo.
      if (u.rol === 'TECNICO' && req.method === 'GET' &&
          /^\/api\/solicitudes(?:\/|$)/.test(req.path)) {
        return res.status(403).json({error:'La consulta de solicitudes para técnicos requiere vincular la cuenta con su ficha de personal'});
      }
      if(req.path.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(req.method)){
        // Las operaciones de preparación y entrega requieren un perfil de bodega.
        // Se comprueba en el servidor, independientemente de los botones visibles.
        if (/^\/api\/solicitudes\/\d+\/(preparar|entregar)$/.test(req.path) &&
            !['ADMIN', 'BODEGA'].includes(u.rol)) {
          return res.status(403).json({error:'Solo Administración o Bodega pueden preparar o entregar solicitudes'});
        }
        if(u.rol==='CONSULTA')return res.status(403).json({error:'Solo lectura'});
        if((req.path.includes('transferencias-proyectos')||req.path.includes('stock-proyectos'))&&!['ADMIN','BODEGA'].includes(u.rol))return res.status(403).json({error:'Sin permisos de inventario'});
        if(u.rol==='TECNICO')return res.status(403).json({error:'Solo consulta hasta habilitar flujos por trabajador'});
        if(u.rol==='SUPERVISOR' && !(req.method==='POST' && req.path==='/api/solicitudes') && !(req.method==='PATCH' && /^\/api\/solicitudes\/\d+\/prioridad$/.test(req.path)))return res.status(403).json({error:'Solo puede crear solicitudes'});
      }
      next();
    });
  }catch(e){next(e);}
});
app.use(express.static(path.join(__dirname,'public')));
app.use('/uploads',express.static(path.join(__dirname,'uploads')));

// Gestión de proyectos (sin afectar stock existente).
require("./routes/proyectos")(app, db);
require("./routes/stock-proyectos")(app, db);
require("./routes/series-proyectos")(app, db);
require("./routes/inventario-proyecto")(app, db);

// Estructuras configurables V6.
require("./routes/estructuras-v6")(app, db);

// Reportes de gestión e indicadores.
require("./routes/reportes-v5")(app, db);
require("./routes/auditoria-inventario")(app, db);

// Operaciones integradas: traslados, devoluciones e historial por persona.
require("./routes/movimientos")(app, db);
require("./routes/operaciones-integrales")(app, db);

// ===============================
// TABLA PRODUCTOS
// ===============================

db.run(`
    CREATE TABLE IF NOT EXISTS productos (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        codigo TEXT NOT NULL UNIQUE,

        nombre TEXT NOT NULL,

        descripcion TEXT,

        tipo_control TEXT NOT NULL,

        foto TEXT,

        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP

    )
`);


// ===============================
// TABLA PERSONAL
// ===============================

db.run(`
    CREATE TABLE IF NOT EXISTS personal (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        nombre TEXT NOT NULL,

        rut TEXT NOT NULL UNIQUE,

        cargo TEXT NOT NULL,

        telefono TEXT,

        correo TEXT,

        estado TEXT NOT NULL DEFAULT 'ACTIVO',

        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Historial independiente: no modifica los estados ni los movimientos de stock.
db.run(`CREATE TABLE IF NOT EXISTS historial_solicitudes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    solicitud_id INTEGER NOT NULL,
    accion TEXT NOT NULL CHECK (accion IN ('PREPARACION', 'ENTREGA')),
    usuario_id INTEGER NOT NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id)
)`);
db.run('CREATE INDEX IF NOT EXISTS idx_historial_solicitudes_id ON historial_solicitudes(solicitud_id, id)');
// Auditoría separada para cambios de prioridad.
db.run(`CREATE TABLE IF NOT EXISTS historial_prioridades (id INTEGER PRIMARY KEY AUTOINCREMENT, solicitud_id INTEGER NOT NULL, prioridad_anterior TEXT NOT NULL, prioridad_nueva TEXT NOT NULL, usuario_id INTEGER NOT NULL, fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id))`);


// ===============================
// TABLA SOLICITUDES
// ===============================

db.run(`
    CREATE TABLE IF NOT EXISTS solicitudes (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        supervisor_id INTEGER NOT NULL,

        estado TEXT NOT NULL
            DEFAULT 'PENDIENTE',

        observaciones TEXT,

        fecha_solicitud DATETIME
            DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (supervisor_id)
            REFERENCES personal(id)

    )
`);

// ===============================
// TABLA DETALLE SOLICITUDES
// ===============================

db.run(`
    CREATE TABLE IF NOT EXISTS detalle_solicitudes (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        solicitud_id INTEGER NOT NULL,

        producto_id INTEGER NOT NULL,

        cantidad INTEGER NOT NULL DEFAULT 1,

        estado TEXT NOT NULL
            DEFAULT 'PENDIENTE',

        FOREIGN KEY (solicitud_id)
            REFERENCES solicitudes(id),

        FOREIGN KEY (producto_id)
            REFERENCES productos(id)

    )
`);

// ===============================
// TABLA MOVIMIENTOS
// ===============================

db.run(`
    CREATE TABLE IF NOT EXISTS movimientos (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        tipo_movimiento TEXT NOT NULL,

        producto_id INTEGER NOT NULL,

        ubicacion_id INTEGER,

        cantidad INTEGER,

        numero_serie TEXT,

        fecha_movimiento DATETIME
            DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (producto_id)
            REFERENCES productos(id),

        FOREIGN KEY (ubicacion_id)
            REFERENCES ubicaciones(id)

    )
`);

// Columna de destino para registrar traslados de forma auditable.
db.run('ALTER TABLE movimientos ADD COLUMN ubicacion_destino_id INTEGER', error => {
    if(error && !/duplicate column name/i.test(error.message))
        console.error('Migración destino de movimientos:', error);
});

// ===============================
// AGREGAR PERSONAL A MOVIMIENTOS
// ===============================

db.run(
    `
    ALTER TABLE movimientos
    ADD COLUMN personal_id INTEGER
    `,
    (error) => {

        if (
            error &&
            !error.message.includes(
                "duplicate column name"
            )
        ) {
            console.error(
                "Error al agregar personal_id:",
                error
            );
        }
    }
);

// ===============================
// MIGRACIÓN SOLICITUDES
// DESTINATARIO DE LA SOLICITUD
// ===============================

db.all(
    `PRAGMA table_info(solicitudes)`,
    (error, columnas) => {

        if (error) {
            console.error(
                "Error al revisar tabla solicitudes:",
                error
            );
            return;
        }

        const existePersonalDestino =
            columnas.some(
                columna =>
                    columna.name ===
                    "personal_destino_id"
            );

        if (!existePersonalDestino) {

            db.run(
                `
                ALTER TABLE solicitudes
                ADD COLUMN personal_destino_id INTEGER
                `,
                (errorAlter) => {

                    if (errorAlter) {
                        console.error(
                            "Error al agregar personal_destino_id:",
                            errorAlter
                        );
                        return;
                    }

                    console.log(
                        "Campo personal_destino_id agregado a solicitudes."
                    );
                }
            );
        }
    }
);

// ===============================
// TABLA UBICACIONES
// ===============================

db.run(`
    CREATE TABLE IF NOT EXISTS ubicaciones (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        codigo TEXT NOT NULL UNIQUE,

        bodega INTEGER NOT NULL,

        pasillo INTEGER,

        ubicacion INTEGER,

        estado TEXT DEFAULT 'Disponible'

    )
`);

// ===============================
// TABLA PRODUCTOS SERIADOS
// ===============================

db.run(`
    CREATE TABLE IF NOT EXISTS productos_seriados (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        producto_id INTEGER NOT NULL,

        numero_serie TEXT NOT NULL UNIQUE,

        ubicacion_id INTEGER,

        estado TEXT DEFAULT 'Disponible',

        FOREIGN KEY (producto_id)
            REFERENCES productos(id),

        FOREIGN KEY (ubicacion_id)
            REFERENCES ubicaciones(id)

    )
`);

// ===============================
// TABLA STOCK POR CANTIDAD
// ===============================

db.run(`
    CREATE TABLE IF NOT EXISTS stock_cantidad (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        producto_id INTEGER NOT NULL,

        ubicacion_id INTEGER NOT NULL,

        cantidad INTEGER NOT NULL DEFAULT 0,

        FOREIGN KEY (producto_id)
            REFERENCES productos(id),

        FOREIGN KEY (ubicacion_id)
            REFERENCES ubicaciones(id)

    )
`);

// Prioridad operativa de solicitudes anteriores: NORMAL por defecto.
db.run("ALTER TABLE solicitudes ADD COLUMN prioridad TEXT NOT NULL DEFAULT 'NORMAL' CHECK (prioridad IN ('NORMAL','ALTA','URGENTE'))", error => {
    if (error && !/duplicate column name/i.test(error.message)) console.error('Migración prioridad:', error.message);
});

// Proyecto opcional de la solicitud (compatible con solicitudes anteriores).
db.serialize(() => {
    db.all('PRAGMA table_info(solicitudes)', [], (error, cols) => {
        if (!error && !cols.some(c => c.name === 'proyecto_id')) {
            db.run('ALTER TABLE solicitudes ADD COLUMN proyecto_id INTEGER REFERENCES proyectos(id)');
        }
    });
});

// ===============================
// CREAR SOLICITUD
// ===============================

app.post(
    "/api/solicitudes",
    (req, res) => {

        // Clave estable enviada por el cliente para reintentos de la misma operación.
        const claveReintento = req.get('Idempotency-Key');
        if (typeof claveReintento !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(claveReintento)) {
            return res.status(400).json({ mensaje: 'Falta el identificador seguro de la solicitud.' });
        }
        const usuarioSolicitudId = Number(req.usuario?.id);
        if (!Number.isSafeInteger(usuarioSolicitudId) || usuarioSolicitudId <= 0) {
            return res.status(401).json({ mensaje: 'Sesión no válida.' });
        }
        const claveUnica = `${usuarioSolicitudId}:${claveReintento}`;
        // Express puede recibir JSON null o un array: no desestructurar sin validar.
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
            return res.status(400).json({ mensaje: 'Los datos de la solicitud no son válidos.' });
        }
        const {
            supervisorId,
            personalDestinoId,
            observaciones,
            productos,
            proyectoId,
            prioridad = "NORMAL"
        } = req.body;

// Evitar registrar en logs datos personales y detalles de solicitudes.

        // ===============================
        // VALIDACIONES
        // ===============================

        // Validar identificadores antes de consultar la base de datos.
        // Number(null) === 0 y los valores decimales no son identificadores válidos.
        if (![supervisorId, personalDestinoId].every(
            id => id !== null && id !== undefined && id !== '' &&
                Number.isSafeInteger(Number(id)) && Number(id) > 0
        )) {
            return res.status(400).json({ mensaje: 'Supervisor o destinatario no válido.' });
        }

        if (!['ADMIN', 'SUPERVISOR'].includes(req.usuario?.rol)) {
            return res.status(403).json({ mensaje: 'Sin permiso para crear solicitudes.' });
        }

        if (!supervisorId) {

            return res.status(400).json({
                mensaje:
                    "Debes seleccionar un supervisor."
            });
        }

        if (
            !Array.isArray(productos) ||
            productos.length === 0
        ) {

            return res.status(400).json({
                mensaje:
                    "La solicitud debe contener al menos un producto."
            });
        }

        // Acotar el detalle antes de generar consultas SQL y huellas de reintento.
        if (productos.length > 500) {
            return res.status(400).json({ mensaje: 'La solicitud supera el máximo de 500 productos.' });
        }

        // El proyecto es obligatorio; nunca se acepta una solicitud sin proyecto.
        if (proyectoId === undefined || proyectoId === null || proyectoId === '' ||
            !Number.isSafeInteger(Number(proyectoId)) || Number(proyectoId) <= 0) {
            return res.status(400).json({mensaje:'Debes seleccionar un proyecto activo.'});
        }
        // Rechazar filas nulas, valores no decimales y productos repetidos antes de calcular la huella.
        const enteroPositivo = valor =>
            (typeof valor === 'number' && Number.isSafeInteger(valor) && valor > 0) ||
            (typeof valor === 'string' && /^[1-9]\d*$/.test(valor) &&
                Number.isSafeInteger(Number(valor)));
        if (productos.some(item => !item || typeof item !== 'object' || Array.isArray(item) ||
            !enteroPositivo(item.productoId) || !enteroPositivo(item.cantidad))) {
            return res.status(400).json({mensaje:'Detalle de productos inválido'});
        }
        if (new Set(productos.map(item => Number(item.productoId))).size !== productos.length) {
            return res.status(400).json({mensaje:'La solicitud contiene productos repetidos.'});
        }
        // La clave de reintento solo puede representar exactamente el mismo contenido.
        // Ordenar productos evita falsos cambios si el formulario reordena filas.
        const contenidoSolicitud = JSON.stringify({
            supervisorId: Number(supervisorId),
            personalDestinoId: Number(personalDestinoId),
            proyectoId: Number(proyectoId),
            prioridad,
            observaciones: observaciones || null,
            productos: productos.map(item => [Number(item.productoId), Number(item.cantidad)])
                .sort((a, b) => a[0] - b[0])
        });
        const huellaSolicitud = crypto.createHash('sha256').update(contenidoSolicitud).digest('hex');

        // ===============================
        // VALIDAR SUPERVISOR
        // ===============================

        db.get(
            `
            SELECT id
            FROM personal
            WHERE id = ?
              AND cargo = 'SUPERVISOR'
              AND estado = 'ACTIVO'
            `,
            [supervisorId],
            (errorSupervisor, supervisor) => {

                if (errorSupervisor) {

                    console.error(
                        "Error al validar supervisor:",
                        errorSupervisor
                    );

                    return res.status(500).json({
                        mensaje:
                            "Error al validar el supervisor."
                    });
                }

                if (!supervisor) {

                    return res.status(400).json({
                        mensaje:
                            "El supervisor seleccionado no es válido."
                    });
                }

                // ===============================
                // VALIDAR DESTINATARIO
                // ===============================

                db.get(
                    `
    SELECT id
    FROM personal
    WHERE id = ?
      AND cargo IN ('TECNICO', 'ASISTENTE')
      AND estado = 'ACTIVO'
    `,
                    [personalDestinoId],
                    (errorDestino, destinatario) => {

                        if (errorDestino) {

                            console.error(
                                "Error al validar destinatario:",
                                errorDestino
                            );

                            return res.status(500).json({
                                mensaje:
                                    "Error al validar el destinatario."
                            });
                        }

                        if (!destinatario) {

                            return res.status(400).json({
                                mensaje:
                                    "El técnico o asistente seleccionado no es válido."
                            });
                        }

                        // AQUÍ CONTINUARÁ CREAR SOLICITUD



                        if (!['NORMAL', 'ALTA', 'URGENTE'].includes(prioridad)) {
                            return res.status(400).json({ mensaje: 'Prioridad inválida.' });
                        }

                        // Validar la asignación proyecto -> supervisor -> bodega en el servidor.
                        // No confiar en los selectores enviados desde el navegador.
                        db.get(`SELECT id, supervisor_personal_id, bodega_numero, estado
                                FROM proyectos WHERE id=?`, [Number(proyectoId)],
                            (errorProyecto, proyectoAsignado) => {
                            if (errorProyecto) return res.status(500).json({mensaje:'Error al validar el proyecto'});
                            if (!proyectoAsignado || proyectoAsignado.estado !== 'ACTIVO')
                                return res.status(400).json({mensaje:'Proyecto inexistente o inactivo'});
                            if (Number(proyectoAsignado.supervisor_personal_id) !== Number(supervisorId) ||
                                !Number.isSafeInteger(Number(proyectoAsignado.bodega_numero)) ||
                                Number(proyectoAsignado.bodega_numero) <= 0)
                                return res.status(403).json({mensaje:'El proyecto debe estar asignado a este supervisor y tener una bodega vinculada'});
                            // Supervisores no pueden suplantar otra ficha de personal.
                            // La cuenta debe coincidir con una ficha identificada por su usuario.
                            if (req.usuario.rol === 'SUPERVISOR') {
                                return db.get('SELECT id FROM personal WHERE id=? AND (LOWER(correo)=LOWER(?) OR LOWER(rut)=LOWER(?))',
                                    [supervisorId, req.usuario.usuario, req.usuario.usuario], (e, vinculo) => {
                                        if(e)return res.status(500).json({mensaje:'Error validando la identidad'});
                                        if(!vinculo)return res.status(403).json({mensaje:'La cuenta no está vinculada a la ficha del supervisor'});
                                        validarBodegaYCrear();
                                    });
                            }
                            validarBodegaYCrear();

                            function validarBodegaYCrear() {
                                // La bodega debe seguir existiendo al registrar la solicitud.
                                // No se acepta una bodega elegida o manipulada desde el cliente.
                                db.get('SELECT 1 AS existe FROM ubicaciones WHERE bodega=? LIMIT 1',
                                    [proyectoAsignado.bodega_numero], (errorBodega, ubicacion) => {
                                        if (errorBodega) return res.status(500).json({ mensaje: 'Error al verificar la bodega del proyecto.' });
                                        if (!ubicacion) return res.status(409).json({ mensaje: 'La bodega vinculada al proyecto ya no tiene ubicaciones. Actualiza la asignación del proyecto.' });
                                        validarProductosYCrear();
                                    });
                            }
                            // No permitir detalles con productos inexistentes ni IDs repetidos.
                            function validarProductosYCrear() {
                                const ids = productos.map(item => Number(item.productoId));
                                if (new Set(ids).size !== ids.length) {
                                    return res.status(400).json({ mensaje: 'No repitas un producto: modifica su cantidad en el detalle.' });
                                }
                                const placeholders = ids.map(() => '?').join(',');
                                db.get(`SELECT COUNT(*) AS total FROM productos WHERE id IN (${placeholders})`, ids,
                                    (errorProductos, resultado) => {
                                        if (errorProductos) return res.status(500).json({ mensaje: 'No se pudieron validar los productos.' });
                                        if (!resultado || resultado.total !== ids.length) {
                                            return res.status(400).json({ mensaje: 'Uno o más productos ya no existen. Actualiza la selección.' });
                                        }
                                        crearSolicitudValidada(proyectoAsignado.bodega_numero);
                                    });
                            }
                        });
                        function crearSolicitudValidada(bodegaProyecto) {
                        // ===============================
                        // CREAR SOLICITUD
                        // ===============================

                        // Una solicitud y todos sus productos se guardan como unidad.
                        // serialize evita intercalar operaciones de otras peticiones en esta conexión.
                        db.serialize(() => {
                            db.run('BEGIN IMMEDIATE TRANSACTION', errorInicio => {
                                if (errorInicio) return res.status(503).json({ mensaje: 'No se pudo iniciar el registro de la solicitud.' });

                                const revertir = (error) => {
                                    console.error('Error al registrar solicitud completa:', error);
                                    db.run('ROLLBACK', errorRollback => {
                                        if (errorRollback) console.error('Error al revertir solicitud:', errorRollback);
                                        return res.status(500).json({ mensaje: 'No se guardó la solicitud. Intenta nuevamente.' });
                                    });
                                };

                                // Reserva atómica de la clave en la misma transacción.
                                // Si ya existe, la solicitud anterior se devuelve sin duplicarla.
                                db.run('INSERT INTO solicitud_idempotencia (clave, usuario_id, huella) VALUES (?, ?, ?)',
                                    [claveUnica, usuarioSolicitudId, huellaSolicitud], errorClave => {
                                    if (errorClave) {
                                        return db.run('ROLLBACK', () => {
                                            if (errorClave.code !== 'SQLITE_CONSTRAINT') {
                                                return res.status(500).json({ mensaje: 'No se pudo validar el reintento.' });
                                            }
                                            db.get('SELECT solicitud_id, huella FROM solicitud_idempotencia WHERE clave=? AND usuario_id=?',
                                                [claveUnica, usuarioSolicitudId], (errorConsulta, anterior) => {
                                                if (errorConsulta || !anterior?.solicitud_id) return res.status(409).json({ mensaje: 'La solicitud aún se está procesando. Intenta nuevamente.' });
                                                if (!anterior.huella || anterior.huella !== huellaSolicitud) {
                                                    return res.status(409).json({ mensaje: 'Esta clave ya corresponde a una solicitud diferente. Actualiza el formulario y vuelve a intentar.' });
                                                }
                                                return res.status(200).json({ mensaje: 'Solicitud registrada anteriormente.', solicitudId: anterior.solicitud_id, repetida: true });
                                            });
                                        });
                                    }
                                    insertarSolicitud();
                                });
                                function insertarSolicitud() {
                                db.run(`INSERT INTO solicitudes
                                    (supervisor_id, personal_destino_id, observaciones, proyecto_id, prioridad)
                                    SELECT ?, ?, ?, ?, ?
                                    WHERE EXISTS (SELECT 1 FROM proyectos
                                        WHERE id = ? AND estado = 'ACTIVO'
                                        AND supervisor_personal_id = ? AND bodega_numero = ?)`,
                                    [supervisorId, personalDestinoId, observaciones || null,
                                        Number(proyectoId), prioridad, Number(proyectoId),
                                        Number(supervisorId), Number(bodegaProyecto)],
                                    function (errorSolicitud) {
                                        if (errorSolicitud) return revertir(errorSolicitud);
                                        if (this.changes !== 1) {
                                            return db.run('ROLLBACK', () => res.status(409).json({
                                                mensaje: 'La asignación del proyecto cambió. Actualiza el formulario.'
                                            }));
                                        }
                                        const solicitudId = this.lastID;
                                        const guardarProducto = (indice) => {
                                            if (indice === productos.length) {
                                                return db.run('UPDATE solicitud_idempotencia SET solicitud_id=? WHERE clave=?',
                                                    [solicitudId, claveUnica], errorClaveFinal => {
                                                    if (errorClaveFinal) return revertir(errorClaveFinal);
                                                    db.run('COMMIT', errorCommit => {
                                                        if (errorCommit) return revertir(errorCommit);
                                                        res.status(201).json({ mensaje: 'Solicitud creada correctamente.', solicitudId });
                                                    });
                                                });
                                            }
                                            const item = productos[indice];
                                            db.run(`INSERT INTO detalle_solicitudes
                                                (solicitud_id, producto_id, cantidad) VALUES (?, ?, ?)`,
                                                [solicitudId, Number(item.productoId), Number(item.cantidad)],
                                                errorDetalle => errorDetalle ? revertir(errorDetalle) : guardarProducto(indice + 1));
                                        };
                                        guardarProducto(0);
                                    });
                                } // insertarSolicitud
                            });
                        });
                        } // crearSolicitudValidada
                    }
                );
            }
        );
    }
);        




        // ===============================
// Historial de preparación y entrega, disponible para usuarios autenticados.
app.get('/api/solicitudes/:id/historial', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ mensaje: 'Solicitud no válida.' });
    db.get('SELECT id FROM solicitudes WHERE id=?', [id], (err, solicitud) => {
        if (err) return res.status(500).json({ mensaje: 'Error al consultar la solicitud.' });
        if (!solicitud) return res.status(404).json({ mensaje: 'La solicitud no existe.' });
        db.all(`SELECT h.id, h.accion, h.fecha, h.usuario_id, u.nombre AS usuario
                FROM historial_solicitudes h
                LEFT JOIN usuarios_app u ON u.id=h.usuario_id
                WHERE h.solicitud_id=? ORDER BY h.id ASC`, [id], (error, filas) => {
            if (error) return res.status(500).json({ mensaje: 'Error al consultar el historial.' });
            res.json(filas);
        });
    });
});

// Modificación de prioridad permitida solo en solicitudes pendientes.
app.patch('/api/solicitudes/:id/prioridad', (req, res) => {
    if (!['ADMIN','SUPERVISOR'].includes(req.usuario.rol)) return res.status(403).json({mensaje:'Sin permiso para cambiar prioridades.'});
    const id = Number(req.params.id);
    const prioridad = req.body?.prioridad;
    if (!Number.isSafeInteger(id) || id <= 0 || !['NORMAL','ALTA','URGENTE'].includes(prioridad)) return res.status(400).json({mensaje:'Solicitud o prioridad no válida.'});
    db.serialize(() => {
        db.run('BEGIN IMMEDIATE TRANSACTION', error => {
            if (error) return res.status(500).json({mensaje:'No se pudo iniciar la actualización.'});
            const rollback = (status, mensaje) => db.run('ROLLBACK', () => res.status(status).json({mensaje}));
            const filtroPropietario = req.usuario.rol === 'SUPERVISOR'
                ? ` AND EXISTS (SELECT 1 FROM personal identidad
                      WHERE identidad.id = solicitudes.supervisor_id
                        AND (LOWER(identidad.correo)=LOWER(?) OR LOWER(identidad.rut)=LOWER(?)))`
                : '';
            const parametrosPropietario = req.usuario.rol === 'SUPERVISOR'
                ? [id, req.usuario.usuario, req.usuario.usuario] : [id];
            db.get(`SELECT estado, prioridad FROM solicitudes WHERE id=?${filtroPropietario}`, parametrosPropietario, (err, fila) => {
                if (err) return rollback(500,'Error al consultar solicitud.');
                if (!fila) return rollback(404,'Solicitud no encontrada.');
                if (fila.estado !== 'PENDIENTE') return rollback(409,'Solo se puede cambiar la prioridad de solicitudes pendientes.');
                const anterior = fila.prioridad || 'NORMAL';
                if (anterior === prioridad) return db.run('COMMIT', e => e ? res.status(500).json({mensaje:'Error al finalizar.'}) : res.json({id, prioridad, sinCambios:true}));
                db.run('UPDATE solicitudes SET prioridad=? WHERE id=? AND estado=?', [prioridad,id,'PENDIENTE'], function(e) {
                    if (e || this.changes !== 1) return rollback(409,'No se pudo actualizar la solicitud.');
                    db.run('INSERT INTO historial_prioridades (solicitud_id, prioridad_anterior, prioridad_nueva, usuario_id) VALUES (?,?,?,?)', [id,anterior,prioridad,req.usuario.id], err2 => {
                        if (err2) return rollback(500,'No se pudo registrar la auditoría.');
                        db.run('COMMIT', err3 => err3 ? res.status(500).json({mensaje:'Error al confirmar cambio.'}) : res.json({id,prioridad,prioridadAnterior:anterior}));
                    });
                });
            });
        });
    });
});
app.get('/api/solicitudes/:id/historial-prioridades', (req,res) => {
    const id=Number(req.params.id);
    if (!Number.isSafeInteger(id)||id<=0) return res.status(400).json({mensaje:'Solicitud no válida.'});
    db.all(`SELECT h.prioridad_anterior, h.prioridad_nueva, h.fecha, u.nombre AS usuario FROM historial_prioridades h LEFT JOIN usuarios_app u ON u.id=h.usuario_id WHERE h.solicitud_id=? ORDER BY h.id DESC`,[id],(err,filas)=>err?res.status(500).json({mensaje:'Error al consultar historial.'}):res.json(filas));
});

// Consulta de saldos de entregas parciales (solo lectura).
// La lectura no descuenta stock ni cambia el estado de la solicitud.
app.get('/api/solicitudes/:id/saldos', (req, res) => {
    const id = Number(req.params.id);
    if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(id)) {
        return res.status(400).json({ mensaje: 'Solicitud no válida.' });
    }
    const esSupervisor = req.usuario.rol === 'SUPERVISOR';
    const acceso = esSupervisor ? `AND EXISTS (
        SELECT 1 FROM personal identidad
        WHERE identidad.id = s.supervisor_id
          AND (LOWER(identidad.correo) = LOWER(?) OR LOWER(identidad.rut) = LOWER(?))
    )` : '';
    const params = esSupervisor ? [id, req.usuario.usuario, req.usuario.usuario] : [id];
    db.get(`SELECT s.id, s.estado FROM solicitudes s WHERE s.id = ? ${acceso}`, params, (err, solicitud) => {
        if (err) return res.status(500).json({ mensaje: 'Error al consultar la solicitud.' });
        if (!solicitud) return res.status(404).json({ mensaje: 'Solicitud no encontrada.' });
        db.all(`SELECT d.producto_id AS productoId,
                       SUM(d.cantidad) AS cantidadSolicitada,
                       COALESCE((SELECT SUM(epd.cantidad)
                                 FROM entregas_parciales_detalle epd
                                 JOIN entregas_parciales ep ON ep.id = epd.entrega_id
                                 WHERE ep.solicitud_id = d.solicitud_id
                                   AND epd.producto_id = d.producto_id), 0) AS cantidadEntregada
                FROM detalle_solicitudes d
                WHERE d.solicitud_id = ?
                GROUP BY d.producto_id ORDER BY d.producto_id`, [id], (error, filas) => {
            if (error) return res.status(500).json({ mensaje: 'Error al consultar saldos.' });
            if (!Array.isArray(filas)) return res.status(500).json({ mensaje: 'Error al consultar saldos.' });
            const detalle = filas.map(fila => ({
                productoId: fila.productoId,
                cantidadSolicitada: fila.cantidadSolicitada,
                cantidadEntregada: fila.cantidadEntregada,
                saldoPendiente: fila.cantidadSolicitada - fila.cantidadEntregada
            }));
            if (detalle.some(f => !Number.isSafeInteger(f.productoId) || f.productoId <= 0 ||
                !Number.isSafeInteger(f.cantidadSolicitada) || f.cantidadSolicitada <= 0 ||
                !Number.isSafeInteger(f.cantidadEntregada) || f.cantidadEntregada < 0 ||
                !Number.isSafeInteger(f.saldoPendiente) || f.saldoPendiente < 0)) {
                return res.status(409).json({ mensaje: 'Inconsistencia en el registro de entregas parciales.' });
            }
            return res.json({ solicitudId: id, estado: solicitud.estado, detalle,
                completa: detalle.length > 0 && detalle.every(f => f.saldoPendiente === 0) });
        });
    });
});

// Historial detallado de entregas parciales, limitado a la solicitud consultada.
// La misma regla de visibilidad de /saldos protege a los supervisores.
app.get('/api/solicitudes/:id/entregas-parciales', (req, res) => {
    const id = Number(req.params.id);
    if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(id)) {
        return res.status(400).json({ mensaje: 'Solicitud no válida.' });
    }
    const esSupervisor = req.usuario.rol === 'SUPERVISOR';
    const acceso = esSupervisor ? `AND EXISTS (
        SELECT 1 FROM personal identidad WHERE identidad.id=s.supervisor_id
        AND (LOWER(identidad.correo)=LOWER(?) OR LOWER(identidad.rut)=LOWER(?))
    )` : '';
    const params = esSupervisor ? [id, req.usuario.usuario, req.usuario.usuario] : [id];
    db.get(`SELECT s.id FROM solicitudes s WHERE s.id=? ${acceso}`, params, (error, solicitud) => {
        if (error) return res.status(500).json({ mensaje: 'Error al consultar la solicitud.' });
        if (!solicitud) return res.status(404).json({ mensaje: 'Solicitud no encontrada.' });
        db.all(`SELECT ep.id AS entregaId, ep.fecha, ep.usuario_id AS usuarioId,
                       ep.personal_destino_id AS personalDestinoId,
                       epd.producto_id AS productoId, epd.cantidad
                FROM entregas_parciales ep
                JOIN entregas_parciales_detalle epd ON epd.entrega_id=ep.id
                WHERE ep.solicitud_id=?
                ORDER BY ep.id ASC, epd.producto_id ASC`, [id], (err, filas) => {
            if (err) return res.status(500).json({ mensaje: 'Error al consultar las entregas parciales.' });
            const entregas = [];
            for (const fila of filas) {
                let entrega = entregas[entregas.length - 1];
                if (!entrega || entrega.entregaId !== fila.entregaId) {
                    entrega = { entregaId: fila.entregaId, fecha: fila.fecha,
                        usuarioId: fila.usuarioId, personalDestinoId: fila.personalDestinoId, productos: [] };
                    entregas.push(entrega);
                }
                entrega.productos.push({ productoId: fila.productoId, cantidad: fila.cantidad });
            }
            res.json({ solicitudId: id, entregas });
        });
    });
});

// Entrega parcial transaccional de productos controlados por CANTIDAD.
// Las series se mantienen en el flujo de entrega completo hasta implementar
// la selección y trazabilidad individual en entregas parciales.
app.post('/api/solicitudes/:id/entregar-parcial', (req, res) => {
    if (!['ADMIN', 'BODEGA'].includes(req.usuario?.rol)) {
        return res.status(403).json({ mensaje: 'Sin permiso para registrar entregas parciales.' });
    }
    const claveIdempotencia = req.get ? req.get('Idempotency-Key') : req.headers?.['idempotency-key'];
    // La clave es obligatoria: sin ella un cliente externo podría repetir
    // un descuento tras perder la respuesta, aunque la interfaz esté protegida.
    if (typeof claveIdempotencia !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(claveIdempotencia)) {
        return res.status(400).json({ mensaje: 'Clave de entrega inválida.' });
    }
    const solicitudId = Number(req.params.id);
    const { personalId, productos } = req.body && !Array.isArray(req.body) ? req.body : {};
    const idValido = n => Number.isSafeInteger(Number(n)) && Number(n) > 0 && /^(?:[1-9]\d*)$/.test(String(n));
    if (!idValido(req.params.id) || !idValido(personalId)) return res.status(400).json({ mensaje: 'Identificadores inválidos.' });
    const validar = require('./routes/validar-entrega');
    const errorCarga = validar(productos);
    if (errorCarga) return res.status(400).json({ mensaje: errorCarga });
    // El validador acepta enteros decimales como texto. Normalizar antes de
    // comparar con filas SQLite (numéricas), calcular saldos y descontar stock.
    const productosNormalizados = productos.map(p => ({
        ...p, productoId: Number(p.productoId), cantidad: Number(p.cantidad)
    }));
    if (productosNormalizados.some(p => p.tipoControl !== 'CANTIDAD')) {
        return res.status(400).json({ mensaje: 'La entrega parcial de productos seriados todavía no está disponible.' });
    }
    db.serialize(() => {
        db.run('BEGIN IMMEDIATE TRANSACTION', errorInicio => {
            if (errorInicio) return res.status(['SQLITE_BUSY','SQLITE_LOCKED'].includes(errorInicio.code) ? 503 : 500)
                .json({ mensaje: 'No se pudo iniciar la entrega parcial.' });
            let terminada = false;
            const revertir = (codigo, mensaje) => {
                if (terminada) return;
                terminada = true;
                db.run('ROLLBACK', err => res.status(err ? 500 : codigo).json({ mensaje: err ? 'Error al revertir la transacción.' : mensaje }));
            };
            const ejecutar = (sql, params = []) => new Promise((resolve, reject) => {
                db.run(sql, params, function(err) { err ? reject(err) : resolve({ changes: this.changes, id: this.lastID }); });
            });
            const uno = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
            const todos = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
            (async () => {
                // Un reintento tras perder la respuesta debe devolver la entrega ya
                // confirmada, sin volver a descontar stock. Verificar identidad y
                // contenido impide reutilizar la clave para una operación distinta.
                if (claveIdempotencia) {
                    const anterior = await uno(`SELECT i.solicitud_id, i.usuario_id, i.entrega_id,
                        e.personal_destino_id FROM entregas_parciales_idempotencia i
                        JOIN entregas_parciales e ON e.id=i.entrega_id
                        WHERE i.clave=?`, [claveIdempotencia]);
                    if (anterior) {
                        if (Number(anterior.solicitud_id) !== solicitudId ||
                            Number(anterior.usuario_id) !== Number(req.usuario.id) ||
                            Number(anterior.personal_destino_id) !== Number(personalId))
                            throw new Error('La clave ya corresponde a otra entrega.');
                        const registrados = await todos(`SELECT producto_id AS productoId, cantidad
                            FROM entregas_parciales_detalle WHERE entrega_id=?`, [anterior.entrega_id]);
                        const enviados = new Map(productosNormalizados.map(p => [Number(p.productoId), p.cantidad]));
                        if (registrados.length !== enviados.size || registrados.some(p => enviados.get(p.productoId) !== p.cantidad))
                            throw new Error('La clave ya corresponde a otros materiales o cantidades.');
                        const estadoActual = await uno('SELECT estado FROM solicitudes WHERE id=?', [solicitudId]);
                        await ejecutar('COMMIT');
                        terminada = true;
                        return res.json({ mensaje: 'Entrega previamente registrada.', entregaId: anterior.entrega_id,
                            estado: estadoActual?.estado, repetida: true });
                    }
                }
                const solicitud = await uno(`SELECT s.estado, s.proyecto_id, s.personal_destino_id,
                    p.estado AS proyecto_estado, p.bodega_numero AS bodega
                    FROM solicitudes s LEFT JOIN proyectos p ON p.id=s.proyecto_id WHERE s.id=?`, [solicitudId]);
                if (!solicitud || solicitud.estado !== 'EN PREPARACIÓN') throw new Error('La solicitud no está en preparación.');
                if (Number(solicitud.personal_destino_id) !== Number(personalId)) throw new Error('El destinatario no coincide.');
                if (!solicitud.proyecto_id || solicitud.proyecto_estado !== 'ACTIVO' || solicitud.bodega === null || solicitud.bodega === undefined)
                    throw new Error('El proyecto no tiene una bodega activa.');
                const persona = await uno(`SELECT id FROM personal WHERE id=? AND estado='ACTIVO' AND cargo IN ('TECNICO','ASISTENTE')`, [personalId]);
                if (!persona) throw new Error('El destinatario no está activo.');
                const detalle = await todos(`SELECT d.producto_id AS productoId, SUM(d.cantidad) AS solicitada,
                    COALESCE((SELECT SUM(epd.cantidad) FROM entregas_parciales_detalle epd
                      JOIN entregas_parciales ep ON ep.id=epd.entrega_id
                      WHERE ep.solicitud_id=d.solicitud_id AND epd.producto_id=d.producto_id),0) AS entregada,
                    p.tipo_control AS tipoControl
                    FROM detalle_solicitudes d JOIN productos p ON p.id=d.producto_id
                    WHERE d.solicitud_id=? GROUP BY d.producto_id`, [solicitudId]);
                if (!detalle.length) throw new Error('La solicitud no tiene materiales.');
                const pendientes = new Map();
                for (const d of detalle) {
                    if (!Number.isSafeInteger(d.productoId) || d.productoId <= 0 ||
                        !Number.isSafeInteger(d.solicitada) || d.solicitada <= 0 ||
                        !Number.isSafeInteger(d.entregada) || d.entregada < 0 || d.entregada > d.solicitada)
                        throw new Error('El saldo de la solicitud es inconsistente.');
                    pendientes.set(d.productoId, { pendiente: d.solicitada - d.entregada, tipo: d.tipoControl });
                }
                for (const item of productosNormalizados) {
                    const saldo = pendientes.get(item.productoId);
                    if (!saldo || saldo.tipo !== 'CANTIDAD' || item.cantidad > saldo.pendiente)
                        throw new Error('La entrega supera el saldo pendiente o incluye un producto no permitido.');
                    saldo.pendiente -= item.cantidad;
                }
                const cabecera = await ejecutar(`INSERT INTO entregas_parciales (solicitud_id,usuario_id,personal_destino_id)
                    VALUES (?,?,?)`, [solicitudId, req.usuario.id, personalId]);
                // La clave se guarda en la misma transacción que los descuentos.
                // Si hay rollback, el cliente puede reintentar con la misma clave.
                if (claveIdempotencia) {
                    const repetida = await uno('SELECT entrega_id FROM entregas_parciales_idempotencia WHERE clave=?', [claveIdempotencia]);
                    if (repetida) throw new Error('Esta entrega ya fue registrada. Actualiza los saldos antes de continuar.');
                    await ejecutar(`INSERT INTO entregas_parciales_idempotencia (clave,solicitud_id,usuario_id,entrega_id)
                        VALUES (?,?,?,?)`, [claveIdempotencia, solicitudId, req.usuario.id, cabecera.id]);
                }
                for (const item of productosNormalizados) {
                    // Una entrega puede tomar unidades de varias ubicaciones de la
                    // misma bodega, sin consumir reservas de otros proyectos.
                    const ubicaciones = await todos(`SELECT sc.id, sc.ubicacion_id, sc.cantidad AS fisico,
                        COALESCE((SELECT SUM(sp.cantidad) FROM stock_proyecto sp
                            WHERE sp.proyecto_id=? AND sp.producto_id=sc.producto_id
                              AND sp.ubicacion_id=sc.ubicacion_id),0) AS propio,
                        COALESCE((SELECT SUM(sp.cantidad) FROM stock_proyecto sp
                            WHERE sp.proyecto_id<>? AND sp.producto_id=sc.producto_id
                              AND sp.ubicacion_id=sc.ubicacion_id),0) AS ajeno
                        FROM stock_cantidad sc
                        JOIN ubicaciones u ON u.id=sc.ubicacion_id
                        JOIN proyectos p ON p.id=? AND p.bodega_numero=u.bodega
                        WHERE sc.producto_id=? AND sc.cantidad>0
                        ORDER BY propio DESC, sc.cantidad DESC, sc.id ASC`,
                        [solicitud.proyecto_id, solicitud.proyecto_id, solicitud.proyecto_id, item.productoId]);
                    let restante = item.cantidad;
                    for (const stock of ubicaciones) {
                        if (restante === 0) break;
                        const disponible = stock.fisico - stock.ajeno;
                        if (!Number.isSafeInteger(disponible) || disponible < 0)
                            throw new Error('El inventario o las reservas de otros proyectos son inconsistentes.');
                        if (disponible === 0) continue;
                        const cantidad = Math.min(restante, disponible);
                        const consumoReserva = Math.min(cantidad, stock.propio);
                        if (consumoReserva > 0) {
                            const reserva = await ejecutar(`UPDATE stock_proyecto SET cantidad=cantidad-?
                                WHERE proyecto_id=? AND producto_id=? AND ubicacion_id=? AND cantidad>=?`,
                                [consumoReserva, solicitud.proyecto_id, item.productoId, stock.ubicacion_id, consumoReserva]);
                            if (reserva.changes !== 1) throw new Error('No se pudo descontar la reserva propia.');
                        }
                        const fisico = await ejecutar(`UPDATE stock_cantidad SET cantidad=cantidad-? WHERE id=? AND cantidad>=?`,
                            [cantidad, stock.id, cantidad]);
                        if (fisico.changes !== 1) throw new Error('No se pudo descontar el stock físico.');
                        await ejecutar('DELETE FROM stock_proyecto WHERE proyecto_id=? AND producto_id=? AND ubicacion_id=? AND cantidad=0',
                            [solicitud.proyecto_id, item.productoId, stock.ubicacion_id]);
                        await ejecutar('DELETE FROM stock_cantidad WHERE id=? AND cantidad=0', [stock.id]);
                        await ejecutar(`INSERT INTO movimientos (tipo_movimiento,producto_id,ubicacion_id,cantidad,personal_id)
                            VALUES ('SALIDA',?,?,?,?)`, [item.productoId, stock.ubicacion_id, cantidad, personalId]);
                        const ocupacion = await uno(`SELECT
                            (SELECT COUNT(*) FROM stock_cantidad WHERE ubicacion_id=? AND cantidad>0)+
                            (SELECT COUNT(*) FROM productos_seriados WHERE ubicacion_id=?) AS total`,
                            [stock.ubicacion_id, stock.ubicacion_id]);
                        await ejecutar('UPDATE ubicaciones SET estado=? WHERE id=?',
                            [ocupacion.total ? 'Ocupada' : 'Disponible', stock.ubicacion_id]);
                        restante -= cantidad;
                    }
                    if (restante !== 0) throw new Error('No existe stock libre suficiente en las ubicaciones de la bodega.');
                    await ejecutar(`INSERT INTO entregas_parciales_detalle (entrega_id,producto_id,cantidad) VALUES (?,?,?)`,
                        [cabecera.id, item.productoId, item.cantidad]);
                }
                const completa = [...pendientes.values()].every(p => p.pendiente === 0);
                if (completa) {
                    const cierre = await ejecutar(`UPDATE solicitudes SET estado='ENTREGADA'
                        WHERE id=? AND estado='EN PREPARACIÓN'`, [solicitudId]);
                    if (cierre.changes !== 1) throw new Error('No se pudo cerrar la solicitud.');
                    await ejecutar(`INSERT INTO historial_solicitudes (solicitud_id,accion,usuario_id)
                        VALUES (?, 'ENTREGA', ?)`, [solicitudId, req.usuario.id]);
                }
                await ejecutar('COMMIT');
                terminada = true;
                return res.json({ mensaje: completa ? 'Solicitud entregada completamente.' : 'Entrega parcial registrada.',
                    entregaId: cabecera.id, estado: completa ? 'ENTREGADA' : 'EN PREPARACIÓN',
                    saldos: [...pendientes].map(([productoId, p]) => ({ productoId, saldoPendiente: p.pendiente })) });
            })().catch(err => {
                console.error('Entrega parcial:', err);
                // Los fallos de SQLite son internos o transitorios, no conflictos
                // de negocio. No exponer consultas ni detalles de la base al cliente.
                if (err && typeof err.code === 'string' && err.code.startsWith('SQLITE_')) {
                    const temporal = err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_LOCKED';
                    return revertir(temporal ? 503 : 500,
                        temporal ? 'La bodega está ocupada. Intenta nuevamente.' : 'Error interno al registrar la entrega.');
                }
                revertir(409, err.message || 'No se pudo procesar la entrega.');
            });
        });
    });
});

// LISTAR SOLICITUDES
// ===============================

app.get(
    "/api/solicitudes",
    (req, res) => {

        // Los supervisores solo pueden consultar solicitudes de proyectos
        // vinculados a su propia ficha de personal.
        const esSupervisor = req.usuario?.rol === 'SUPERVISOR';
        const filtroSupervisor = esSupervisor
            ? `WHERE EXISTS (
                SELECT 1 FROM personal identidad
                WHERE identidad.id = s.supervisor_id
                  AND (LOWER(identidad.correo) = LOWER(?) OR LOWER(identidad.rut) = LOWER(?))
              )`
            : '';
        const parametros = esSupervisor ? [req.usuario.usuario, req.usuario.usuario] : [];
        db.all(
            `
            SELECT
                s.id,
                s.estado,
                s.observaciones,
                s.prioridad,
                s.fecha_solicitud,
                s.proyecto_id,
                proyecto.codigo AS proyecto_codigo,
                proyecto.nombre AS proyecto_nombre,

                p.nombre AS supervisor,

                destino.id AS personal_destino_id,
                destino.nombre AS personal_destino,
                destino.cargo AS personal_destino_cargo,

                d.id AS detalle_id,
                d.cantidad,
                d.estado AS estado_detalle,

                pr.id AS producto_id,
                pr.codigo,
                pr.nombre AS producto_nombre,
                pr.tipo_control

            FROM solicitudes s

            LEFT JOIN proyectos proyecto ON proyecto.id = s.proyecto_id

            INNER JOIN personal p
                ON p.id = s.supervisor_id

            LEFT JOIN personal destino
                ON destino.id = s.personal_destino_id

            LEFT JOIN detalle_solicitudes d
                ON d.solicitud_id = s.id

            LEFT JOIN productos pr
                ON pr.id = d.producto_id

            ${filtroSupervisor}
            ORDER BY
                s.id DESC,
                d.id ASC
            `,
            parametros,
            (error, filas) => {

                if (error) {

                    console.error(
                        "Error al obtener solicitudes:",
                        error
                    );

                    return res.status(500).json({
                        mensaje:
                            "Error al obtener las solicitudes."
                    });
                }

                const solicitudes = [];

                filas.forEach(
                    function (fila) {

                        let solicitud =
                            solicitudes.find(
                                function (item) {
                                    return item.id === fila.id;
                                }
                            );

                        if (!solicitud) {

                            solicitud = {
                                id: fila.id,

                                supervisor:
                                    fila.supervisor,

                                personalDestinoId:
                                    fila.personal_destino_id,

                                personalDestino:
                                    fila.personal_destino,

                                personalDestinoCargo:
                                    fila.personal_destino_cargo,

                                estado:
                                    fila.estado,

                                prioridad: fila.prioridad || "NORMAL",

                                observaciones:
                                    fila.observaciones,

                                fechaSolicitud:
                                    fila.fecha_solicitud,

                                proyectoId: fila.proyecto_id,
                                proyectoCodigo: fila.proyecto_codigo,
                                proyectoNombre: fila.proyecto_nombre,

                                productos: []
                            };

                            solicitudes.push(
                                solicitud
                            );
                        }

                        if (fila.producto_id) {

                            solicitud.productos.push({
                                detalleId:
                                    fila.detalle_id,

                                productoId:
                                    fila.producto_id,

                                codigo:
                                    fila.codigo,

                                nombre:
                                    fila.producto_nombre,

                                tipoControl:
                                    fila.tipo_control,

                                cantidad:
                                    fila.cantidad,

                                estado:
                                    fila.estado_detalle
                            });
                        }
                    }
                );

                res.json(solicitudes);
            }
        );
    }
);

        // ===============================
// INICIAR PREPARACIÓN DE SOLICITUD
// ===============================

app.put(
    "/api/solicitudes/:id/preparar",
    (req, res) => {
        const idTexto = req.params.id;
        const solicitudId = Number(idTexto);
        if (!/^[1-9][0-9]*$/.test(idTexto) || !Number.isSafeInteger(solicitudId)) {
            return res.status(400).json({ mensaje: 'Solicitud no válida.' });
        }
        // La transición y su historial se confirman o revierten juntos.
        // BEGIN IMMEDIATE impide que otra escritura modifique la solicitud
        // entre la comprobación del estado y el registro del historial.
        db.serialize(() => {
            db.run('BEGIN IMMEDIATE TRANSACTION', errorInicio => {
                if (errorInicio) {
                    const ocupado = ['SQLITE_BUSY', 'SQLITE_LOCKED'].includes(errorInicio.code);
                    return res.status(ocupado ? 503 : 500).json({
                        mensaje: ocupado ? 'La base de datos está ocupada. Intenta nuevamente.' : 'No se pudo iniciar la preparación.'
                    });
                }
                const cancelar = (codigo, mensaje) => {
                    db.run('ROLLBACK', errorReversion => {
                        if (errorReversion) {
                            console.error('No se pudo revertir preparación:', errorReversion);
                            return res.status(500).json({ mensaje: 'No se pudo revertir la preparación. Solicita revisión antes de reintentar.' });
                        }
                        return res.status(codigo).json({ mensaje });
                    });
                };
                db.get('SELECT id, estado, personal_destino_id FROM solicitudes WHERE id=?', [solicitudId], (errorConsulta, solicitud) => {
                    if (errorConsulta) return cancelar(500, 'No se pudo consultar la solicitud.');
                    if (!solicitud) return cancelar(404, 'La solicitud no existe.');
                    if (!solicitud.personal_destino_id) return cancelar(400, 'La solicitud no tiene un destinatario registrado.');
                    if (solicitud.estado !== 'PENDIENTE') return cancelar(409, 'La solicitud ya no está pendiente.');
                    db.run(`UPDATE solicitudes SET estado='EN PREPARACIÓN'
                        WHERE id=? AND estado='PENDIENTE'
                        AND EXISTS (SELECT 1 FROM personal p
                            WHERE p.id=solicitudes.personal_destino_id
                            AND p.estado='ACTIVO' AND p.cargo IN ('TECNICO','ASISTENTE'))`,
                    [solicitudId], function(errorCambio) {
                        if (errorCambio) return cancelar(500, 'No se pudo actualizar la solicitud.');
                        if (this.changes !== 1) return cancelar(409, 'La solicitud cambió o su destinatario no está activo como técnico o asistente.');
                        db.run(`INSERT INTO historial_solicitudes (solicitud_id, accion, usuario_id)
                            VALUES (?, 'PREPARACION', ?)`, [solicitudId, req.usuario.id], errorHistorial => {
                            if (errorHistorial) return cancelar(500, 'No se pudo registrar la preparación.');
                            db.run('COMMIT', errorCommit => {
                                if (errorCommit) return cancelar(500, 'No se pudo confirmar la preparación.');
                                return res.json({ mensaje: 'Solicitud enviada a preparación correctamente.', estado: 'EN PREPARACIÓN' });
                            });
                        });
                    });
                });
            });
        });
    }
);

        // ===============================
        // CONFIRMAR ENTREGA DE SOLICITUD
        // ===============================

        app.post(
            "/api/solicitudes/:id/entregar",
            (req, res) => {

                const solicitudId =
                    Number(req.params.id);

                // Un cuerpo JSON nulo o de otro tipo no debe provocar un 500.
                const carga = req.body;
                if (!carga || typeof carga !== 'object' || Array.isArray(carga)) {
                    return res.status(400).json({ mensaje: 'Los datos de entrega no son válidos.' });
                }
                const { personalId, productos } = carga;

                // ===============================
                // VALIDACIONES
                // ===============================

                // Rechazar identificadores malformados antes de consultar SQLite.
                // Number(""), Number(null) y valores decimales no son IDs válidos.
                const idValido = valor =>
                    ((typeof valor === 'string' && /^[1-9][0-9]*$/.test(valor)) ||
                     (typeof valor === 'number' && Number.isSafeInteger(valor))) &&
                    Number.isSafeInteger(Number(valor)) && Number(valor) > 0;

                if (!idValido(req.params.id)) {
                    return res.status(400).json({ mensaje: "Solicitud no válida." });
                }

                if (!idValido(personalId)) {
                    return res.status(400).json({
                        mensaje: "Debes seleccionar una persona válida que recibe la entrega."
                    });
                }

                if (!Array.isArray(productos) || productos.length === 0) {
                    return res.status(400).json({ mensaje: "No existen productos para entregar." });
                }

                // Validar toda la carga antes de leer solicitudes o abrir transacciones.
                // El validador también maneja elementos nulos o malformados sin lanzar excepciones.
                const errorCargaEntrega = require('./routes/validar-entrega')(productos);
                if (errorCargaEntrega) {
                    return res.status(400).json({ mensaje: errorCargaEntrega });
                }

                // ===============================
                // VALIDAR SOLICITUD
                // ===============================

                db.get(
                    `
            SELECT *
            FROM solicitudes
            WHERE id = ?
              AND estado = 'EN PREPARACIÓN'
            `,
                    [solicitudId],
                    (errorSolicitud, solicitud) => {

                        if (errorSolicitud) {

                            console.error(
                                "Error al validar solicitud:",
                                errorSolicitud
                            );

                            return res.status(500).json({
                                mensaje:
                                    "Error al validar la solicitud."
                            });
                        }

                        if (!solicitud) {

                            return res.status(400).json({
                                mensaje:
                                    "La solicitud no está disponible para entrega."
                            });
                        }

                        // El destinatario de la entrega debe ser el que eligió
                        // el supervisor al crear la solicitud.
                        if (
                            !solicitud.personal_destino_id ||
                            Number(personalId) !== Number(solicitud.personal_destino_id)
                        ) {
                            return res.status(400).json({
                                mensaje: "El destinatario no coincide con la solicitud."
                            });
                        }

                        // ===============================
                        // VALIDAR PERSONAL
                        // ===============================

                        db.get(
                            `
                    SELECT *
                    FROM personal
                    WHERE id = ?
                      AND estado = 'ACTIVO'
                      AND cargo IN (
                          'TECNICO',
                          'ASISTENTE'
                      )
                    `,
                            [personalId],
                            (errorPersonal, persona) => {

                                if (errorPersonal) {

                                    console.error(
                                        "Error al validar personal:",
                                        errorPersonal
                                    );

                                    return res.status(500).json({
                                        mensaje:
                                            "Error al validar el personal."
                                    });
                                }

                                if (!persona) {

                                    return res.status(400).json({
                                        mensaje:
                                            "La persona seleccionada no es válida."
                                    });
                                }

                                // ===============================
                                // INICIAR TRANSACCIÓN
                                // ===============================

                                // Acquire the write reservation before reading or changing stock.
                                // This serializes competing deliveries at the SQLite writer boundary.
                                db.run(
                                    "BEGIN IMMEDIATE TRANSACTION",
                                    (errorInicio) => {

                                        if (errorInicio) {
                                            const ocupada = errorInicio.code === 'SQLITE_BUSY' || errorInicio.code === 'SQLITE_LOCKED';
                                            if (ocupada) res.set('Retry-After', '2');
                                            return res.status(ocupada ? 503 : 500).json({
                                                mensaje: ocupada
                                                    ? 'La bodega está procesando otra operación. Espera unos segundos y vuelve a intentar.'
                                                    : 'No se pudo iniciar la entrega.'
                                            });
                                        }

                                        // Revalidar dentro del bloqueo de escritura: la lectura
                                        // inicial pudo quedar obsoleta mientras otra entrega avanzaba.
                                        db.get(
                                            `SELECT s.estado, s.personal_destino_id, s.proyecto_id,
                                                    p.estado AS proyecto_estado, p.bodega_numero AS proyecto_bodega
                                             FROM solicitudes s
                                             LEFT JOIN proyectos p ON p.id = s.proyecto_id
                                             WHERE s.id = ?`,
                                            [solicitudId],
                                            (errorActual, actual) => {
                                                if (errorActual) return cancelarEntrega('No se pudo verificar el estado actual de la solicitud.');
                                                if (!actual || actual.estado !== 'EN PREPARACIÓN') {
                                                    return cancelarEntrega('La solicitud cambió de estado antes de la entrega.');
                                                }
                                                if (Number(actual.personal_destino_id) !== Number(personalId)) {
                                                    return cancelarEntrega('El destinatario cambió antes de la entrega.');
                                                }
                                                // El proyecto puede haber sido desactivado o desvinculado
                                                // después de iniciar la preparación. No liberar stock en ese caso.
                                                if (!actual.proyecto_id || actual.proyecto_estado !== 'ACTIVO' ||
                                                    actual.proyecto_bodega === null || actual.proyecto_bodega === undefined ||
                                                    String(actual.proyecto_bodega).trim() === '') {
                                                    return cancelarEntrega('El proyecto no está activo o no tiene una bodega vinculada.');
                                                }
                                                if (Number(actual.proyecto_id) !== Number(solicitud.proyecto_id)) {
                                                    return cancelarEntrega('El proyecto de la solicitud cambió antes de la entrega.');
                                                }
                                                // La entrega actual es completa: comprobar el detalle
                                                // solicitado dentro de la misma transacción de escritura.
                                                // No permitir cantidades adicionales, productos omitidos
                                                // ni sustituciones de tipo de control.
                                                db.all(
                                                    `SELECT producto_id, SUM(cantidad) AS cantidad
                                                     FROM detalle_solicitudes
                                                     WHERE solicitud_id = ?
                                                     GROUP BY producto_id`,
                                                    [solicitudId],
                                                    (errorDetalle, detalle) => {
                                                        if (errorDetalle) return cancelarEntrega('No se pudo verificar el detalle solicitado.');
                                                        const errorDetalleEntrega = require('./routes/comparar-detalle-entrega')(detalle, productos);
                                                        if (errorDetalleEntrega) return cancelarEntrega(errorDetalleEntrega);
                                                        // Impedir que la ruta de entrega completa vuelva a descontar
                                                        // materiales que ya fueron entregados parcialmente.
                                                        db.get(`SELECT COUNT(*) AS total FROM entregas_parciales WHERE solicitud_id=?`,
                                                            [solicitudId], (errorParciales, registro) => {
                                                                if (errorParciales) return cancelarEntrega('No se pudo verificar el historial parcial.');
                                                                if (registro.total > 0) return cancelarEntrega('Esta solicitud tiene entregas parciales; utiliza la entrega parcial para completar sus saldos.');
                                                                validarCatalogoEntregaCompleta();
                                                            });
                                                        function validarCatalogoEntregaCompleta() {
                                                        // No confiar en tipoControl enviado por el navegador:
                                                        // comprobar contra el catálogo dentro de la transacción.
                                                        db.all(
                                                            `SELECT id, tipo_control FROM productos WHERE id IN (${productos.map(() => '?').join(',')})`,
                                                            productos.map(item => Number(item.productoId)),
                                                            (errorTipos, tipos) => {
                                                                if (errorTipos) return cancelarEntrega('No se pudo validar el tipo de los productos.');
                                                                const catalogo = new Map(tipos.map(p => [Number(p.id), p.tipo_control]));
                                                                if (productos.some(item => catalogo.get(Number(item.productoId)) !== item.tipoControl)) {
                                                                    return cancelarEntrega('El tipo de control de un producto no coincide con el catálogo.');
                                                                }
                                                                procesarProducto(0);
                                                            }
                                                        );
                                                        }
                                                    }
                                                );
                                            }
                                        );
                                    }
                                );

                                // ===============================
                                // PROCESAR PRODUCTOS
                                // ===============================

                                function procesarProducto(indice) {

                                    if (
                                        indice >= productos.length
                                    ) {

                                        finalizarSolicitud();
                                        return;
                                    }

                                    const item =
                                        productos[indice];

                                    if (
                                        item.tipoControl ===
                                        "CANTIDAD"
                                    ) {

                                        entregarCantidad(
                                            item,
                                            () => {
                                                procesarProducto(
                                                    indice + 1
                                                );
                                            }
                                        );

                                        return;
                                    }

                                    if (
                                        item.tipoControl ===
                                        "SERIE"
                                    ) {

                                        entregarSerie(
                                            item,
                                            () => {
                                                procesarProducto(
                                                    indice + 1
                                                );
                                            }
                                        );

                                        return;
                                    }

                                    cancelarEntrega(
                                        "Tipo de producto no válido."
                                    );
                                }

                                // ===============================
                                // ENTREGAR POR CANTIDAD
                                // ===============================

                                function entregarCantidad(
                                    item,
                                    continuar
                                ) {

                                    db.get(
                                        `
                                SELECT
                                    sc.id,
                                    sc.cantidad,
                                    sc.ubicacion_id,
                                    u.codigo AS ubicacion
                                FROM stock_cantidad sc

                                INNER JOIN ubicaciones u
                                    ON u.id = sc.ubicacion_id
                                INNER JOIN proyectos p
                                    ON p.id = ? AND p.bodega_numero = u.bodega

                                WHERE sc.producto_id = ?
                                  AND sc.cantidad - COALESCE((
                                    SELECT SUM(sp.cantidad) FROM stock_proyecto sp
                                    WHERE sp.producto_id=sc.producto_id
                                      AND sp.ubicacion_id=sc.ubicacion_id
                                      AND sp.proyecto_id<>?
                                  ),0) >= ?

                                ORDER BY sc.cantidad DESC

                                LIMIT 1
                                `,
                                        [solicitud.proyecto_id, item.productoId,
                                         solicitud.proyecto_id, item.cantidad],
                                        (
                                            errorStock,
                                            stock
                                        ) => {

                                            if (
                                                errorStock ||
                                                !stock
                                            ) {

                                                cancelarEntrega(
                                                    "No existe stock suficiente para uno de los productos."
                                                );

                                                return;
                                            }

                                            const nuevoStock =
                                                stock.cantidad -
                                                item.cantidad;

                                            const continuarSalida =
                                                () => {

                                                    db.run(
                                                        `
                                                INSERT INTO movimientos (
                                                    tipo_movimiento,
                                                    producto_id,
                                                    ubicacion_id,
                                                    cantidad,
                                                    personal_id
                                                )
                                                VALUES (?, ?, ?, ?, ?)
                                                `,
                                                        [
                                                            "SALIDA",
                                                            item.productoId,
                                                            stock.ubicacion_id,
                                                            item.cantidad,
                                                            personalId
                                                        ],
                                                        function (
                                                            errorMovimiento
                                                        ) {

                                                            if (
                                                                errorMovimiento
                                                            ) {

                                                                cancelarEntrega(
                                                                    "Error al registrar la salida."
                                                                );

                                                                return;
                                                            }

                                                            revisarUbicacion(
                                                                stock.ubicacion_id,
                                                                continuar
                                                            );
                                                        }
                                                    );
                                                };

                                            function descontarFisico() {
                                                // Descuento condicional dentro de la transacción:
                                                // no aceptar una fila ausente o un stock que haya cambiado.
                                                db.run(
                                                    `UPDATE stock_cantidad
                                                     SET cantidad = cantidad - ?
                                                     WHERE id = ? AND cantidad >= ?`,
                                                    [item.cantidad, stock.id, item.cantidad],
                                                    function(errorActualizar) {
                                                        if (errorActualizar || this.changes !== 1) {
                                                            cancelarEntrega("Stock físico insuficiente o modificado durante la entrega.");
                                                            return;
                                                        }
                                                        db.run(
                                                            `DELETE FROM stock_cantidad WHERE id = ? AND cantidad = 0`,
                                                            [stock.id],
                                                            function(errorEliminar) {
                                                                if (errorEliminar) {
                                                                    cancelarEntrega("Error al actualizar la ubicación.");
                                                                    return;
                                                                }
                                                                continuarSalida();
                                                            }
                                                        );
                                                    }
                                                );
                                            }
                                            // Consumir primero la reserva propia, si existe;
                                            // el resto proviene del stock libre. Nunca tocar reservas ajenas.
                                            db.get(`SELECT COALESCE(SUM(cantidad),0) AS propia
                                                FROM stock_proyecto WHERE proyecto_id=? AND producto_id=? AND ubicacion_id=?`,
                                                [solicitud.proyecto_id, item.productoId, stock.ubicacion_id],
                                                (errorReserva, filaReserva) => {
                                                    if (errorReserva) return cancelarEntrega('Error al consultar las reservas.');
                                                    const consumoReserva = Math.min(item.cantidad, Number(filaReserva.propia) || 0);
                                                    if (!consumoReserva) return descontarFisico();
                                                    db.run(`UPDATE stock_proyecto SET cantidad=cantidad-?
                                                        WHERE proyecto_id=? AND producto_id=? AND ubicacion_id=? AND cantidad>=?`,
                                                        [consumoReserva, solicitud.proyecto_id, item.productoId, stock.ubicacion_id, consumoReserva],
                                                        function(error) {
                                                            if (error || this.changes !== 1) return cancelarEntrega('No se pudo actualizar la reserva propia.');
                                                            db.run(`DELETE FROM stock_proyecto WHERE proyecto_id=? AND producto_id=? AND ubicacion_id=? AND cantidad=0`,
                                                                [solicitud.proyecto_id, item.productoId, stock.ubicacion_id],
                                                                function(errorLimpieza) {
                                                                    if (errorLimpieza) return cancelarEntrega('Error al limpiar la reserva propia.');
                                                                    descontarFisico();
                                                                });
                                                        });
                                                });
                                        }
                                    );
                                }

                                // ===============================
                                // ENTREGAR PRODUCTO SERIADO
                                // ===============================

                                function entregarSerie(
                                    item,
                                    continuar
                                ) {

                                    if (!item.numeroSerie) {

                                        cancelarEntrega(
                                            "Debes seleccionar el número de serie."
                                        );

                                        return;
                                    }

                                    db.get(
                                        `
                                SELECT
                                    ps.id,
                                    ps.producto_id,
                                    ps.ubicacion_id
                                FROM productos_seriados ps
                                INNER JOIN ubicaciones u ON u.id = ps.ubicacion_id
                                INNER JOIN proyectos p ON p.id = ? AND p.bodega_numero = u.bodega

                                WHERE ps.numero_serie = ?
                                  AND ps.producto_id = ?
                                  AND ps.ubicacion_id IS NOT NULL
                                  AND ps.estado = 'Disponible'
                                `,
                                        [
                                            solicitud.proyecto_id,
                                            item.numeroSerie.trim(),
                                            item.productoId
                                        ],
                                        (
                                            errorSerie,
                                            serie
                                        ) => {

                                            if (
                                                errorSerie ||
                                                !serie
                                            ) {

                                                cancelarEntrega(
                                                    "La serie seleccionada ya no está disponible."
                                                );

                                                return;
                                            }

                                            function ejecutarSalidaSerie() {
                                            db.run(
                                                `
                                        UPDATE productos_seriados
                                        SET
                                            ubicacion_id = NULL,
                                            estado = 'SALIDA'
                                        WHERE id = ? AND estado = 'Disponible' AND ubicacion_id = ?
                                        `,
                                                [serie.id,serie.ubicacion_id],
                                                function (
                                                    errorActualizar
                                                ) {

                                                    if (
                                                        errorActualizar || this.changes !== 1
                                                    ) {

                                                        cancelarEntrega(
                                                            errorActualizar
                                                                ? "Error al retirar la serie."
                                                                : "La herramienta cambió de estado o ubicación antes de confirmar la entrega. Actualiza la solicitud y vuelve a intentarlo."
                                                        );

                                                        return;
                                                    }

                                                    db.run(
                                                        `
                                                INSERT INTO movimientos (
                                                    tipo_movimiento,
                                                    producto_id,
                                                    ubicacion_id,
                                                    numero_serie,
                                                    personal_id
                                                )
                                                VALUES (?, ?, ?, ?, ?)
                                                `,
                                                        [
                                                            "SALIDA",
                                                            item.productoId,
                                                            serie.ubicacion_id,
                                                            item.numeroSerie.trim(),
                                                            personalId
                                                        ],
                                                        function (
                                                            errorMovimiento
                                                        ) {

                                                            if (
                                                                errorMovimiento
                                                            ) {

                                                                cancelarEntrega(
                                                                    "Error al registrar la salida de la serie."
                                                                );

                                                                return;
                                                            }

                                                            if (solicitud.proyecto_id) {
                                                                db.run(`INSERT INTO entregas_series_proyecto
                                                                    (serie_id,solicitud_id,proyecto_id,personal_id,ubicacion_origen_id,usuario_id)
                                                                    VALUES(?,?,?,?,?,?)`,
                                                                    [serie.id,solicitudId,solicitud.proyecto_id,personalId,serie.ubicacion_id,req.usuario.id],
                                                                    function(err) {
                                                                        if(err)return cancelarEntrega('No se pudo registrar la asignación de serie al trabajador.');
                                                                        revisarUbicacion(serie.ubicacion_id,continuar);
                                                                    });
                                                            } else {
                                                                revisarUbicacion(serie.ubicacion_id,continuar);
                                                            }
                                                        }
                                                    );
                                                }
                                            );
                                            }
                                            db.get(
                                                'SELECT id FROM entregas_series_proyecto WHERE serie_id=? AND fecha_devolucion IS NULL',
                                                [serie.id],
                                                (errorEntregaAbierta, entregaAbierta) => {
                                                    if (errorEntregaAbierta) {
                                                        return cancelarEntrega('No se pudo comprobar el historial de entregas de la serie.');
                                                    }
                                                    if (entregaAbierta) {
                                                        return cancelarEntrega('Esta herramienta ya tiene una entrega abierta. Debe devolverse antes de entregarla nuevamente.');
                                                    }
                                                    continuarEntregaSerie();
                                                }
                                            );

                                            function continuarEntregaSerie() {
                                            if (solicitud.proyecto_id) {
                                                db.get(`SELECT proyecto_id FROM series_proyecto WHERE serie_id=?`,
                                                    [serie.id],(err,asignacion)=>{
                                                        if(err || !asignacion || Number(asignacion.proyecto_id)!==Number(solicitud.proyecto_id))
                                                            return cancelarEntrega('La serie no está asignada al proyecto de la solicitud.');
                                                        db.run('DELETE FROM series_proyecto WHERE serie_id=? AND proyecto_id=?',
                                                            [serie.id,solicitud.proyecto_id],function(err){
                                                                if(err||this.changes!==1)return cancelarEntrega('No se pudo liberar la serie para entrega.');
                                                                ejecutarSalidaSerie();
                                                            });
                                                    });
                                            } else {
                                                db.get('SELECT 1 AS asignada FROM series_proyecto WHERE serie_id=?',[serie.id],(err,asignacion)=>{
                                                    if(err||asignacion)return cancelarEntrega('La serie pertenece a un proyecto; no puede entregarse como stock libre.');
                                                    ejecutarSalidaSerie();
                                                });
                                            }
                                            }
                                        }
                                    );
                                }

                                // ===============================
                                // REVISAR ESTADO DE UBICACIÓN
                                // ===============================

                                function revisarUbicacion(
                                    ubicacionId,
                                    continuar
                                ) {

                                    db.get(
                                        `
                                SELECT
                                (
                                    SELECT COUNT(*)
                                    FROM stock_cantidad
                                    WHERE ubicacion_id = ?
                                      AND cantidad > 0
                                )
                                +
                                (
                                    SELECT COUNT(*)
                                    FROM productos_seriados
                                    WHERE ubicacion_id = ?
                                )
                                AS total
                                `,
                                        [
                                            ubicacionId,
                                            ubicacionId
                                        ],
                                        (
                                            error,
                                            resultado
                                        ) => {

                                            if (error) {

                                                cancelarEntrega(
                                                    "Error al revisar la ubicación."
                                                );

                                                return;
                                            }

                                            const estado =
                                                resultado.total === 0
                                                    ? "Disponible"
                                                    : "Ocupada";

                                            db.run(
                                                `
                                        UPDATE ubicaciones
                                        SET estado = ?
                                        WHERE id = ?
                                        `,
                                                [
                                                    estado,
                                                    ubicacionId
                                                ],
                                                function (
                                                    errorActualizar
                                                ) {

                                                    if (
                                                        errorActualizar
                                                    ) {

                                                        cancelarEntrega(
                                                            "Error al actualizar la ubicación."
                                                        );

                                                        return;
                                                    }

                                                    continuar();
                                                }
                                            );
                                        }
                                    );
                                }

                                // ===============================
                                // FINALIZAR SOLICITUD
                                // ===============================

                                function finalizarSolicitud() {

                                    db.run(
                                        `
                                UPDATE solicitudes
                                SET estado = 'ENTREGADA'
                                WHERE id = ? AND estado = 'EN PREPARACIÓN'
                                `,
                                        [solicitudId],
                                        function (
                                            errorActualizar
                                        ) {

                                            if (
                                                errorActualizar
                                            ) {

                                                cancelarEntrega(
                                                    "Error al finalizar la solicitud."
                                                );

                                                return;
                                            }

                                            // La actualización debe afectar exactamente una solicitud.
                                            // Si otra entrega ya la cerró, revertir stock y movimientos.
                                            if (this.changes !== 1) {
                                                return cancelarEntrega('La solicitud ya fue entregada o cambió de estado.');
                                            }

                                            db.run(`INSERT INTO historial_solicitudes (solicitud_id, accion, usuario_id)
                                                VALUES (?, 'ENTREGA', ?)`, [solicitudId, req.usuario.id], (errorHistorial) => {
                                                if (errorHistorial) return cancelarEntrega('No se pudo registrar la trazabilidad de la entrega.');
                                            db.run(
                                                "COMMIT",
                                                (errorCommit) => {

                                                    if (
                                                        errorCommit
                                                    ) {

                                                        cancelarEntrega(
                                                            "Error al confirmar la entrega."
                                                        );

                                                        return;
                                                    }

                                                    return res.json({
                                                        mensaje:
                                                            "Solicitud entregada correctamente."
                                                    });
                                                }
                                            );
                                            });
                                        }
                                    );
                                }

                                // ===============================
                                // CANCELAR Y REVERTIR
                                // ===============================

                                function cancelarEntrega(
                                    mensaje
                                ) {

                                    db.run(
                                        "ROLLBACK",
                                        (errorRollback) => {
                                            if (res.headersSent) return;
                                            if (errorRollback) {
                                                console.error('Error al revertir entrega:', errorRollback);
                                                return res.status(500).json({
                                                    mensaje: 'No se pudo confirmar la reversión de la entrega. Contacta al administrador antes de reintentar.'
                                                });
                                            }
                                            return res.status(400).json({ mensaje });
                                        }
                                    );
                                }
                            }
                        );
                    }
                );
            }
        );


        // ===============================
        // RUTA GUARDAR PERSONAL
        // ===============================

        app.post(
            "/api/personal",
            (req, res) => {

                const {
                    nombre,
                    rut,
                    cargo,
                    telefono,
                    correo
                } = req.body;

                // ===============================
                // VALIDACIONES
                // ===============================

                if (
                    !nombre ||
                    !rut ||
                    !cargo
                ) {
                    return res.status(400).json({
                        mensaje:
                            "Nombre, RUT y cargo son obligatorios."
                    });
                }

                if (
                    ![
                        "SUPERVISOR",
                        "TECNICO",
                        "ASISTENTE"
                    ].includes(cargo)
                ) {
                    return res.status(400).json({
                        mensaje:
                            "El cargo seleccionado no es válido."
                    });
                }

                // ===============================
                // GUARDAR PERSONAL
                // ===============================

                db.run(
                    `
            INSERT INTO personal (
                nombre,
                rut,
                cargo,
                telefono,
                correo
            )
            VALUES (?, ?, ?, ?, ?)
            `,
                    [
                        nombre,
                        rut,
                        cargo,
                        telefono || null,
                        correo || null
                    ],
                    function (error) {

                        if (error) {

                            if (
                                error.message.includes(
                                    "UNIQUE constraint failed"
                                )
                            ) {
                                return res.status(400).json({
                                    mensaje:
                                        "Ya existe una persona registrada con ese RUT."
                                });
                            }

                            console.error(
                                "Error al guardar personal:",
                                error
                            );

                            return res.status(500).json({
                                mensaje:
                                    "Error al guardar el personal."
                            });
                        }

                        res.status(201).json({
                            mensaje:
                                "Persona registrada correctamente.",
                            id: this.lastID
                        });
                    }
                );
            }
        );

        // ===============================
        // ACTIVAR / DESACTIVAR PERSONAL
        // ===============================

        app.put(
            "/api/personal/:id/estado",
            (req, res) => {

                const id =
                    Number(req.params.id);

                const {
                    estado
                } = req.body;

                if (
                    estado !== "ACTIVO" &&
                    estado !== "INACTIVO"
                ) {
                    return res.status(400).json({
                        mensaje:
                            "Estado no válido."
                    });
                }

                db.run(
                    `
            UPDATE personal
            SET estado = ?
            WHERE id = ?
            `,
                    [
                        estado,
                        id
                    ],
                    function (error) {

                        if (error) {

                            console.error(
                                "Error al cambiar estado del personal:",
                                error
                            );

                            return res.status(500).json({
                                mensaje:
                                    "No se pudo actualizar el estado."
                            });
                        }

                        if (this.changes === 0) {
                            return res.status(404).json({
                                mensaje:
                                    "Persona no encontrada."
                            });
                        }

                        res.json({
                            mensaje:
                                estado === "ACTIVO"
                                    ? "Persona activada correctamente."
                                    : "Persona desactivada correctamente."
                        });
                    }
                );
            }
        );

        // ===============================
        // RUTA LISTAR PERSONAL
        // ===============================

        app.get(
            "/api/personal",
            (req, res) => {

                db.all(
                    `
            SELECT
                id,
                nombre,
                rut,
                cargo,
                telefono,
                correo,
                estado,
                fecha_creacion
            FROM personal
            ORDER BY nombre ASC
            `,
                    [],
                    (error, filas) => {

                        if (error) {
                            console.error(
                                "Error al obtener personal:",
                                error
                            );

                            return res.status(500).json({
                                mensaje:
                                    "Error al obtener el personal."
                            });
                        }

                        res.json(filas);
                    }
                );
            }
        );

        // ===============================
        // OBTENER TODOS LOS PRODUCTOS
        // ===============================

        app.get(
            "/api/productos",
            (req, res) => {

                db.all(
                    `
            SELECT
                id,
                codigo,
                nombre,
                descripcion,
                tipo_control,
                foto
            FROM productos
            ORDER BY nombre ASC
            `,
                    [],
                    (error, productos) => {

                        if (error) {

                            console.error(
                                "Error al obtener productos:",
                                error
                            );

                            return res.status(500).json({
                                mensaje:
                                    "Error al obtener los productos."
                            });
                        }

                        res.json(productos);
                    }
                );
            }
        );

        // Editar ficha de producto sin alterar stock, ubicaciones ni movimientos.
        app.put("/api/productos/:id/ficha", recibirFotoProducto, (req, res) => {
            const id = Number(req.params.id);
            const nombre = String(req.body.nombre || '').trim();
            const descripcion = String(req.body.descripcion || '').trim();
            const tipo = String(req.body.tipoControl || '').trim();
            if (!Number.isSafeInteger(id) || id < 1 || !nombre || nombre.length > 200 || descripcion.length > 2000 || !['SERIE','CANTIDAD'].includes(tipo)) {
                return res.status(400).json({ mensaje: 'Datos de producto no válidos.' });
            }
            db.get('SELECT id,tipo_control FROM productos WHERE id=?', [id], (err, previo) => {
                if (err) return res.status(500).json({ mensaje: 'Error al consultar el producto.' });
                if (!previo) return res.status(404).json({ mensaje: 'Producto no encontrado.' });
                const guardar = () => {
                    const foto = req.file ? `/uploads/productos/${req.file.filename}` : null;
                    db.run(`UPDATE productos SET nombre=?, descripcion=?, tipo_control=?, foto=COALESCE(?,foto) WHERE id=?`,
                        [nombre, descripcion, tipo, foto, id], function(error) {
                            if (error) return res.status(500).json({ mensaje: 'No se pudo actualizar el producto.' });
                            res.json({ mensaje: 'Ficha actualizada correctamente.', id });
                        });
                };
                if (previo.tipo_control === tipo) return guardar();
                db.get(`SELECT
                    (SELECT COUNT(*) FROM productos_seriados WHERE producto_id=?) AS series,
                    (SELECT COUNT(*) FROM stock_cantidad WHERE producto_id=? AND cantidad<>0) AS stock,
                    (SELECT COUNT(*) FROM movimientos WHERE producto_id=?) AS movimientos,
                    (SELECT COUNT(*) FROM stock_proyecto WHERE producto_id=?) AS reservas`,
                    [id,id,id,id], (error, uso) => {
                        if (error) return res.status(500).json({ mensaje: 'No se pudo verificar el historial.' });
                        if (uso.series || uso.stock || uso.movimientos || uso.reservas) {
                            return res.status(409).json({ mensaje: 'No es posible cambiar el tipo de control de un producto con existencias, reservas o historial. Puedes editar su nombre, descripción y foto.' });
                        }
                        guardar();
                    });
            });
        });

        // Umbrales de reposición: configuración separada del stock y los movimientos.
        app.get('/api/productos/stock-minimo', (req, res) => {
            db.all('SELECT producto_id AS productoId, minimo FROM inventario_stock_minimo', [], (error, filas) => {
                if (error) return res.status(500).json({ mensaje: 'No se pudieron consultar los mínimos.' });
                res.json(filas);
            });
        });
        app.put('/api/productos/:id/stock-minimo', express.json(), (req, res) => {
            const id = Number(req.params.id);
            const minimo = req.body && req.body.minimo;
            if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(minimo) || minimo < 0 || minimo > 100000000) {
                return res.status(400).json({ mensaje: 'Ingresa un mínimo entero válido (0 a 100.000.000).' });
            }
            db.run(`INSERT INTO inventario_stock_minimo(producto_id,minimo)
                SELECT id, ? FROM productos WHERE id=?
                ON CONFLICT(producto_id) DO UPDATE SET minimo=excluded.minimo`, [minimo,id], function(error) {
                if (error) return res.status(500).json({ mensaje: 'No se pudo guardar el mínimo.' });
                if (!this.changes) return res.status(404).json({ mensaje: 'Producto no encontrado.' });
                res.json({ productoId:id, minimo });
            });
        });

        // Fechas de vencimiento por ficha de producto. No modifica stock ni registro.
        app.get('/api/productos/vencimientos', (req, res) => {
            db.all('SELECT producto_id AS productoId, fecha_vencimiento AS fechaVencimiento, aviso_dias AS avisoDias FROM inventario_vencimientos', [], (error, filas) => {
                if (error) return res.status(500).json({ mensaje: 'No se pudieron consultar los vencimientos.' });
                res.json(filas);
            });
        });
        app.put('/api/productos/:id/vencimiento', express.json(), (req, res) => {
            const id = Number(req.params.id);
            const { fechaVencimiento, avisoDias } = req.body || {};
            if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(avisoDias) || avisoDias < 0 || avisoDias > 3650) {
                return res.status(400).json({ mensaje: 'Producto o días de aviso no válidos.' });
            }
            const fechaValida = typeof fechaVencimiento === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaVencimiento) &&
                !Number.isNaN(Date.parse(fechaVencimiento)) && new Date(fechaVencimiento).toISOString().slice(0,10) === fechaVencimiento;
            if (!fechaValida) return res.status(400).json({ mensaje: 'Indica una fecha válida (AAAA-MM-DD).' });
            db.run(`INSERT INTO inventario_vencimientos(producto_id,fecha_vencimiento,aviso_dias)
                SELECT id, ?, ? FROM productos WHERE id=?
                ON CONFLICT(producto_id) DO UPDATE SET fecha_vencimiento=excluded.fecha_vencimiento,aviso_dias=excluded.aviso_dias`,
                [fechaVencimiento, avisoDias, id], function(error) {
                    if (error) return res.status(500).json({ mensaje: 'No se pudo guardar el vencimiento.' });
                    if (!this.changes) return res.status(404).json({ mensaje: 'Producto no encontrado.' });
                    res.json({ productoId:id, fechaVencimiento, avisoDias });
                });
        });
        app.delete('/api/productos/:id/vencimiento', (req, res) => {
            const id = Number(req.params.id);
            if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ mensaje: 'Producto no válido.' });
            db.run('DELETE FROM inventario_vencimientos WHERE producto_id=?', [id], error => {
                if (error) return res.status(500).json({ mensaje: 'No se pudo eliminar la fecha.' });
                res.json({ productoId:id, eliminado:true });
            });
        });

        // Vencimientos por unidad seriada: solo metadatos, sin modificar stock ni movimientos.
        // Resumen de vencimientos seriados para el panel general (solo lectura).
        app.get('/api/productos/vencimientos-series/resumen', (req, res) => {
            db.all(`SELECT ps.producto_id AS productoId, ps.id AS serieId,
                ps.numero_serie AS numeroSerie, v.fecha_vencimiento AS fechaVencimiento,
                v.aviso_dias AS avisoDias
                FROM inventario_vencimientos_series v
                INNER JOIN productos_seriados ps ON ps.id = v.serie_id
                ORDER BY ps.producto_id, ps.numero_serie`, [], (error, filas) => {
                if (error) return res.status(500).json({mensaje:'No se pudieron consultar los vencimientos seriados.'});
                res.json(filas);
            });
        });
        app.get('/api/productos/:id/series-vencimientos', (req, res) => {
            const id = Number(req.params.id);
            if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({mensaje:'Producto no válido.'});
            db.all(`SELECT ps.id AS serieId, ps.numero_serie AS numeroSerie, ps.estado,
                v.fecha_vencimiento AS fechaVencimiento, v.aviso_dias AS avisoDias
                FROM productos_seriados ps LEFT JOIN inventario_vencimientos_series v ON v.serie_id=ps.id
                WHERE ps.producto_id=? ORDER BY ps.numero_serie`, [id], (error, filas) => {
                if (error) return res.status(500).json({mensaje:'No se pudieron consultar las series.'});
                res.json(filas);
            });
        });
        app.put('/api/productos/:id/series/:serieId/vencimiento', express.json(), (req, res) => {
            const id=Number(req.params.id), serieId=Number(req.params.serieId);
            const {fechaVencimiento,avisoDias}=req.body || {};
            if (![id,serieId].every(n=>Number.isSafeInteger(n)&&n>0) || !Number.isSafeInteger(avisoDias) || avisoDias<0 || avisoDias>3650)
                return res.status(400).json({mensaje:'Identificador o días de aviso no válidos.'});
            if (typeof fechaVencimiento!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(fechaVencimiento) ||
                Number.isNaN(Date.parse(fechaVencimiento)) || new Date(fechaVencimiento).toISOString().slice(0,10)!==fechaVencimiento)
                return res.status(400).json({mensaje:'Fecha de vencimiento no válida.'});
            db.run(`INSERT INTO inventario_vencimientos_series(serie_id,fecha_vencimiento,aviso_dias)
                SELECT id,?,? FROM productos_seriados WHERE id=? AND producto_id=?
                ON CONFLICT(serie_id) DO UPDATE SET fecha_vencimiento=excluded.fecha_vencimiento,aviso_dias=excluded.aviso_dias`,
                [fechaVencimiento,avisoDias,serieId,id], function(error) {
                    if (error) return res.status(500).json({mensaje:'No se pudo guardar el vencimiento de la serie.'});
                    if (!this.changes) return res.status(404).json({mensaje:'Serie no encontrada en el producto.'});
                    res.json({serieId,fechaVencimiento,avisoDias});
                });
        });
        app.delete('/api/productos/:id/series/:serieId/vencimiento', (req,res) => {
            const id=Number(req.params.id), serieId=Number(req.params.serieId);
            if (![id,serieId].every(n=>Number.isSafeInteger(n)&&n>0)) return res.status(400).json({mensaje:'Identificador no válido.'});
            db.run(`DELETE FROM inventario_vencimientos_series WHERE serie_id=?
                AND EXISTS(SELECT 1 FROM productos_seriados WHERE id=? AND producto_id=?)`,
                [serieId,serieId,id], error => {
                    if (error) return res.status(500).json({mensaje:'No se pudo quitar el vencimiento.'});
                    res.json({serieId,eliminado:true});
                });
        });

        // Revisiones de EPP/herramientas seriadas: bitácora independiente y no destructiva.
        app.get('/api/productos/:id/series/:serieId/revisiones', (req, res) => {
            const id = Number(req.params.id), serieId = Number(req.params.serieId);
            if (![id, serieId].every(n => Number.isSafeInteger(n) && n > 0)) return res.status(400).json({mensaje:'Identificador no válido.'});
            db.all(`SELECT r.id, r.fecha_revision AS fechaRevision, r.resultado, r.observaciones
                FROM inventario_revisiones_series r
                INNER JOIN productos_seriados ps ON ps.id=r.serie_id
                WHERE ps.id=? AND ps.producto_id=? ORDER BY r.fecha_revision DESC, r.id DESC LIMIT 100`,
                [serieId,id], (error, filas) => {
                    if (error) return res.status(500).json({mensaje:'No se pudo consultar el historial de revisiones.'});
                    res.json(filas);
                });
        });
        app.post('/api/productos/:id/series/:serieId/revisiones', express.json(), (req, res) => {
            const id=Number(req.params.id), serieId=Number(req.params.serieId);
            const {resultado,observaciones=''}=req.body || {};
            if (![id,serieId].every(n=>Number.isSafeInteger(n)&&n>0) ||
                !['APROBADA','OBSERVADA','RECHAZADA'].includes(resultado) ||
                typeof observaciones!=='string' || observaciones.length>1000)
                return res.status(400).json({mensaje:'Datos de revisión no válidos.'});
            db.run(`INSERT INTO inventario_revisiones_series(serie_id,resultado,observaciones)
                SELECT id,?,? FROM productos_seriados WHERE id=? AND producto_id=?`,
                [resultado,observaciones.trim(),serieId,id], function(error) {
                    if (error) return res.status(500).json({mensaje:'No se pudo registrar la revisión.'});
                    if (!this.changes) return res.status(404).json({mensaje:'La serie no pertenece a este producto.'});
                    res.status(201).json({id:this.lastID,resultado,observaciones:observaciones.trim()});
                });
        });

        // Disponibilidad informativa. Las series libres excluyen asignaciones y entregas abiertas.
        app.get("/api/productos/disponibilidad", (req, res) => {
            db.all(`SELECT p.id AS producto_id, p.tipo_control,
                COALESCE((SELECT SUM(sc.cantidad) FROM stock_cantidad sc WHERE sc.producto_id=p.id),0) AS total,
                COALESCE((SELECT SUM(sp.cantidad) FROM stock_proyecto sp WHERE sp.producto_id=p.id),0) AS reservado,
                (SELECT COUNT(*) FROM productos_seriados ps WHERE ps.producto_id=p.id AND ps.estado='Disponible') AS total_series,
                (SELECT COUNT(*) FROM productos_seriados ps WHERE ps.producto_id=p.id AND ps.estado='Disponible'
                    AND NOT EXISTS(SELECT 1 FROM series_proyecto sp WHERE sp.serie_id=ps.id)
                    AND NOT EXISTS(SELECT 1 FROM entregas_series_proyecto ep WHERE ep.serie_id=ps.id AND ep.fecha_devolucion IS NULL)) AS libres_series
                FROM productos p`, [], (err, filas) => {
                if (err) return res.status(500).json({ mensaje: "No se pudo consultar disponibilidad." });
                res.json(filas.map(f => {
                    const serie = f.tipo_control === 'SERIE';
                    const total = serie ? Number(f.total_series) : Number(f.total);
                    const libre = serie ? Number(f.libres_series) : Math.max(0, total - Number(f.reservado));
                    return { productoId: f.producto_id, tipoControl: f.tipo_control,
                        total, reservado: serie ? total - libre : Number(f.reservado), libre };
                }));
            });
        });

        // Stock físico por bodega, incluyendo unidades seriadas disponibles.
        app.get("/api/productos/disponibilidad-bodegas", (req, res) => {
            // La pantalla de solicitudes consulta exclusivamente la bodega vinculada.
            const filtroBodega = req.query.bodega;
            if (filtroBodega !== undefined && (!/^\d+$/.test(String(filtroBodega)) || Number(filtroBodega) < 1 || !Number.isSafeInteger(Number(filtroBodega)))) {
                return res.status(400).json({ mensaje: "Bodega inválida." });
            }
            db.all(`SELECT productoId, bodega, SUM(total) AS total FROM (
                SELECT sc.producto_id AS productoId, u.bodega AS bodega, SUM(sc.cantidad) AS total
                  FROM stock_cantidad sc JOIN ubicaciones u ON u.id=sc.ubicacion_id
                  GROUP BY sc.producto_id,u.bodega
                UNION ALL
                SELECT ps.producto_id AS productoId, u.bodega AS bodega, COUNT(*) AS total
                  FROM productos_seriados ps JOIN ubicaciones u ON u.id=ps.ubicacion_id
                  WHERE ps.estado='Disponible'
                  GROUP BY ps.producto_id,u.bodega
            ) GROUP BY productoId,bodega ORDER BY bodega`, [], (error, filas) => {
                if (error) return res.status(500).json({ mensaje: "No se pudo consultar el stock por bodega." });
                const visibles = filtroBodega === undefined ? filas : filas.filter(f => Number(f.bodega) === Number(filtroBodega));
                res.json(visibles.map(f => ({ productoId: Number(f.productoId), bodega: f.bodega, total: Number(f.total) })));
            });
        });

        // ===============================
        // RUTA GUARDAR PRODUCTO
        // ===============================

        app.post(
            "/api/productos",
            recibirFotoProducto,
            (req, res) => {

                const {
                    codigo,
                    nombre,
                    descripcion,
                    tipoControl,
                    numeroSerie,
                    cantidad,
                    ubicacion
                } = req.body;

                const foto = req.file
                    ? `/uploads/productos/${req.file.filename}`
                    : null;

                // ===============================
                // VALIDACIONES
                // ===============================

                if (
                    !codigo ||
                    !nombre ||
                    !tipoControl ||
                    !ubicacion
                ) {

                    return res.status(400).json({
                        mensaje:
                            "Faltan datos obligatorios."
                    });

                }

                if (
                    tipoControl !== "SERIE" &&
                    tipoControl !== "CANTIDAD"
                ) {

                    return res.status(400).json({
                        mensaje:
                            "Tipo de control no válido."
                    });

                }

                if (
                    tipoControl === "SERIE" &&
                    !numeroSerie
                ) {

                    return res.status(400).json({
                        mensaje:
                            "Debes ingresar el número de serie."
                    });

                }

                if (
                    tipoControl === "CANTIDAD" &&
                    (
                        cantidad === "" ||
                        Number(cantidad) < 0
                    )
                ) {

                    return res.status(400).json({
                        mensaje:
                            "Debes ingresar una cantidad válida."
                    });

                }

                // ===============================
                // BUSCAR O CREAR UBICACIÓN
                // ===============================

                const partesUbicacion =
                    ubicacion.match(
                        /^B(\d+)-P(\d+)-U(\d+)$/
                    );

                if (!partesUbicacion) {

                    return res.status(400).json({
                        mensaje:
                            "Formato de ubicación no válido."
                    });

                }

                const numeroBodega =
                    Number(partesUbicacion[1]);

                const numeroPasillo =
                    Number(partesUbicacion[2]);

                const numeroUbicacion =
                    Number(partesUbicacion[3]);

                db.get(
                    `
            SELECT id
            FROM ubicaciones
            WHERE codigo = ?
            `,
                    [ubicacion],
                    (errorUbicacion, filaUbicacion) => {

                        if (errorUbicacion) {

                            return res.status(500).json({
                                mensaje:
                                    "Error al consultar la ubicación."
                            });

                        }

                        if (filaUbicacion) {

                            guardarProducto(
                                filaUbicacion.id
                            );

                        } else {

                            db.run(
                                `
                        INSERT INTO ubicaciones (
                            codigo,
                            bodega,
                            pasillo,
                            ubicacion,
                            estado
                        )
                        VALUES (?, ?, ?, ?, ?)
                        `,
                                [
                                    ubicacion,
                                    numeroBodega,
                                    numeroPasillo,
                                    numeroUbicacion,
                                    "Disponible"
                                ],
                                function (errorInsertUbicacion) {

                                    if (errorInsertUbicacion) {

                                        return res.status(500).json({
                                            mensaje:
                                                "Error al crear la ubicación."
                                        });

                                    }

                                    guardarProducto(this.lastID);

                                }
                            );

                        }

                    }
                );

                // ===============================
                // GUARDAR O BUSCAR PRODUCTO
                // ===============================

                function guardarProducto(
                    ubicacionId
                ) {

                    db.get(
                        `
        SELECT
            id,
            tipo_control
        FROM productos
        WHERE codigo = ?
        `,
                        [codigo],
                        (
                            errorBuscarProducto,
                            productoExistente
                        ) => {

                            if (errorBuscarProducto) {

                                return res.status(500).json({
                                    mensaje:
                                        "Error al buscar el producto."
                                });

                            }

                            // ===============================
                            // SI EL PRODUCTO YA EXISTE
                            // ===============================

                            if (productoExistente) {

                                if (
                                    productoExistente.tipo_control !==
                                    tipoControl
                                ) {

                                    return res.status(400).json({
                                        mensaje:
                                            "El producto ya existe con otro tipo de control."
                                    });

                                }

                                if (
                                    tipoControl === "SERIE"
                                ) {

                                    guardarProductoSeriado(
                                        productoExistente.id,
                                        ubicacionId
                                    );

                                } else {

                                    guardarProductoCantidad(
                                        productoExistente.id,
                                        ubicacionId
                                    );

                                }

                                return;

                            }

                            // ===============================
                            // SI EL PRODUCTO NO EXISTE
                            // ===============================

                            db.run(
                                `
                INSERT INTO productos (
                    codigo,
                    nombre,
                    descripcion,
                    tipo_control,
                    foto
                )
                VALUES (?, ?, ?, ?, ?)
                `,
                                [
                                    codigo,
                                    nombre,
                                    descripcion || null,
                                    tipoControl,
                                    foto
                                ],
                                function (errorProducto) {

                                    if (errorProducto) {

                                        return res.status(500).json({
                                            mensaje:
                                                "Error al guardar el producto."
                                        });

                                    }

                                    const productoId =
                                        this.lastID;

                                    if (
                                        tipoControl === "SERIE"
                                    ) {

                                        guardarProductoSeriado(
                                            productoId,
                                            ubicacionId
                                        );

                                    } else {

                                        guardarProductoCantidad(
                                            productoId,
                                            ubicacionId
                                        );

                                    }

                                }
                            );

                        }
                    );

                }

                // ===============================
                // GUARDAR PRODUCTO SERIADO
                // ===============================

                function guardarProductoSeriado(
                    productoId,
                    ubicacionId
                ) {

                    db.run(
                        `
                INSERT INTO productos_seriados (
                    producto_id,
                    numero_serie,
                    ubicacion_id,
                    estado
                )
                VALUES (?, ?, ?, ?)
                `,
                        [
                            productoId,
                            numeroSerie,
                            ubicacionId,
                            "Disponible"
                        ],
                        function (errorSerie) {

                            if (errorSerie) {

                                return res.status(500).json({
                                    mensaje:
                                        "Error al guardar el número de serie."
                                });

                            }

                            actualizarEstadoUbicacion(
                                ubicacionId
                            );

                            res.json({
                                mensaje:
                                    "Producto seriado guardado correctamente."
                            });

                        }
                    );

                }

                // ===============================
                // GUARDAR O SUMAR PRODUCTO POR CANTIDAD
                // ===============================

                function guardarProductoCantidad(
                    productoId,
                    ubicacionId
                ) {

                    db.get(
                        `
        SELECT
            id,
            cantidad
        FROM stock_cantidad
        WHERE producto_id = ?
        AND ubicacion_id = ?
        `,
                        [
                            productoId,
                            ubicacionId
                        ],
                        (
                            errorBuscarStock,
                            stockExistente
                        ) => {

                            if (errorBuscarStock) {

                                return res.status(500).json({
                                    mensaje:
                                        "Error al consultar el stock."
                                });

                            }

                            // ===============================
                            // SI YA EXISTE EN ESA UBICACIÓN
                            // ===============================

                            if (stockExistente) {

                                const nuevaCantidad =
                                    stockExistente.cantidad +
                                    Number(cantidad);

                                db.run(
                                    `
                    UPDATE stock_cantidad
                    SET cantidad = ?
                    WHERE id = ?
                    `,
                                    [
                                        nuevaCantidad,
                                        stockExistente.id
                                    ],
                                    function (errorActualizar) {

                                        if (errorActualizar) {

                                            return res.status(500).json({
                                                mensaje:
                                                    "Error al actualizar la cantidad."
                                            });

                                        }

                                        actualizarEstadoUbicacion(
                                            ubicacionId
                                        );

                                        return res.json({
                                            mensaje:
                                                "Stock actualizado correctamente."
                                        });

                                    }
                                );

                                return;

                            }

                            // ===============================
                            // SI NO EXISTE EN ESA UBICACIÓN
                            // ===============================

                            db.run(
                                `
                INSERT INTO stock_cantidad (
                    producto_id,
                    ubicacion_id,
                    cantidad
                )
                VALUES (?, ?, ?)
                `,
                                [
                                    productoId,
                                    ubicacionId,
                                    Number(cantidad)
                                ],
                                function (errorCantidad) {

                                    if (errorCantidad) {

                                        return res.status(500).json({
                                            mensaje:
                                                "Error al guardar la cantidad."
                                        });

                                    }

                                    actualizarEstadoUbicacion(
                                        ubicacionId
                                    );

                                    return res.json({
                                        mensaje:
                                            "Stock guardado correctamente."
                                    });

                                }
                            );

                        }
                    );

                }

                // ===============================
                // ACTUALIZAR ESTADO UBICACIÓN
                // ===============================

                function actualizarEstadoUbicacion(
                    ubicacionId
                ) {

                    db.run(
                        `
                UPDATE ubicaciones
                SET estado = 'Ocupada'
                WHERE id = ?
                `,
                        [ubicacionId]
                    );

                }

            }
        );

        // ===============================
        // BUSCAR PRODUCTO O NÚMERO DE SERIE
        // ===============================

        app.get(
            "/api/buscar/:termino",
            (req, res) => {

                const termino =
                    req.params.termino.trim();

                // ===============================
                // BUSCAR POR NÚMERO DE SERIE
                // ===============================

                db.get(
                    `
            SELECT
                p.codigo,
                p.nombre,
                p.descripcion,
                p.tipo_control,
                p.foto,
                ps.numero_serie,
                u.codigo AS ubicacion
            FROM productos_seriados ps

            INNER JOIN productos p
                ON p.id = ps.producto_id

            LEFT JOIN ubicaciones u
                ON u.id = ps.ubicacion_id

            WHERE ps.numero_serie = ?
            `,
                    [termino],
                    (
                        errorSerie,
                        resultadoSerie
                    ) => {

                        if (errorSerie) {

                            return res.status(500).json({
                                mensaje:
                                    "Error al buscar por número de serie."
                            });

                        }

                        if (resultadoSerie) {

                            return res.json({
                                encontrado: true,
                                tipoBusqueda: "SERIE",
                                producto: resultadoSerie
                            });

                        }

                        // ===============================
                        // BUSCAR PRODUCTO POR CÓDIGO
                        // ===============================

                        db.get(
                            `
                    SELECT
                        id,
                        codigo,
                        nombre,
                        descripcion,
                        tipo_control,
                        foto
                    FROM productos
                    WHERE codigo = ?
                       OR LOWER(nombre) LIKE LOWER(?) ESCAPE '\\'
                       OR LOWER(COALESCE(descripcion, '')) LIKE LOWER(?) ESCAPE '\\'
                    ORDER BY CASE WHEN codigo = ? THEN 0
                                  WHEN LOWER(nombre) = LOWER(?) THEN 1
                                  WHEN LOWER(nombre) LIKE LOWER(?) ESCAPE '\\' THEN 2
                                  ELSE 3 END, nombre, id
                    LIMIT 1
                    `,
                            [termino,
                             '%' + termino.replace(/[\\%_]/g, '\\$&') + '%',
                             '%' + termino.replace(/[\\%_]/g, '\\$&') + '%',
                             termino, termino,
                             termino.replace(/[\\%_]/g, '\\$&') + '%'],
                            (
                                errorProducto,
                                producto
                            ) => {

                                if (errorProducto) {

                                    return res.status(500).json({
                                        mensaje:
                                            "Error al buscar el producto."
                                    });

                                }

                                if (!producto) {

                                    return res.json({
                                        encontrado: false,
                                        mensaje:
                                            "No se encontró el producto."
                                    });

                                }

                                // ===============================
                                // PRODUCTO POR CANTIDAD
                                // ===============================

                                if (
                                    producto.tipo_control ===
                                    "CANTIDAD"
                                ) {

                                    db.all(
                                        `
                                SELECT
                                    sc.cantidad,
                                    u.codigo AS ubicacion
                                FROM stock_cantidad sc

                                INNER JOIN ubicaciones u
                                    ON u.id = sc.ubicacion_id

                                WHERE sc.producto_id = ?
                                `,
                                        [producto.id],
                                        (
                                            errorStock,
                                            ubicacionesStock
                                        ) => {

                                            if (errorStock) {

                                                return res.status(500).json({
                                                    mensaje:
                                                        "Error al consultar el stock."
                                                });

                                            }

                                            return res.json({
                                                encontrado: true,
                                                tipoBusqueda:
                                                    "CANTIDAD",
                                                producto: {
                                                    codigo:
                                                        producto.codigo,

                                                    nombre:
                                                        producto.nombre,

                                                    descripcion:
                                                        producto.descripcion,

                                                    tipoControl:
                                                        producto.tipo_control,

                                                    foto:
                                                        producto.foto,

                                                    ubicaciones:
                                                        ubicacionesStock
                                                }
                                            });

                                        }
                                    );

                                    return;

                                }

                                // ===============================
                                // PRODUCTO SERIADO
                                // ===============================

                                db.all(
                                    `
                            SELECT
                                ps.numero_serie,
                                u.codigo AS ubicacion
                            FROM productos_seriados ps

                            LEFT JOIN ubicaciones u
                                ON u.id = ps.ubicacion_id

                            WHERE ps.producto_id = ?
                            `,
                                    [producto.id],
                                    (
                                        errorSeries,
                                        series
                                    ) => {

                                        if (errorSeries) {

                                            return res.status(500).json({
                                                mensaje:
                                                    "Error al consultar los números de serie."
                                            });

                                        }

                                        return res.json({
                                            encontrado: true,
                                            tipoBusqueda:
                                                "SERIE",
                                            producto: {
                                                codigo:
                                                    producto.codigo,

                                                nombre:
                                                    producto.nombre,

                                                descripcion:
                                                    producto.descripcion,

                                                tipoControl:
                                                    producto.tipo_control,

                                                foto:
                                                    producto.foto,

                                                series:
                                                    series
                                            }
                                        });

                                    }
                                );

                            }
                        );

                    }
                );

            }
        );

        // ===============================
        // LISTAR TODAS LAS UBICACIONES
        // ===============================

        app.get(
            "/api/ubicaciones",
            (req, res) => {

                db.all(
                    `
            SELECT
                id,
                codigo,
                bodega,
                pasillo,
                ubicacion,
                estado
            FROM ubicaciones

            ORDER BY
                bodega,
                pasillo,
                ubicacion
            `,
                    [],
                    (
                        error,
                        filas
                    ) => {

                        if (error) {

                            console.error(
                                "Error al listar ubicaciones:",
                                error.message
                            );

                            return res.status(500).json({
                                mensaje:
                                    "Error al cargar las ubicaciones."
                            });

                        }

                        res.json(filas);

                    }
                );

            }
        );


        // ===============================
        // CREAR NUEVA UBICACIÓN
        // ===============================

        app.post('/api/ubicaciones', async (req,res) => {
            const {bodega,pasillo,ubicacion}=req.body||{};
            const [b,p,u]=[bodega,pasillo,ubicacion].map(Number);
            if (![b,p,u].every(Number.isSafeInteger)||[b,p,u].some(v=>v<1||v>9999999))
                return res.status(400).json({mensaje:'Ingresa bodega, pasillo y ubicación válidos.'});
            const codigo=`B${b}-P${String(p).padStart(2,'0')}-U${String(u).padStart(2,'0')}`;
            try {
                const id=await require('./routes/transaction-lock')(db,()=>new Promise((ok,fail)=>
                    db.run('INSERT INTO ubicaciones(codigo,bodega,pasillo,ubicacion,estado) VALUES(?,?,?,?,?)',
                        [codigo,b,p,u,'Disponible'],function(err){err?fail(err):ok(this.lastID)})));
                res.status(201).json({mensaje:`Ubicación ${codigo} creada correctamente.`,id,codigo});
            }catch(e){
                res.status(e.code==='SQLITE_CONSTRAINT'?409:500).json({mensaje:
                    e.code==='SQLITE_CONSTRAINT'?'Esa ubicación ya existe.':'No se pudo crear la ubicación.'});
            }
        });


        // Códigos manuales conservan la estructura B-P-U para compatibilidad
        // con mapas, reportes, movimientos y proyectos existentes.
        const parseCodigoUbicacion = (value) => {
            const m = /^B([1-9]\d{0,5})-P(\d{1,6})-U(\d{1,7})$/i.exec(String(value || '').trim());
            if (!m) return null;
            const [b,p,u] = m.slice(1).map(Number);
            return p > 0 && u > 0 ? {codigo:`B${b}-P${String(p).padStart(2,'0')}-U${String(u).padStart(2,'0')}`,b,p,u} : null;
        };
        app.post('/api/ubicaciones/manual', async (req,res) => {
            const data = parseCodigoUbicacion(req.body?.codigo);
            if (!data) return res.status(400).json({mensaje:'Usa un código como B1-P01-U01 (números positivos).'});
            try {
                const id = await require('./routes/transaction-lock')(db,()=>new Promise((ok,fail)=>
                    db.run('INSERT INTO ubicaciones(codigo,bodega,pasillo,ubicacion,estado) VALUES(?,?,?,?,?)',
                    [data.codigo,data.b,data.p,data.u,'Disponible'],function(e){e?fail(e):ok(this.lastID)})));
                res.status(201).json({id,codigo:data.codigo,mensaje:'Ubicación creada correctamente.'});
            } catch(e) {
                res.status(e.code==='SQLITE_CONSTRAINT'?409:500).json({mensaje:e.code==='SQLITE_CONSTRAINT'?'El código ya existe.':'No se pudo crear la ubicación.'});
            }
        });
        app.patch('/api/ubicaciones/codigo/:id', async (req,res) => {
            const id=Number(req.params.id), data=parseCodigoUbicacion(req.body?.codigo);
            if (!Number.isSafeInteger(id)||id<1||!data)
                return res.status(400).json({mensaje:'Identificador o código inválido.'});
            const get=(sql,args)=>new Promise((ok,fail)=>db.get(sql,args,(e,r)=>e?fail(e):ok(r)));
            const run=(sql,args)=>new Promise((ok,fail)=>db.run(sql,args,function(e){e?fail(e):ok(this.changes)}));
            try {
                await require('./routes/transaction-lock')(db,async()=>{
                    const actual=await get('SELECT id,codigo FROM ubicaciones WHERE id=?',[id]);
                    if(!actual) throw Object.assign(new Error('Ubicación inexistente.'),{status:404});
                    // Los códigos aparecen en referencias históricas: no renombrar ubicaciones utilizadas.
                    const refs=[
                        ['stock_cantidad','ubicacion_id'],['productos_seriados','ubicacion_id'],
                        ['movimientos','ubicacion_id']
                    ];
                    for(const [tabla,col] of refs){
                        const r=await get(`SELECT 1 AS existe FROM ${tabla} WHERE ${col}=? LIMIT 1`,[id]);
                        if(r) throw Object.assign(new Error('La ubicación tiene stock o historial de movimientos. No se puede cambiar su código.'),{status:409});
                    }
                    await run('UPDATE ubicaciones SET codigo=?,bodega=?,pasillo=?,ubicacion=? WHERE id=?',
                        [data.codigo,data.b,data.p,data.u,id]);
                });
                res.json({codigo:data.codigo,mensaje:'Código actualizado correctamente.'});
            }catch(e){
                res.status(e.status||(e.code==='SQLITE_CONSTRAINT'?409:500)).json({mensaje:e.status?e.message:e.code==='SQLITE_CONSTRAINT'?'El código ya existe.':'No se pudo editar la ubicación.'});
            }
        });

        // Eliminar de forma individual, sin alterar bodegas ni ubicaciones ajenas.
        // Una bodega es el conjunto de ubicaciones con el mismo número.
        const borrarEspaciosSeguros = async (req,res,esBodega) => {
            const id=Number(req.params.id);
            if (!Number.isSafeInteger(id)||id<1)
                return res.status(400).json({mensaje:'Identificador inválido.'});
            const get=(sql,args=[])=>new Promise((ok,fail)=>db.get(sql,args,(e,r)=>e?fail(e):ok(r)));
            const all=(sql,args=[])=>new Promise((ok,fail)=>db.all(sql,args,(e,r)=>e?fail(e):ok(r)));
            const run=(sql,args=[])=>new Promise((ok,fail)=>db.run(sql,args,function(e){e?fail(e):ok(this.changes)}));
            try {
                const result=await require('./routes/transaction-lock')(db,async()=>{
                    const filtro=esBodega?'bodega=?':'id=?';
                    const lugares=await all(`SELECT id,codigo FROM ubicaciones WHERE ${filtro}`,[id]);
                    if(!lugares.length)throw Object.assign(new Error('No existe la bodega o ubicación.'),{status:404});
                    if(esBodega){
                        const proyecto=await get('SELECT 1 AS existe FROM proyectos WHERE bodega_numero=? LIMIT 1',[id]);
                        if(proyecto)throw Object.assign(new Error('La bodega está vinculada a proyectos y no se puede eliminar.'),{status:409});
                    }
                    // Revisar todas las tablas que referencian una ubicación por ID,
                    // incluyendo módulos agregados posteriormente.
                    const tables=await all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
                    for(const table of tables){
                        if(table.name==='ubicaciones'||!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table.name))continue;
                        const columns=await all(`PRAGMA table_info("${table.name}")`);
                        for(const col of columns){
                            if(!/^(ubicacion_id|ubicacion_origen_id|ubicacion_destino_id)$/i.test(col.name))continue;
                            const ids=lugares.map(l=>l.id);
                            const placeholders=ids.map(()=>'?').join(',');
                            const ref=await get(`SELECT 1 AS existe FROM "${table.name}" WHERE "${col.name}" IN (${placeholders}) LIMIT 1`,ids);
                            if(ref)throw Object.assign(new Error('Hay stock, productos o movimientos asociados. No se puede eliminar.'),{status:409});
                        }
                    }
                    const deleted=await run(`DELETE FROM ubicaciones WHERE ${filtro}`,[id]);
                    return deleted;
                });
                res.json({mensaje:esBodega?'Bodega eliminada correctamente.':'Ubicación eliminada correctamente.',eliminadas:result});
            }catch(e){
                console.error('Error al eliminar espacio:',e.message);
                res.status(e.status||500).json({mensaje:e.status?e.message:'No se pudo eliminar. Revisa las referencias del inventario.'});
            }
        };
        app.delete('/api/bodegas/:id', (req,res)=>borrarEspaciosSeguros(req,res,true));
        app.delete('/api/ubicaciones/id/:id', (req,res)=>borrarEspaciosSeguros(req,res,false));

        // ===============================
        // CREAR UBICACIONES POR LOTE
        // ===============================

        // Creación de ubicaciones por lote: validación y atomicidad.
        // Una falla revierte TODO el lote para no dejar espacios incompletos.
        app.post('/api/ubicaciones/lote', async (req, res) => {
            const { bodega, pasillo, cantidadUbicaciones } = req.body || {};
            const b = Number(bodega), p = Number(pasillo), cantidad = Number(cantidadUbicaciones);
            if (![b,p,cantidad].every(Number.isSafeInteger) || b < 1 || p < 1 ||
                cantidad < 1 || cantidad > 500 || b > 999999 || p > 999999) {
                return res.status(400).json({mensaje:'Ingresa bodega y pasillo válidos y entre 1 y 500 ubicaciones.'});
            }
            const get = (sql,args=[]) => new Promise((ok,fail)=>
                db.get(sql,args,(e,row)=>e?fail(e):ok(row)));
            const run = (sql,args=[]) => new Promise((ok,fail)=>
                db.run(sql,args,function(e){e?fail(e):ok(this.lastID)}));
            try {
                const resultado = await require('./routes/transaction-lock')(db, async () => {
                    const fila = await get('SELECT COALESCE(MAX(ubicacion),0) AS ultimo FROM ubicaciones WHERE bodega=? AND pasillo=?',[b,p]);
                    const ultimo = Number(fila.ultimo);
                    if (!Number.isSafeInteger(ultimo) || ultimo + cantidad > 9999999)
                        throw Object.assign(new Error('Límite de ubicaciones alcanzado.'),{status:400});
                    for (let i=1;i<=cantidad;i++) {
                        const numero=ultimo+i;
                        const codigo=`B${b}-P${String(p).padStart(2,'0')}-U${String(numero).padStart(2,'0')}`;
                        await run('INSERT INTO ubicaciones(codigo,bodega,pasillo,ubicacion,estado) VALUES(?,?,?,?,?)',
                            [codigo,b,p,numero,'Disponible']);
                    }
                    return {creadas:cantidad,errores:0,mensaje:`${cantidad} ubicaciones creadas correctamente.`};
                });
                res.status(201).json(resultado);
            } catch (e) {
                console.error('No se pudo crear el lote de ubicaciones:',e.message);
                res.status(e.status || (e.code==='SQLITE_CONSTRAINT'?409:500))
                    .json({mensaje:e.status?e.message:e.code==='SQLITE_CONSTRAINT'?
                        'Ya existe una ubicación con ese código. No se creó ninguna.':
                        'No se pudo crear el lote. No se guardaron ubicaciones parciales.'});
            }
        });

        // ===============================
        // CONSULTAR PRODUCTOS POR UBICACIÓN
        // ===============================

        app.get(
            "/api/ubicaciones/:codigo",
            (req, res) => {

                const codigoUbicacion =
                    req.params.codigo;

                // ===============================
                // BUSCAR UBICACIÓN
                // ===============================

                db.get(
                    `
            SELECT
                id,
                codigo,
                estado
            FROM ubicaciones
            WHERE codigo = ?
            `,
                    [codigoUbicacion],
                    (
                        errorUbicacion,
                        ubicacion
                    ) => {

                        if (errorUbicacion) {

                            console.error(
                                "Error al consultar ubicación:",
                                errorUbicacion.message
                            );

                            return res.status(500).json({
                                mensaje:
                                    "Error al consultar la ubicación."
                            });

                        }

                        if (!ubicacion) {

                            return res.json({
                                codigo:
                                    codigoUbicacion,

                                estado:
                                    "Disponible",

                                productos:
                                    []
                            });

                        }


                        // ===============================
                        // BUSCAR PRODUCTOS POR CANTIDAD
                        // ===============================

                        db.all(
                            `
                    SELECT
                        p.codigo,
                        p.nombre,
                        p.descripcion,
                        p.tipo_control,
                        p.foto,
                        sc.cantidad
                    FROM stock_cantidad sc

                    INNER JOIN productos p
                        ON p.id = sc.producto_id

                    WHERE sc.ubicacion_id = ?
                    `,
                            [ubicacion.id],
                            (
                                errorCantidad,
                                productosCantidad
                            ) => {

                                if (errorCantidad) {

                                    console.error(
                                        "Error al consultar productos por cantidad:",
                                        errorCantidad.message
                                    );

                                    return res.status(500).json({
                                        mensaje:
                                            "Error al consultar productos por cantidad."
                                    });

                                }


                                // ===============================
                                // BUSCAR PRODUCTOS SERIADOS
                                // ===============================

                                db.all(
                                    `
                            SELECT
                                p.codigo,
                                p.nombre,
                                p.descripcion,
                                p.tipo_control,
                                p.foto,
                                ps.numero_serie
                            FROM productos_seriados ps

                            INNER JOIN productos p
                                ON p.id = ps.producto_id

                            WHERE ps.ubicacion_id = ?
                            `,
                                    [ubicacion.id],
                                    (
                                        errorSerie,
                                        productosSerie
                                    ) => {

                                        if (errorSerie) {

                                            console.error(
                                                "Error al consultar productos seriados:",
                                                errorSerie.message
                                            );

                                            return res.status(500).json({
                                                mensaje:
                                                    "Error al consultar productos seriados."
                                            });

                                        }


                                        // ===============================
                                        // ARMAR LISTA DE PRODUCTOS
                                        // ===============================

                                        const productos = [];


                                        // Productos controlados
                                        // por cantidad

                                        productosCantidad.forEach(
                                            function (item) {

                                                productos.push({

                                                    codigo:
                                                        item.codigo,

                                                    nombre:
                                                        item.nombre,

                                                    descripcion:
                                                        item.descripcion,

                                                    tipoControl:
                                                        item.tipo_control,

                                                    foto:
                                                        item.foto,

                                                    cantidad:
                                                        item.cantidad,

                                                    numeroSerie:
                                                        null

                                                });

                                            }
                                        );


                                        // Productos controlados
                                        // por número de serie

                                        productosSerie.forEach(
                                            function (item) {

                                                productos.push({

                                                    codigo:
                                                        item.codigo,

                                                    nombre:
                                                        item.nombre,

                                                    descripcion:
                                                        item.descripcion,

                                                    tipoControl:
                                                        item.tipo_control,

                                                    foto:
                                                        item.foto,

                                                    cantidad:
                                                        null,

                                                    numeroSerie:
                                                        item.numero_serie

                                                });

                                            }
                                        );


                                        // ===============================
                                        // RESPUESTA
                                        // ===============================

                                        return res.json({

                                            codigo:
                                                ubicacion.codigo,

                                            estado:
                                                ubicacion.estado,

                                            productos:
                                                productos

                                        });

                                    }
                                );

                            }
                        );

                    }
                );

            }
        );

        // ===============================
        // REGISTRAR MOVIMIENTO
        // ===============================

        // Compatibilidad: valida los movimientos antiguos contra reservas de proyectos.
        // Se ejecuta antes del controlador heredado y rechaza cantidades fraccionarias.
        app.post('/api/movimientos', (req,res,next) => {
            const {tipoMovimiento,codigoProducto,ubicacion,cantidad,numeroSerie}=req.body || {};
            if (!['ENTRADA','SALIDA'].includes(tipoMovimiento))
                return res.status(400).json({mensaje:'Movimiento no válido'});
            db.get('SELECT id,tipo_control FROM productos WHERE codigo=?',[codigoProducto],(error,producto)=>{
                if(error)return res.status(500).json({mensaje:'No se pudo validar el producto'});
                if(!producto)return res.status(404).json({mensaje:'Producto inexistente'});
                if(producto.tipo_control==='CANTIDAD'){
                    const n=Number(cantidad);
                    if(!Number.isSafeInteger(n)||n<=0)
                        return res.status(400).json({mensaje:'La cantidad debe ser un entero positivo'});
                    if(tipoMovimiento==='ENTRADA')return next();
                    return db.get(`SELECT
                        COALESCE((SELECT SUM(cantidad) FROM stock_cantidad
                          WHERE producto_id=? AND ubicacion_id=(SELECT id FROM ubicaciones WHERE codigo=?)),0) AS fisico,
                        COALESCE((SELECT SUM(cantidad) FROM stock_proyecto
                          WHERE producto_id=? AND ubicacion_id=(SELECT id FROM ubicaciones WHERE codigo=?)),0) AS asignado`,
                        [producto.id,ubicacion,producto.id,ubicacion],(e,stock)=>{
                            if(e)return res.status(500).json({mensaje:'No se pudo verificar el stock libre'});
                            if(n>stock.fisico-stock.asignado)
                                return res.status(409).json({mensaje:`Stock libre insuficiente. Disponible: ${Math.max(0,stock.fisico-stock.asignado)}.`});
                            next();
                        });
                }
                if(producto.tipo_control!=='SERIE')
                    return res.status(400).json({mensaje:'Tipo de producto inválido'});
                if(!numeroSerie || typeof numeroSerie!=='string')
                    return res.status(400).json({mensaje:'Indica el número de serie'});
                db.get(`SELECT ps.id,ps.estado,
                    EXISTS(SELECT 1 FROM series_proyecto sp WHERE sp.serie_id=ps.id) AS asignada,
                    EXISTS(SELECT 1 FROM entregas_series_proyecto ep WHERE ep.serie_id=ps.id AND ep.fecha_devolucion IS NULL) AS entregada
                    FROM productos_seriados ps WHERE ps.numero_serie=?`,[numeroSerie],(e,serie)=>{
                    if(e)return res.status(500).json({mensaje:'No se pudo verificar la serie'});
                    if(tipoMovimiento==='SALIDA' && serie && (serie.asignada||serie.entregada))
                        return res.status(409).json({mensaje:'La serie está asignada a un proyecto o trabajador. Utiliza la solicitud correspondiente.'});
                    if(tipoMovimiento==='ENTRADA' && serie && (serie.entregada || serie.estado==='SALIDA'))
                        return res.status(409).json({mensaje:'Para devolver una herramienta entregada utiliza el módulo de devoluciones.'});
                    next();
                });
            });
        });

        app.post(
            "/api/movimientos",
            (req, res) => {

                const {
                    tipoMovimiento,
                    codigoProducto,
                    ubicacion,
                    cantidad,
                    numeroSerie,
                    personalId
                } = req.body;

                // ===============================
                // VALIDACIONES GENERALES
                // ===============================

                if (
                    !tipoMovimiento ||
                    !codigoProducto ||
                    !ubicacion
                ) {

                    return res.status(400).json({
                        mensaje:
                            "Faltan datos obligatorios."
                    });

                }

                // ===============================
                // VALIDAR PERSONAL EN SALIDA
                // ===============================

                if (
                    tipoMovimiento === "SALIDA" &&
                    !personalId
                ) {
                    return res.status(400).json({
                        mensaje:
                            "Debes seleccionar el técnico o asistente que recibe el producto."
                    });
                }

                if (
                    tipoMovimiento !== "ENTRADA" &&
                    tipoMovimiento !== "SALIDA"
                ) {

                    return res.status(400).json({
                        mensaje:
                            "Tipo de movimiento no válido."
                    });

                }

                const continuarMovimiento = () => {


                    // ===============================
                    // BUSCAR PRODUCTO
                    // ===============================

                    db.get(
                        `
                SELECT *
                FROM productos
                WHERE codigo = ?
            `,
                        [codigoProducto],
                        (errorProducto, producto) => {

                            if (errorProducto) {

                                console.error(
                                    errorProducto
                                );

                                return res.status(500).json({
                                    mensaje:
                                        "Error al buscar el producto."
                                });

                            }

                            if (!producto) {

                                return res.status(404).json({
                                    mensaje:
                                        "Producto no encontrado."
                                });

                            }


                            // ===============================
                            // BUSCAR UBICACIÓN
                            // ===============================

                            db.get(
                                `
                        SELECT *
                        FROM ubicaciones
                        WHERE codigo = ?
                    `,
                                [ubicacion],
                                (
                                    errorUbicacion,
                                    datosUbicacion
                                ) => {

                                    if (errorUbicacion) {

                                        console.error(
                                            errorUbicacion
                                        );

                                        return res
                                            .status(500)
                                            .json({
                                                mensaje:
                                                    "Error al buscar la ubicación."
                                            });

                                    }

                                    if (!datosUbicacion) {

                                        return res
                                            .status(404)
                                            .json({
                                                mensaje:
                                                    "Ubicación no encontrada."
                                            });

                                    }


                                    // ===============================
                                    // PRODUCTO POR CANTIDAD
                                    // ===============================

                                    if (
                                        producto.tipo_control ===
                                        "CANTIDAD"
                                    ) {

                                        const cantidadNumerica =
                                            Number(cantidad);

                                        if (
                                            !cantidadNumerica ||
                                            cantidadNumerica <= 0
                                        ) {

                                            return res
                                                .status(400)
                                                .json({
                                                    mensaje:
                                                        "Debes indicar una cantidad válida."
                                                });

                                        }


                                        // ===============================
                                        // BUSCAR STOCK ACTUAL
                                        // ===============================

                                        db.get(
                                            `
                                    SELECT *
                                    FROM stock_cantidad
                                    WHERE producto_id = ?
                                    AND ubicacion_id = ?
                                `,
                                            [
                                                producto.id,
                                                datosUbicacion.id
                                            ],
                                            (
                                                errorStock,
                                                stock
                                            ) => {

                                                if (errorStock) {

                                                    console.error(
                                                        errorStock
                                                    );

                                                    return res
                                                        .status(500)
                                                        .json({
                                                            mensaje:
                                                                "Error al consultar el stock."
                                                        });

                                                }


                                                // ===============================
                                                // ENTRADA CANTIDAD
                                                // ===============================

                                                if (
                                                    tipoMovimiento ===
                                                    "ENTRADA"
                                                ) {

                                                    const guardarMovimiento =
                                                        () => {

                                                            db.run(
                                                                `
                                                        UPDATE ubicaciones
                                                        SET estado = 'Ocupada'
                                                        WHERE id = ?
                                                    `,
                                                                [
                                                                    datosUbicacion.id
                                                                ]
                                                            );

                                                            return res.json({
                                                                mensaje:
                                                                    "Entrada registrada correctamente."
                                                            });

                                                        };


                                                    if (stock) {

                                                        db.run(
                                                            `
                                                    UPDATE stock_cantidad
                                                    SET cantidad =
                                                        cantidad + ?
                                                    WHERE id = ?
                                                `,
                                                            [
                                                                cantidadNumerica,
                                                                stock.id
                                                            ],
                                                            function (
                                                                errorActualizar
                                                            ) {

                                                                if (
                                                                    errorActualizar
                                                                ) {

                                                                    console.error(
                                                                        errorActualizar
                                                                    );

                                                                    return res
                                                                        .status(500)
                                                                        .json({
                                                                            mensaje:
                                                                                "Error al actualizar el stock."
                                                                        });

                                                                }

                                                                guardarMovimiento();

                                                            }
                                                        );

                                                    } else {

                                                        db.run(
                                                            `
                                                    INSERT INTO stock_cantidad (
                                                        producto_id,
                                                        ubicacion_id,
                                                        cantidad
                                                    )
                                                    VALUES (?, ?, ?)
                                                `,
                                                            [
                                                                producto.id,
                                                                datosUbicacion.id,
                                                                cantidadNumerica
                                                            ],
                                                            function (
                                                                errorInsertar
                                                            ) {

                                                                if (
                                                                    errorInsertar
                                                                ) {

                                                                    console.error(
                                                                        errorInsertar
                                                                    );

                                                                    return res
                                                                        .status(500)
                                                                        .json({
                                                                            mensaje:
                                                                                "Error al crear el stock."
                                                                        });

                                                                }

                                                                guardarMovimiento();

                                                            }
                                                        );

                                                    }

                                                    return;

                                                }


                                                // ===============================
                                                // SALIDA CANTIDAD
                                                // ===============================

                                                if (!stock) {

                                                    return res
                                                        .status(400)
                                                        .json({
                                                            mensaje:
                                                                "El producto no tiene stock en esta ubicación."
                                                        });

                                                }

                                                if (
                                                    cantidadNumerica >
                                                    stock.cantidad
                                                ) {

                                                    return res
                                                        .status(400)
                                                        .json({
                                                            mensaje:
                                                                `Stock insuficiente. Disponible: ${stock.cantidad}.`
                                                        });

                                                }

                                                const nuevoStock =
                                                    stock.cantidad -
                                                    cantidadNumerica;


                                                const finalizarSalida =
                                                    () => {

                                                        db.run(
                                                            `
    INSERT INTO movimientos (
        tipo_movimiento,
        producto_id,
        ubicacion_id,
        cantidad,
        personal_id
    )
    VALUES (?, ?, ?, ?, ?)
    `,
                                                            [
                                                                "SALIDA",
                                                                producto.id,
                                                                datosUbicacion.id,
                                                                cantidadNumerica,
                                                                personalId
                                                            ]
                                                        );


                                                        // ===============================
                                                        // REVISAR SI LA UBICACIÓN
                                                        // SIGUE TENIENDO PRODUCTOS
                                                        // ===============================

                                                        db.get(
                                                            `
                                                    SELECT
                                                    (
                                                        SELECT COUNT(*)
                                                        FROM stock_cantidad
                                                        WHERE ubicacion_id = ?
                                                        AND cantidad > 0
                                                    )
                                                    +
                                                    (
                                                        SELECT COUNT(*)
                                                        FROM productos_seriados
                                                        WHERE ubicacion_id = ?
                                                    )
                                                    AS total
                                                `,
                                                            [
                                                                datosUbicacion.id,
                                                                datosUbicacion.id
                                                            ],
                                                            (
                                                                errorTotal,
                                                                resultado
                                                            ) => {

                                                                if (
                                                                    !errorTotal &&
                                                                    resultado &&
                                                                    resultado.total === 0
                                                                ) {

                                                                    db.run(
                                                                        `
                                                                UPDATE ubicaciones
                                                                SET estado = 'Disponible'
                                                                WHERE id = ?
                                                            `,
                                                                        [
                                                                            datosUbicacion.id
                                                                        ]
                                                                    );

                                                                }

                                                            }
                                                        );


                                                        return res.json({
                                                            mensaje:
                                                                "Salida registrada correctamente."
                                                        });

                                                    };


                                                if (nuevoStock === 0) {

                                                    db.run(
                                                        `
                                                DELETE FROM stock_cantidad
                                                WHERE id = ?
                                            `,
                                                        [stock.id],
                                                        function (
                                                            errorEliminar
                                                        ) {

                                                            if (
                                                                errorEliminar
                                                            ) {

                                                                console.error(
                                                                    errorEliminar
                                                                );

                                                                return res
                                                                    .status(500)
                                                                    .json({
                                                                        mensaje:
                                                                            "Error al actualizar el stock."
                                                                    });

                                                            }

                                                            finalizarSalida();

                                                        }
                                                    );

                                                } else {

                                                    db.run(
                                                        `
                                                UPDATE stock_cantidad
                                                SET cantidad = ?
                                                WHERE id = ?
                                            `,
                                                        [
                                                            nuevoStock,
                                                            stock.id
                                                        ],
                                                        function (
                                                            errorActualizar
                                                        ) {

                                                            if (
                                                                errorActualizar
                                                            ) {

                                                                console.error(
                                                                    errorActualizar
                                                                );

                                                                return res
                                                                    .status(500)
                                                                    .json({
                                                                        mensaje:
                                                                            "Error al actualizar el stock."
                                                                    });

                                                            }

                                                            finalizarSalida();

                                                        }
                                                    );

                                                }

                                            }
                                        );

                                        return;

                                    }


                                    // ===============================
                                    // PRODUCTO POR SERIE
                                    // ===============================

                                    if (
                                        producto.tipo_control ===
                                        "SERIE"
                                    ) {

                                        if (!numeroSerie) {

                                            return res
                                                .status(400)
                                                .json({
                                                    mensaje:
                                                        "Debes indicar el número de serie."
                                                });

                                        }


                                        db.get(
                                            `
                                    SELECT *
                                    FROM productos_seriados
                                    WHERE numero_serie = ?
                                `,
                                            [numeroSerie],
                                            (
                                                errorSerie,
                                                serie
                                            ) => {

                                                if (errorSerie) {

                                                    console.error(
                                                        errorSerie
                                                    );

                                                    return res
                                                        .status(500)
                                                        .json({
                                                            mensaje:
                                                                "Error al consultar el número de serie."
                                                        });

                                                }


                                                // ===============================
                                                // ENTRADA SERIE
                                                // ===============================

                                                if (
                                                    tipoMovimiento ===
                                                    "ENTRADA"
                                                ) {

                                                    if (
                                                        serie &&
                                                        serie.ubicacion_id
                                                    ) {

                                                        return res
                                                            .status(400)
                                                            .json({
                                                                mensaje:
                                                                    "Ese número de serie ya se encuentra en bodega."
                                                            });

                                                    }

                                                    const registrarEntradaSerie =
                                                        () => {

                                                            db.run(
                                                                `
                                                        INSERT INTO movimientos (
                                                            tipo_movimiento,
                                                            producto_id,
                                                            ubicacion_id,
                                                            numero_serie
                                                        )
                                                        VALUES (?, ?, ?, ?)
                                                    `,
                                                                [
                                                                    "ENTRADA",
                                                                    producto.id,
                                                                    datosUbicacion.id,
                                                                    numeroSerie
                                                                ]
                                                            );

                                                            db.run(
                                                                `
                                                        UPDATE ubicaciones
                                                        SET estado = 'Ocupada'
                                                        WHERE id = ?
                                                    `,
                                                                [
                                                                    datosUbicacion.id
                                                                ]
                                                            );

                                                            return res.json({
                                                                mensaje:
                                                                    "Entrada de serie registrada correctamente."
                                                            });

                                                        };


                                                    if (serie) {

                                                        if (
                                                            serie.producto_id !==
                                                            producto.id
                                                        ) {

                                                            return res
                                                                .status(400)
                                                                .json({
                                                                    mensaje:
                                                                        "Ese número de serie pertenece a otro producto."
                                                                });

                                                        }

                                                        db.run(
                                                            `
                                                    UPDATE productos_seriados
                                                    SET
                                                        ubicacion_id = ?,
                                                        estado = 'Disponible'
                                                    WHERE id = ?
                                                `,
                                                            [
                                                                datosUbicacion.id,
                                                                serie.id
                                                            ],
                                                            function (
                                                                errorActualizar
                                                            ) {

                                                                if (
                                                                    errorActualizar
                                                                ) {

                                                                    return res
                                                                        .status(500)
                                                                        .json({
                                                                            mensaje:
                                                                                "Error al ingresar la serie."
                                                                        });

                                                                }

                                                                registrarEntradaSerie();

                                                            }
                                                        );

                                                    } else {

                                                        db.run(
                                                            `
                                                    INSERT INTO productos_seriados (
                                                        producto_id,
                                                        numero_serie,
                                                        ubicacion_id,
                                                        estado
                                                    )
                                                    VALUES (?, ?, ?, 'Disponible')
                                                `,
                                                            [
                                                                producto.id,
                                                                numeroSerie,
                                                                datosUbicacion.id
                                                            ],
                                                            function (
                                                                errorInsertar
                                                            ) {

                                                                if (
                                                                    errorInsertar
                                                                ) {

                                                                    return res
                                                                        .status(500)
                                                                        .json({
                                                                            mensaje:
                                                                                "Error al registrar la serie."
                                                                        });

                                                                }

                                                                registrarEntradaSerie();

                                                            }
                                                        );

                                                    }

                                                    return;

                                                }


                                                // ===============================
                                                // SALIDA SERIE
                                                // ===============================

                                                if (!serie) {

                                                    return res
                                                        .status(404)
                                                        .json({
                                                            mensaje:
                                                                "Número de serie no encontrado."
                                                        });

                                                }

                                                if (
                                                    serie.producto_id !==
                                                    producto.id
                                                ) {

                                                    return res
                                                        .status(400)
                                                        .json({
                                                            mensaje:
                                                                "El número de serie no corresponde al producto indicado."
                                                        });

                                                }

                                                if (
                                                    serie.ubicacion_id !==
                                                    datosUbicacion.id
                                                ) {

                                                    return res
                                                        .status(400)
                                                        .json({
                                                            mensaje:
                                                                "Ese número de serie no se encuentra en la ubicación seleccionada."
                                                        });

                                                }


                                                db.run(
                                                    `
                                            UPDATE productos_seriados
                                            SET
                                                ubicacion_id = NULL,
                                                estado = 'SALIDA'
                                            WHERE id = ?
                                        `,
                                                    [serie.id],
                                                    function (
                                                        errorSalida
                                                    ) {

                                                        if (
                                                            errorSalida
                                                        ) {

                                                            return res
                                                                .status(500)
                                                                .json({
                                                                    mensaje:
                                                                        "Error al realizar la salida."
                                                                });

                                                        }


                                                        db.run(
                                                            `
    INSERT INTO movimientos (
        tipo_movimiento,
        producto_id,
        ubicacion_id,
        numero_serie,
        personal_id
    )
    VALUES (?, ?, ?, ?, ?)
    `,
                                                            [
                                                                "SALIDA",
                                                                producto.id,
                                                                datosUbicacion.id,
                                                                numeroSerie,
                                                                personalId
                                                            ]
                                                        );


                                                        db.get(
                                                            `
                                                    SELECT
                                                    (
                                                        SELECT COUNT(*)
                                                        FROM stock_cantidad
                                                        WHERE ubicacion_id = ?
                                                        AND cantidad > 0
                                                    )
                                                    +
                                                    (
                                                        SELECT COUNT(*)
                                                        FROM productos_seriados
                                                        WHERE ubicacion_id = ?
                                                    )
                                                    AS total
                                                `,
                                                            [
                                                                datosUbicacion.id,
                                                                datosUbicacion.id
                                                            ],
                                                            (
                                                                errorTotal,
                                                                resultado
                                                            ) => {

                                                                if (
                                                                    !errorTotal &&
                                                                    resultado &&
                                                                    resultado.total === 0
                                                                ) {

                                                                    db.run(
                                                                        `
                                                                UPDATE ubicaciones
                                                                SET estado = 'Disponible'
                                                                WHERE id = ?
                                                            `,
                                                                        [
                                                                            datosUbicacion.id
                                                                        ]
                                                                    );

                                                                }

                                                            }
                                                        );


                                                        return res.json({
                                                            mensaje:
                                                                "Salida de serie registrada correctamente."
                                                        });

                                                    }
                                                );

                                            }
                                        );

                                    }

                                }
                            );

                        }
                    );

                };

                // ===============================
                // VALIDAR PERSONA Y CONTINUAR
                // ===============================

                if (tipoMovimiento === "SALIDA") {

                    db.get(
                        `
                SELECT *
                FROM personal
                WHERE id = ?
                AND estado = 'ACTIVO'
                AND cargo IN ('TECNICO', 'ASISTENTE')
            `,
                        [personalId],
                        (errorPersonal, persona) => {

                            if (errorPersonal) {

                                console.error(
                                    "Error al validar personal:",
                                    errorPersonal
                                );

                                return res.status(500).json({
                                    mensaje:
                                        "Error al validar la persona seleccionada."
                                });
                            }

                            if (!persona) {

                                return res.status(400).json({
                                    mensaje:
                                        "La persona seleccionada no está activa o no es técnico/asistente."
                                });
                            }

                            continuarMovimiento();
                        }
                    );

                } else {

                    continuarMovimiento();
                }

            }
        );

        // ===============================
        // OBTENER HISTORIAL DE MOVIMIENTOS
        // ===============================

        app.get(
            "/api/movimientos",
            (req, res) => {

                db.all(
                    `
                SELECT
                    m.id,
                    m.tipo_movimiento,
                    p.codigo AS codigo_producto,
                    p.nombre AS nombre_producto,
                    u.codigo AS ubicacion,
                    ud.codigo AS ubicacion_destino,
                    m.cantidad,
                    m.numero_serie,
                    per.nombre AS entregado_a,
                    m.fecha_movimiento
                FROM movimientos m

                JOIN productos p
                    ON m.producto_id = p.id

                LEFT JOIN ubicaciones u
                    ON m.ubicacion_id = u.id
                
                LEFT JOIN personal per
                    ON m.personal_id = per.id

                LEFT JOIN ubicaciones ud
                    ON m.ubicacion_destino_id = ud.id

                ORDER BY
                    m.fecha_movimiento DESC,
                    m.id DESC
            `,
                    [],
                    (
                        error,
                        movimientos
                    ) => {

                        if (error) {

                            console.error(
                                "Error al obtener movimientos:",
                                error
                            );

                            return res
                                .status(500)
                                .json({
                                    mensaje:
                                        "Error al obtener el historial."
                                });

                        }

                        res.json(
                            movimientos
                        );

                    }
                );

            }
        );

        // ===============================
        // RUTA PRINCIPAL
        // ===============================

        app.get("/", (req, res) => {

            res.sendFile(
                path.join(
                    __dirname,
                    "public",
                    "index.html"
                )
            );

        });

        // ===============================
        // SERVIDOR
        // ===============================

        const notificacionesReady = require("./routes/notificaciones")(app, db);
        Promise.all([esquemaReady, authReady, notificacionesReady]).then(() => app.listen(PORT, () => {
            console.log(`Servidor funcionando en http://localhost:${PORT}`);
        })).catch(error => {
            console.error('No se pudo iniciar el servidor:', error.message);
            process.exitCode = 1;
            db.close();
        });