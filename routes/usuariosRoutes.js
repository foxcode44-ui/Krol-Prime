const express = require("express");
const router = express.Router();

const usuariosController = require("../controllers/usuariosController");

router.post("/registro", usuariosController.registro);
router.post("/login", usuariosController.login);
router.get("/usuario/:id", usuariosController.obtenerUsuario);
router.get("/usuario/:id/heroes", usuariosController.obtenerHeroes);
router.post("/usuario/:id/heroes/:heroe/desbloquear", usuariosController.desbloquearHeroe);
router.post("/prueba-ruta-post", (req, res) => {
  console.log("🔥 PRUEBA-RUTA-POST RECIBIDA");

  res.status(200).json({
    mensaje: "POST FUNCIONA",
    prueba: true
  });
});
router.post("/usuario/:id/canjear-qr", usuariosController.canjearQR);
router.post("/usuario/:id/heroes/:heroe/experiencia", usuariosController.agregarExperiencia);

router.post("/crear-qr-prueba", async (req, res) => {
  try {
    const db = require("../firebaseConfig");

    await db.ref("codigosQR/KP-TEST-001").set({
      heroe: "guerrero_agua",
      usado: false,
      usuario: null
    });

    res.json({
      mensaje: "Código QR de prueba creado correctamente",
      codigo: "KP-TEST-001"
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

module.exports = router;

