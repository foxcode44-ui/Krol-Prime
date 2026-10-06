const db = require("../firebaseConfig");
const heroesDisponibles = require("../config/heroes");

exports.registro = async (req, res) => {
  
  try {
    const { nombre, correo, contraseña } = req.body;

    if (!nombre || !correo || !contraseña) {
      return res.status(400).send("Faltan datos");
    }

    const id = Date.now().toString();

    await db.ref("usuarios/" + id).set({
      nombre,
      correo,
      contraseña,
     monedas: 500,
      gemas: 100,
      copas: 0,

      // Clasificación
      rango: 1,
      grupoClasificacion: null,
      temporadaClasificacion: null,
      
      heroes: {
        guerrero_fuego: {
          desbloqueado: true,
          nivel: 1,
          experiencia: 0
        }
      },
      creado: new Date().toISOString()
    });
    console.log("RESPUESTA REGISTRO:", {
    mensaje: "Usuario registrado correctamente",
    id
    });
    res.send({
      mensaje: "Usuario registrado correctamente",
      id
    });

  } catch (error) {
    res.status(500).send(error.message);
  }
};

async function login(req, res) {
    console.log("LOGIN RECIBIDO");
    console.log("BODY LOGIN:", req.body);
    console.log("HEADERS LOGIN:", req.headers);

    try {
        const { correo, contraseña } = req.body;

        if (!correo || !contraseña) {
            return res.status(400).json({
                error: "Faltan datos"
            });
        }

        const snapshot = await db.ref("usuarios").once("value");
        const usuarios = snapshot.val();

        if (!usuarios) {
            return res.status(404).json({
                error: "No hay usuarios registrados"
            });
        }

        let usuarioEncontrado = null;
        let idUsuario = null;

        for (const id in usuarios) {
            const usuario = usuarios[id];

            if (
                usuario.correo === correo &&
                usuario.contraseña === contraseña
            ) {
                usuarioEncontrado = usuario;
                idUsuario = id;
                break;
            }
        }

        if (!usuarioEncontrado) {
            return res.status(401).json({
                error: "Correo o contraseña incorrectos"
            });
        }

        console.log("USUARIO ENCONTRADO:", usuarioEncontrado);
        console.log("ID USUARIO:", idUsuario);

        res.json({
            mensaje: "Inicio de sesión correcto",
            id: idUsuario,
            usuario: usuarioEncontrado
        });

    } catch (error) {
        console.error("ERROR LOGIN:", error);

        res.status(500).json({
            error: error.message
        });
    }
}

exports.login = login;

