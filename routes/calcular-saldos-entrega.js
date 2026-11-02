'use strict';

// Calcula saldos sin modificar inventario. El llamador debe ejecutar los
// descuentos y la actualización del detalle en una misma transacción SQLite.
module.exports = function calcularSaldosEntrega(detalle, entrega) {
  if (!Array.isArray(detalle) || detalle.length === 0 || !Array.isArray(entrega) || entrega.length === 0) {
    return { error: 'El detalle y la entrega deben contener productos.' };
  }
  const pendiente = new Map();
  const entregado = new Map();
  const numero = value => Number.isSafeInteger(value) && value > 0;
  for (const fila of detalle) {
    if (!fila || !numero(fila.producto_id) || !numero(fila.cantidad)) return { error: 'Detalle solicitado inválido.' };
    const previo = pendiente.get(fila.producto_id) || 0;
    if (!Number.isSafeInteger(previo + fila.cantidad)) return { error: 'Cantidad solicitada fuera de rango.' };
    pendiente.set(fila.producto_id, previo + fila.cantidad);
  }
  for (const fila of entrega) {
    if (!fila || !numero(fila.productoId) || !numero(fila.cantidad)) return { error: 'Cantidad entregada inválida.' };
    if (!pendiente.has(fila.productoId)) return { error: 'El producto no pertenece al detalle pendiente.' };
    const previo = entregado.get(fila.productoId) || 0;
    if (!Number.isSafeInteger(previo + fila.cantidad)) return { error: 'Cantidad entregada fuera de rango.' };
    entregado.set(fila.productoId, previo + fila.cantidad);
    if (entregado.get(fila.productoId) > pendiente.get(fila.productoId)) return { error: 'La entrega supera la cantidad pendiente.' };
  }
  const saldos = [...pendiente].map(([productoId, cantidadPendiente]) => ({
    productoId,
    cantidadEntregada: entregado.get(productoId) || 0,
    saldoPendiente: cantidadPendiente - (entregado.get(productoId) || 0)
  }));
  return { saldos, completa: saldos.every(fila => fila.saldoPendiente === 0) };
};
