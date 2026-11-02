'use strict';

// Compara una entrega completa con el detalle persistido, sin confiar en el cliente.
module.exports = function compararDetalleEntrega(detalle, productos) {
  if (!Array.isArray(detalle) || !Array.isArray(productos) || !detalle.length || !productos.length) {
    return 'No existe un detalle válido para completar la entrega.';
  }
  const esperado = new Map();
  const recibido = new Map();
  const agregar = (mapa, id, cantidad) => {
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(cantidad) || cantidad <= 0) return false;
    const total = (mapa.get(id) || 0) + cantidad;
    if (!Number.isSafeInteger(total)) return false;
    mapa.set(id, total);
    return true;
  };
  for (const fila of detalle) {
    if (!fila || !agregar(esperado, Number(fila.producto_id), Number(fila.cantidad))) {
      return 'El detalle registrado contiene productos o cantidades incorrectos.';
    }
  }
  for (const item of productos) {
    if (!item || !agregar(recibido, Number(item.productoId), Number(item.cantidad))) {
      return 'La entrega contiene productos o cantidades incorrectos.';
    }
  }
  if (esperado.size !== recibido.size || [...esperado].some(([id, cantidad]) => recibido.get(id) !== cantidad)) {
    return 'La entrega debe coincidir con los productos y cantidades solicitados.';
  }
  return null;
};
