# Preparacion para publicar

Este paquete excluye bases de datos SQLite, respaldos y archivos subidos por usuarios, para evitar compartir datos privados.

**Atencion:** no se ha validado que el servidor arranque con una base de datos vacia. Antes de desplegar, preparar una migracion/esquema inicial y un almacenamiento persistente para SQLite y uploads, o migrar a una base de datos administrada. No subir la base de datos real a GitHub.

Para el APK conectado a internet, primero desplegar y proteger el servidor; luego configurar el cliente Android para usar la URL HTTPS del servidor. Este ZIP no contiene un APK.