exports.obtenerUsuario = async (req, res) => {
    try {
        const id = req.params.id;

        if (!id) {
            return res.status(400).json({
                error: "Falta el ID del usuario"
            });
        }

        const snapshot = await db.ref("usuarios/" + id).once("value");

        if (!snapshot.exists()) {
            return res.status(404).json({
                error: "Usuario no encontrado"
            });
        }

        res.json({
            id: id,
            usuario: snapshot.val()
        });

    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
};

exports.obtenerHeroes = async (req, res) => {
  try {
    const id = req.params.id;

    const snapshot = await db.ref("usuarios/" + id + "/heroes").once("value");

    if (!snapshot.exists()) {
      return res.json({
        heroes: {}
      });
    }

    res.json({
      heroes: snapshot.val()
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};

exports.desbloquearHeroe = async (req, res) => {
  try {
    const id = req.params.id;
    const heroe = req.params.heroe;
    if (!heroesDisponibles[heroe]) {
    return res.status(400).json({
        error: "El héroe no existe"
    });
}

    const ref = db.ref("usuarios/" + id + "/heroes/" + heroe);

    const snapshot = await ref.once("value");

    if (snapshot.exists() && snapshot.val().desbloqueado === true) {
      return res.status(400).json({
        error: "El héroe ya está desbloqueado"
      });
    }

    await ref.set({
  desbloqueado: true,
  nivel: 1,
  experiencia: 0,
  vida: heroesDisponibles[heroe].vida,
  ataque: heroesDisponibles[heroe].ataque,
  defensa: heroesDisponibles[heroe].defensa,
  velocidad: heroesDisponibles[heroe].velocidad
})
    res.json({
      mensaje: "Héroe desbloqueado correctamente",
      heroe: heroe
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};

exports.agregarExperiencia = async (req, res) => {
  try {
    const id = req.params.id;
    const heroe = req.params.heroe;
    const cantidad = Number(req.body.cantidad);

    if (!cantidad || cantidad <= 0) {
      return res.status(400).json({
        error: "La cantidad de experiencia debe ser mayor que 0"
      });
    }

    const ref = db.ref("usuarios/" + id + "/heroes/" + heroe);

    const snapshot = await ref.once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({
        error: "El héroe no existe o no está desbloqueado"
      });
    }

    const datosHeroe = snapshot.val();

    if (datosHeroe.desbloqueado !== true) {
      return res.status(400).json({
        error: "El héroe no está desbloqueado"
      });
    }

    let nivel = datosHeroe.nivel || 1;
    let experiencia = datosHeroe.experiencia || 0;

    let vida = datosHeroe.vida;
    let ataque = datosHeroe.ataque;
    let defensa = datosHeroe.defensa;
    let velocidad = datosHeroe.velocidad;

    experiencia += cantidad;

    while (experiencia >= nivel * 100) {
      experiencia -= nivel * 100;
      nivel++;

      vida = Math.round(vida * 1.10);
      ataque = Math.round(ataque * 1.10);
      defensa = Math.round(defensa * 1.10);
      velocidad = Math.round(velocidad * 1.05);
    }

    await ref.update({
      nivel,
      experiencia,
      vida,
      ataque,
      defensa,
      velocidad
    });

    res.json({
      mensaje: "Experiencia agregada correctamente",
      heroe,
      nivel,
      experiencia,
      vida,
      ataque,
      defensa,
      velocidad
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};

exports.canjearQR = async (req, res) => {
  try {
    const id = req.params.id;
    const { codigo } = req.body;

    if (!codigo) {
      return res.status(400).json({
        error: "Falta el código QR"
      });
    }

    // Buscar el código QR
    const qrRef = db.ref("codigosQR/" + codigo);
    const qrSnapshot = await qrRef.once("value");

    if (!qrSnapshot.exists()) {
      return res.status(404).json({
        error: "Código QR no válido"
      });
    }

    const datosQR = qrSnapshot.val();

    // Comprobar si ya fue utilizado
    if (datosQR.usado === true) {
      return res.status(400).json({
        error: "Este código QR ya fue utilizado"
      });
    }

    // Comprobar que el usuario exista
    const usuarioRef = db.ref("usuarios/" + id);
    const usuarioSnapshot = await usuarioRef.once("value");

    if (!usuarioSnapshot.exists()) {
      return res.status(404).json({
        error: "Usuario no encontrado"
      });
    }

    const heroe = datosQR.heroe;

    // Comprobar si el héroe ya está desbloqueado
    const heroeRef = db.ref("usuarios/" + id + "/heroes/" + heroe);
    const heroeSnapshot = await heroeRef.once("value");

    if (heroeSnapshot.exists() && heroeSnapshot.val().desbloqueado === true) {
      return res.status(400).json({
        error: "El usuario ya tiene este héroe desbloqueado"
      });
    }

    // Obtener estadísticas base del héroe
    const estadisticas = heroesDisponibles[heroe];

    if (!estadisticas) {
      return res.status(400).json({
        error: "El héroe asociado al código no existe"
      });
    }

    // Desbloquear héroe
    await heroeRef.set({
      desbloqueado: true,
      nivel: 1,
      experiencia: 0,
      vida: estadisticas.vida,
      ataque: estadisticas.ataque,
      defensa: estadisticas.defensa,
      velocidad: estadisticas.velocidad
    });

    // Marcar QR como utilizado
    await qrRef.update({
      usado: true,
      usuario: id
    });

    res.json({
      mensaje: "Código QR canjeado correctamente",
      codigo,
      heroe
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};