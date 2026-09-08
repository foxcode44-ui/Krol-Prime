const express = require("express");
const cors = require("cors");

const db = require("./firebaseConfig");

const usuariosController = require("./controllers/usuariosController");
const usuariosRoutes = require("./routes/usuariosRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/", usuariosRoutes);
console.log("USUARIOS ROUTES CARGADAS");

console.log("Rutas de usuarios cargadas");

app.get("/", (req, res) => {
  res.send("Servidor conectado con Firebase");
});

app.get("/test", async (req, res) => {
  try {
    await db.ref("prueba/conexion").set({
      mensaje: "Conexión exitosa",
      fecha: new Date().toISOString()
    });

    res.send("Realtime Database funciona correctamente");
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.post("/guardarJugador", async (req, res) => {
  try {
    const { id, nombre, nivel, copas, monedas, gemas } = req.body;

    await db.ref("usuarios/" + id).update({
      nombre,
      nivel,
      copas,
      monedas,
      gemas
    });

    res.json({ mensaje: "Jugador guardado correctamente" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/usuario/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const snapshot = await db.ref("usuarios/" + id).once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({
        error: "Usuario no encontrado"
      });
    }

    const usuario = snapshot.val();

    res.json({
      nombre: usuario.nombre,
      correo: usuario.correo,
      monedas: usuario.monedas,
      copas: usuario.copas,
      heroes: {
  guerrero_fuego: {
    desbloqueado: true,
    nivel: 1,
    experiencia: 0
  }
},
      creado: usuario.creado
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.post("/sumarMonedas", async (req, res) => {
  try {
    const { id, cantidad } = req.body;

    if (!id || cantidad == null) {
      return res.status(400).json({
        error: "Faltan datos"
      });
    }

    const ref = db.ref("usuarios/" + id);

    const snapshot = await ref.once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({
        error: "Usuario no encontrado"
      });
    }

    const usuario = snapshot.val();

    const nuevasMonedas = usuario.monedas + Number(cantidad);

    await ref.update({
      monedas: nuevasMonedas
    });

    res.json({
      mensaje: "Monedas agregadas",
      monedas: nuevasMonedas
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor iniciado en el puerto ${PORT}`);
});