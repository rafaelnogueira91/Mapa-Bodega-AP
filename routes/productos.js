const express = require("express");

const router = express.Router();

// ===============================
// RECIBIR PRODUCTO
// ===============================

router.post("/", (req, res) => {

    const {
        codigo,
        nombre,
        descripcion,
        tipoControl,
        numeroSerie,
        cantidad,
        ubicacion
    } = req.body;

    res.json({
        mensaje: "Producto recibido correctamente.",
        producto: {
            codigo,
            nombre,
            descripcion,
            tipoControl,
            numeroSerie,
            cantidad,
            ubicacion
        }
    });

});

module.exports = router;