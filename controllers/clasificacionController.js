const db = require("../firebaseConfig");

exports.iniciarTemporada = async (req, res) => {
  try {

    // Comprobar si ya existe una temporada activa
    const ref = db.ref("clasificacion");
    const snapshot = await ref.once("value");

    if (snapshot.exists()) {
      const datos = snapshot.val();

      if (datos.estado === "activa") {
        return res.status(400).json({
          error: "Ya existe una temporada activa",
          temporada: datos.temporadaActual,
          inicio: datos.inicio,
          fin: datos.fin
        });
      }
    }

    // Determinar número de temporada
    let temporadaActual = 1;

    if (snapshot.exists() && snapshot.val().temporadaActual) {
      temporadaActual = Number(snapshot.val().temporadaActual) + 1;
    }

    // Fecha de inicio
    const inicio = new Date();

    // 25 días de duración
    const fin = new Date(
      inicio.getTime() + (25 * 24 * 60 * 60 * 1000)
    );

    await ref.set({
      temporadaActual,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
      duracionDias: 25,
      estado: "activa"
    });

    res.json({
      mensaje: "Temporada iniciada correctamente",
      temporada: temporadaActual,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
      duracionDias: 25
    });

  } catch (error) {

    console.error("ERROR AL INICIAR TEMPORADA:", error);

    res.status(500).json({
      error: error.message
    });
  }
};

exports.distribuirUsuariosTemporada = async (req, res) => {
  try {
    // Obtener la temporada actual
    const temporadaRef = db.ref("clasificacion");
    const temporadaSnapshot = await temporadaRef.once("value");

    if (!temporadaSnapshot.exists()) {
      return res.status(400).json({
        error: "No existe una temporada de clasificación"
      });
    }

    const temporada = temporadaSnapshot.val();

    if (temporada.estado !== "activa") {
      return res.status(400).json({
        error: "La temporada no está activa"
      });
    }

    const temporadaActual = Number(temporada.temporadaActual);

    // La distribución manual solo se permite para la temporada inicial
if (temporadaActual !== 1) {
  return res.status(400).json({
    error: "La distribución manual solo puede realizarse en la temporada inicial"
  });
}

    // Obtener usuarios
    const usuariosRef = db.ref("usuarios");
    const usuariosSnapshot = await usuariosRef.once("value");

    if (!usuariosSnapshot.exists()) {
      return res.status(404).json({
        error: "No existen usuarios registrados"
      });
    }

    const usuariosData = usuariosSnapshot.val();

    // Convertir usuarios en un arreglo
    const usuarios = Object.entries(usuariosData).map(([id, usuario]) => ({
      id,
      ...usuario
    }));

    // Ordenar por copas de mayor a menor
    usuarios.sort((a, b) => {
      const copasA = Number(a.copas || 0);
      const copasB = Number(b.copas || 0);

      return copasB - copasA;
    });

    const actualizaciones = {};

    let grupo = 1;
    let jugadoresEnGrupo = 0;

    for (const usuario of usuarios) {

      // Si el grupo actual ya tiene 20 jugadores,
      // comenzar uno nuevo
      if (jugadoresEnGrupo >= 20) {
        grupo++;
        jugadoresEnGrupo = 0;
      }

      const grupoFormato = String(grupo).padStart(3, "0");

      actualizaciones[`usuarios/${usuario.id}/rango`] = 1;

      actualizaciones[
        `usuarios/${usuario.id}/grupoClasificacion`
      ] = grupoFormato;

      actualizaciones[
        `usuarios/${usuario.id}/temporadaClasificacion`
      ] = temporadaActual;

      jugadoresEnGrupo++;
    }

    // Guardar todos los cambios de una sola vez
    await db.ref().update(actualizaciones);

    res.json({
      mensaje: "Usuarios distribuidos correctamente",
      temporada: temporadaActual,
      usuariosAsignados: usuarios.length,
      gruposCreados: grupo
    });

  } catch (error) {

    console.error(
      "ERROR AL DISTRIBUIR USUARIOS:",
      error
    );

    res.status(500).json({
      error: error.message
    });
  }
};

exports.obtenerClasificacionUsuario = async (req, res) => {
  try {
    const idUsuario = req.params.id;

    // Buscar usuario
    const usuarioRef = db.ref("usuarios/" + idUsuario);
    const usuarioSnapshot = await usuarioRef.once("value");

    if (!usuarioSnapshot.exists()) {
      return res.status(404).json({
        error: "Usuario no encontrado"
      });
    }

    const usuario = usuarioSnapshot.val();

    // Comprobar que tenga clasificación
    if (
      usuario.rango === undefined ||
      usuario.grupoClasificacion === undefined ||
      usuario.temporadaClasificacion === undefined
    ) {
      return res.status(400).json({
        error: "El usuario todavía no está asignado a una clasificación"
      });
    }

    const rangoUsuario = Number(usuario.rango);
    const grupoUsuario = usuario.grupoClasificacion;
    const temporadaUsuario = Number(usuario.temporadaClasificacion);

    // Obtener todos los usuarios
    const usuariosSnapshot = await db.ref("usuarios").once("value");

    if (!usuariosSnapshot.exists()) {
      return res.status(404).json({
        error: "No existen usuarios"
      });
    }

    const usuariosData = usuariosSnapshot.val();

    // Filtrar únicamente jugadores del mismo:
    // rango + grupo + temporada
    const jugadores = Object.entries(usuariosData)
      .filter(([id, jugador]) => {
        return (
          Number(jugador.rango) === rangoUsuario &&
          jugador.grupoClasificacion === grupoUsuario &&
          Number(jugador.temporadaClasificacion) === temporadaUsuario
        );
      })
      .map(([id, jugador]) => ({
      id,
      nombre: jugador.nombre,
      copas: Number(jugador.copas || 0),
      creado: jugador.creado
}));

    // Ordenar de mayor a menor cantidad de copas
   jugadores.sort((a, b) => {
  const copasA = Number(a.copas || 0);
  const copasB = Number(b.copas || 0);

  // 1. Más copas primero
  if (copasB !== copasA) {
    return copasB - copasA;
  }

  // 2. Si empatan, gana quien fue creado primero
  return new Date(a.creado) - new Date(b.creado);
});

    // Añadir posición y resultado
    const clasificacion = jugadores.map((jugador, index) => {

      const posicion = index + 1;

      let resultado = "permanece";

    const cantidadAscensos = Math.floor(jugadores.length * 0.25);
const cantidadDescensos = Math.floor(jugadores.length * 0.25);

if (
    rangoUsuario < 10 &&
    posicion <= cantidadAscensos
) {
    resultado = "ascenso";
} else if (
    rangoUsuario > 3 &&
    posicion > jugadores.length - cantidadDescensos
) {
    resultado = "descenso";
} else {
    resultado = "permanece";
}

      return {
        posicion,
        id: jugador.id,
        nombre: jugador.nombre,
        copas: jugador.copas,
        resultado
      };
    });

    // Buscar posición del usuario actual
    const posicionUsuario = clasificacion.findIndex(
      jugador => jugador.id === idUsuario
    ) + 1;

    // Calcular tiempo restante de temporada
    const temporadaRef = db.ref("clasificacion");
    const temporadaSnapshot = await temporadaRef.once("value");

    const temporada = temporadaSnapshot.val();

    let diasRestantes = 0;

    if (temporada && temporada.fin) {
      const ahora = new Date();
      const fechaFin = new Date(temporada.fin);

      const diferencia = fechaFin.getTime() - ahora.getTime();

      diasRestantes = Math.max(
        0,
        Math.ceil(diferencia / (1000 * 60 * 60 * 24))
      );
    }

    res.json({
      temporada: temporadaUsuario,
      rango: rangoUsuario,
      grupo: grupoUsuario,
      diasRestantes,
      posicionUsuario,
      jugadores: clasificacion
    });

  } catch (error) {

    console.error(
      "ERROR AL OBTENER CLASIFICACIÓN:",
      error
    );

    res.status(500).json({
      error: error.message
    });
  }
};

exports.simularCierreTemporada = async (req, res) => {
  try {

    // ========================================
    // DATOS FICTICIOS
    // ========================================

    const jugadores = [
      { id: "sim01", nombre: "Jugador 01", copas: 2500 },
      { id: "sim02", nombre: "Jugador 02", copas: 2400 },
      { id: "sim03", nombre: "Jugador 03", copas: 2300 },
      { id: "sim04", nombre: "Jugador 04", copas: 2200 },
      { id: "sim05", nombre: "Jugador 05", copas: 2100 },

      { id: "sim06", nombre: "Jugador 06", copas: 2000 },
      { id: "sim07", nombre: "Jugador 07", copas: 1950 },
      { id: "sim08", nombre: "Jugador 08", copas: 1900 },
      { id: "sim09", nombre: "Jugador 09", copas: 1850 },
      { id: "sim10", nombre: "Jugador 10", copas: 1800 },

      { id: "sim11", nombre: "Jugador 11", copas: 1750 },
      { id: "sim12", nombre: "Jugador 12", copas: 1700 },
      { id: "sim13", nombre: "Jugador 13", copas: 1650 },
      { id: "sim14", nombre: "Jugador 14", copas: 1600 },
      { id: "sim15", nombre: "Jugador 15", copas: 1550 },

      { id: "sim16", nombre: "Jugador 16", copas: 1500 },
      { id: "sim17", nombre: "Jugador 17", copas: 1450 },
      { id: "sim18", nombre: "Jugador 18", copas: 1400 },
      { id: "sim19", nombre: "Jugador 19", copas: 1350 },
      { id: "sim20", nombre: "Jugador 20", copas: 1300 }
    ];

    // ========================================
    // RANGO FICTICIO
    // ========================================

    const rangoActual = 5;
    const grupo = "001";

    // ========================================
    // ORDENAR POR COPAS
    // ========================================

    jugadores.sort((a, b) => b.copas - a.copas);

    // ========================================
    // DETERMINAR RESULTADO
    // ========================================

    const clasificacion = jugadores.map((jugador, index) => {

      const posicion = index + 1;

      let resultado = "permanece";
      let nuevoRango = rangoActual;

     const cantidadAscensos = Math.floor(jugadores.length * 0.25);
const cantidadDescensos = Math.floor(jugadores.length * 0.25);

if (posicion <= cantidadAscensos && rangoActual < 10) {
  resultado = "ascenso";
  nuevoRango = rangoActual + 1;

} else if (
  posicion > jugadores.length - cantidadDescensos &&
  rangoActual > 3
) {
  resultado = "descenso";
  nuevoRango = rangoActual - 1;

} else {
  resultado = "permanece";
  nuevoRango = rangoActual;
}

      

      return {
        posicion,
        id: jugador.id,
        nombre: jugador.nombre,
        copas: jugador.copas,
        resultado,
        nuevoRango
      };
    });

    // ========================================
    // RESUMEN
    // ========================================

    const ascendidos = clasificacion.filter(
      jugador => jugador.resultado === "ascenso"
    );

    const permanecen = clasificacion.filter(
      jugador => jugador.resultado === "permanece"
    );

    const descendidos = clasificacion.filter(
      jugador => jugador.resultado === "descenso"
    );

    // ========================================
    // RESPUESTA
    // ========================================

    res.json({
      simulacion: true,
      mensaje: "Simulación realizada. Firebase NO fue modificado.",
      rangoActual,
      grupo,
      totalJugadores: jugadores.length,

      resumen: {
        ascienden: ascendidos.length,
        permanecen: permanecen.length,
        descienden: descendidos.length
      },

      clasificacion
    });

  } catch (error) {

    console.error(
      "ERROR EN SIMULACIÓN:",
      error
    );

    res.status(500).json({
      error: error.message
    });
  }
};

exports.cerrarTemporada = async (req, res) => {
  try {
    // ========================================
    // 1. OBTENER TEMPORADA ACTUAL
    // ========================================

    const clasificacionRef = db.ref("clasificacion");
    const snapshot = await clasificacionRef.once("value");

    if (!snapshot.exists()) {
      return res.status(400).json({
        error: "No existe una temporada"
      });
    }

    const temporada = snapshot.val();

    if (temporada.estado !== "activa") {
      return res.status(400).json({
        error: "La temporada ya está cerrada"
      });
    }

    // ========================================
    // 2. COMPROBAR FECHA DE FINALIZACIÓN
    // ========================================

    const ahora = new Date();
    const fechaFin = new Date(temporada.fin);

    if (ahora < fechaFin) {
      return res.status(400).json({
        error: "La temporada todavía no ha terminado",
        fechaFin: temporada.fin
      });
    }

    // ========================================
    // 3. OBTENER USUARIOS
    // ========================================

    const usuariosSnapshot = await db
      .ref("usuarios")
      .once("value");

    if (!usuariosSnapshot.exists()) {
      return res.status(404).json({
        error: "No existen usuarios"
      });
    }

    const usuariosData = usuariosSnapshot.val();

    const usuarios = Object.entries(usuariosData)
      .map(([id, usuario]) => ({
        id,
        ...usuario
      }))
      .filter(usuario =>
        Number(usuario.temporadaClasificacion) ===
        Number(temporada.temporadaActual)
      );

    // ========================================
    // 4. AGRUPAR USUARIOS
    // ========================================

    const grupos = {};

    for (const usuario of usuarios) {

      const clave =
        `${usuario.rango}_${usuario.grupoClasificacion}`;

      if (!grupos[clave]) {
        grupos[clave] = [];
      }

      grupos[clave].push(usuario);
    }

    // ========================================
    // 5. CALCULAR ASCENSOS / DESCENSOS
    // ========================================

    const actualizaciones = {};

    let ascendidos = 0;
    let permanecen = 0;
    let descendidos = 0;

    for (const clave in grupos) {

      const jugadores = grupos[clave];

      const rangoActual = Number(jugadores[0].rango);

      // Ordenar por copas
      jugadores.sort((a, b) => {

        const copasA = Number(a.copas || 0);
        const copasB = Number(b.copas || 0);

        if (copasB !== copasA) {
          return copasB - copasA;
        }

        // Desempate por fecha de creación
        return new Date(a.creado) - new Date(b.creado);
      });

      jugadores.forEach((jugador, index) => {

        const posicion = index + 1;

        let nuevoRango = rangoActual;

        // ==============================
        // ASCENSO
        // ==============================

        if (
          posicion <= 5 &&
          rangoActual < 10
        ) {
          nuevoRango = rangoActual + 1;
          ascendidos++;
        }

        // ==============================
        // DESCENSO
        // ==============================

        else if (
          posicion >= 11 &&
          rangoActual > 3
        ) {
          nuevoRango = rangoActual - 1;
          descendidos++;
        }

        // ==============================
        // PERMANENCIA
        // ==============================

        else {
          permanecen++;
        }

        actualizaciones[
          `usuarios/${jugador.id}/rango`
        ] = nuevoRango;

        // El grupo anterior deja de existir
        actualizaciones[
          `usuarios/${jugador.id}/grupoClasificacion`
        ] = null;
      });
    }


    
    // ========================================
    // 6. MARCAR TEMPORADA COMO CERRADA
    // ========================================

    actualizaciones["clasificacion/estado"] = "cerrada";

    await db.ref().update(actualizaciones);

    res.json({
      mensaje: "Temporada cerrada correctamente",
      temporada: temporada.temporadaActual,
      ascendidos,
      permanecen,
      descendidos,
      jugadoresProcesados: usuarios.length
    });

  } catch (error) {

    console.error(
      "ERROR AL CERRAR TEMPORADA:",
      error
    );

    res.status(500).json({
      error: error.message
    });
  }
};

exports.simularCierreCompleto = async (req, res) => {
  try {
    const clasificacionSnapshot = await db.ref("clasificacion").once("value");

    if (!clasificacionSnapshot.exists()) {
      return res.status(400).json({
        error: "No existe una temporada de clasificación"
      });
    }

    const temporada = clasificacionSnapshot.val();
    const temporadaActual = Number(temporada.temporadaActual);

    const usuariosSnapshot = await db.ref("usuarios").once("value");

    if (!usuariosSnapshot.exists()) {
      return res.status(404).json({
        error: "No existen usuarios"
      });
    }

    const usuariosData = usuariosSnapshot.val();

    // Tomamos solamente los jugadores de la temporada actual
    const usuarios = Object.entries(usuariosData)
      .map(([id, usuario]) => ({
        id,
        ...usuario
      }))
      .filter(usuario =>
        Number(usuario.temporadaClasificacion) === temporadaActual &&
        usuario.grupoClasificacion !== null &&
        usuario.grupoClasificacion !== undefined
      );

    // Agrupar por rango + grupo
    const grupos = {};

    for (const usuario of usuarios) {
      const clave = `${usuario.rango}_${usuario.grupoClasificacion}`;

      if (!grupos[clave]) {
        grupos[clave] = [];
      }

      grupos[clave].push(usuario);
    }

    const resultadoGrupos = [];

    let totalAscendidos = 0;
    let totalPermanecen = 0;
    let totalDescendidos = 0;

    // Procesar cada grupo
    for (const clave in grupos) {
      const jugadores = grupos[clave];

      const rangoActual = Number(jugadores[0].rango);
      const grupoActual = jugadores[0].grupoClasificacion;

      // Ordenar por copas
      jugadores.sort((a, b) => {
        const copasA = Number(a.copas || 0);
        const copasB = Number(b.copas || 0);

        if (copasB !== copasA) {
          return copasB - copasA;
        }

        // Desempate: jugador creado primero
        return new Date(a.creado) - new Date(b.creado);
      });

      const jugadoresResultado = jugadores.map((jugador, index) => {
        const posicion = index + 1;

        let nuevoRango = rangoActual;
        let resultado = "permanece";

       const cantidadAscensos = Math.floor(jugadores.length * 0.25);
const cantidadDescensos = Math.floor(jugadores.length * 0.25);

if (posicion <= cantidadAscensos && rangoActual < 10) {
    nuevoRango = rangoActual + 1;
    resultado = "ascenso";
    totalAscendidos++;
} else if (
    posicion > jugadores.length - cantidadDescensos &&
    rangoActual > 3
) {
    nuevoRango = rangoActual - 1;
    resultado = "descenso";
    totalDescendidos++;
} else {
    nuevoRango = rangoActual;
    resultado = "permanece";
    totalPermanecen++;
}

        return {
          posicion,
          id: jugador.id,
          nombre: jugador.nombre,
          copas: Number(jugador.copas || 0),
          creado: jugador.creado,
          rangoActual,
          nuevoRango,
          resultado
        };
      });

      resultadoGrupos.push({
        grupo: grupoActual,
        rango: rangoActual,
        jugadores: jugadoresResultado
      });
    }

    // ==========================================
// JUGADORES NUEVOS
// ENTRAN A LA SIGUIENTE TEMPORADA
// ==========================================

const jugadoresNuevos = Object.entries(usuariosData)
  .map(([id, usuario]) => ({
    id,
    ...usuario
  }))
  .filter(usuario =>
    (usuario.temporadaClasificacion === null ||
      usuario.temporadaClasificacion === undefined) &&
    (usuario.grupoClasificacion === null ||
      usuario.grupoClasificacion === undefined)
  );

const jugadoresNuevosPreparados = jugadoresNuevos.map(usuario => ({
  id: usuario.id,
  nombre: usuario.nombre,
  copas: Number(usuario.copas || 0),
  creado: usuario.creado,
  rangoActual: null,
  nuevoRango: 1,
  resultado: "nuevo"
}));

// Todos los jugadores que existirían en la siguiente temporada
const jugadoresParaNuevaTemporada = [
  ...resultadoGrupos.flatMap(grupo => grupo.jugadores),
  ...jugadoresNuevosPreparados
];

// ==========================================
// REDISTRIBUIR NUEVA TEMPORADA
// MÁXIMO 20 POR GRUPO
// ==========================================

const nuevaDistribucion = {};

for (const jugador of jugadoresParaNuevaTemporada) {
  const rango = jugador.nuevoRango;

  if (!nuevaDistribucion[rango]) {
    nuevaDistribucion[rango] = [];
  }

  nuevaDistribucion[rango].push(jugador);
}

// Ordenar y separar en grupos de máximo 20
for (const rango in nuevaDistribucion) {
  const jugadores = nuevaDistribucion[rango];

  jugadores.sort((a, b) => {
    const copasA = Number(a.copas || 0);
    const copasB = Number(b.copas || 0);

    if (copasB !== copasA) {
      return copasB - copasA;
    }

    return new Date(a.creado) - new Date(b.creado);
  });

  const gruposNuevos = {};
  let numeroGrupo = 1;
  let jugadoresEnGrupo = 0;

  for (const jugador of jugadores) {
    if (jugadoresEnGrupo >= 20) {
      numeroGrupo++;
      jugadoresEnGrupo = 0;
    }

    const grupo = String(numeroGrupo).padStart(3, "0");

    if (!gruposNuevos[grupo]) {
      gruposNuevos[grupo] = [];
    }

    gruposNuevos[grupo].push(jugador);
    jugadoresEnGrupo++;
  }

  nuevaDistribucion[rango] = gruposNuevos;
}

    // La siguiente temporada sería la actual + 1
    const siguienteTemporada = temporadaActual + 1;

    res.json({
      simulacion: true,
      firebaseModificado: false,

      temporadaActual,
      siguienteTemporada,

      resumen: {
        jugadoresProcesados: usuarios.length,
        gruposProcesados: resultadoGrupos.length,
        ascendidos: totalAscendidos,
        permanecen: totalPermanecen,
        descendidos: totalDescendidos
      },

      grupos: resultadoGrupos,

      jugadoresNuevos: jugadoresNuevos.length,
      redistribucionNuevaTemporada: nuevaDistribucion
    });

  } catch (error) {
    console.error("ERROR EN SIMULACIÓN DE CIERRE COMPLETO:", error);

    res.status(500).json({
      error: error.message
    });
  }
  
};

exports.cerrarTemporadaCompleta = async (req, res) => {
  let tokenCierre = null;


  try {
    const clasificacionRef = db.ref("clasificacion");
    const clasificacionSnapshot = await clasificacionRef.once("value");

    if (!clasificacionSnapshot.exists()) {
      return res.status(400).json({
        error: "No existe una temporada de clasificación"
      });
    }

    const temporada = clasificacionSnapshot.val();
  
    // ==========================================
    // 1. VERIFICAR QUE LA TEMPORADA ESTÉ ACTIVA
    // ==========================================

    if (temporada.estado !== "activa") {
      return res.status(400).json({
        error: "La temporada ya está cerrada"
      });
    }

    // ==========================================
    // 2. VERIFICAR FECHA DE FINALIZACIÓN
    // ==========================================

    const ahora = new Date();
    const fechaFin = new Date(temporada.fin);

    if (ahora < fechaFin) {
      return res.status(400).json({
        error: "La temporada todavía no ha terminado",
        fechaFin: temporada.fin
      });
    }

    // ==========================================
// BLOQUEO PARA EVITAR DOBLE CIERRE
// ==========================================

tokenCierre =
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const bloqueoRef = db.ref("clasificacion/cierreEnProceso");

const resultadoBloqueo = await bloqueoRef.transaction((actual) => {
  if (actual && actual.estado === "en_proceso") {
    return;
  }

  return {
    estado: "en_proceso",
    token: tokenCierre,
    iniciadoEn: ahora.toISOString()
  };
});

if (!resultadoBloqueo.committed) {
  return res.status(409).json({
    error: "Ya hay un cierre de temporada en proceso"
  });
}

    const temporadaActual = Number(temporada.temporadaActual);
    const siguienteTemporada = temporadaActual + 1;

    // ==========================================
    // 3. OBTENER USUARIOS
    // ==========================================

    const usuariosSnapshot = await db.ref("usuarios").once("value");

    if (!usuariosSnapshot.exists()) {
      return res.status(404).json({
        error: "No existen usuarios"
      });
    }

    const usuariosData = usuariosSnapshot.val();

    // Solo jugadores pertenecientes a la temporada que termina
    const usuarios = Object.entries(usuariosData)
      .map(([id, usuario]) => ({
        id,
        ...usuario
      }))
      .filter(usuario =>
        Number(usuario.temporadaClasificacion) === temporadaActual &&
        usuario.grupoClasificacion !== null &&
        usuario.grupoClasificacion !== undefined
      );

    // ==========================================
    // 4. AGRUPAR JUGADORES POR RANGO + GRUPO
    // ==========================================

    const grupos = {};

    for (const usuario of usuarios) {
      const clave = `${usuario.rango}_${usuario.grupoClasificacion}`;

      if (!grupos[clave]) {
        grupos[clave] = [];
      }

      grupos[clave].push(usuario);
    }

    // ==========================================
    // 5. CALCULAR NUEVOS RANGOS
    // ==========================================

    const jugadoresProcesados = [];

    let ascendidos = 0;
    let permanecen = 0;
    let descendidos = 0;

    for (const clave in grupos) {
      const jugadores = grupos[clave];

      const rangoActual = Number(jugadores[0].rango);

      // Ordenar:
      // 1. Más copas primero
      // 2. Si empatan, gana quien fue creado primero
      jugadores.sort((a, b) => {
        const copasA = Number(a.copas || 0);
        const copasB = Number(b.copas || 0);

        if (copasB !== copasA) {
          return copasB - copasA;
        }

        return new Date(a.creado) - new Date(b.creado);
      });

      jugadores.forEach((jugador, index) => {
        const posicion = index + 1;

        let nuevoRango = rangoActual;
        let resultado = "permanece";

        // ==========================
        // ASCENSO
        // ==========================

        // ================================
// ASCENSO / PERMANENCIA / DESCENSO
// ================================

const cantidadAscensos = Math.floor(jugadores.length * 0.25);
const cantidadDescensos = Math.floor(jugadores.length * 0.25);

if (posicion <= cantidadAscensos && rangoActual < 10) {
    nuevoRango = rangoActual + 1;
    resultado = "ascenso";
    ascendidos++;
} else if (
    posicion > jugadores.length - cantidadDescensos &&
    rangoActual > 3
) {
    nuevoRango = rangoActual - 1;
    resultado = "descenso";
    descendidos++;
} else {
    nuevoRango = rangoActual;
    resultado = "permanece";
    permanecen++;
}

        jugadoresProcesados.push({
          ...jugador,
          posicion,
          rangoActual,
          nuevoRango,
          resultado
        });
      });
    }

    // ==========================================
// JUGADORES NUEVOS
// ENTRAN A LA SIGUIENTE TEMPORADA
// ==========================================

const jugadoresNuevos = Object.entries(usuariosData)
  .map(([id, usuario]) => ({
    id,
    ...usuario
  }))
  .filter(usuario =>
    (usuario.temporadaClasificacion === null ||
      usuario.temporadaClasificacion === undefined) &&
    (usuario.grupoClasificacion === null ||
      usuario.grupoClasificacion === undefined)
  );

const jugadoresNuevosPreparados = jugadoresNuevos.map(usuario => ({
  ...usuario,
  nuevoRango: 1,
  resultado: "nuevo"
}));

const jugadoresParaNuevaTemporada = [
  ...jugadoresProcesados,
  ...jugadoresNuevosPreparados
];

    // ==========================================
    // 6. AGRUPAR NUEVAMENTE POR NUEVO RANGO
    // ==========================================

    const jugadoresPorRango = {};

    for (const jugador of jugadoresParaNuevaTemporada) {
      const rango = jugador.nuevoRango;

      if (!jugadoresPorRango[rango]) {
        jugadoresPorRango[rango] = [];
      }

      jugadoresPorRango[rango].push(jugador);
    }

    // ==========================================
    // 7. ORDENAR Y CREAR NUEVOS GRUPOS
    //    MÁXIMO 20 JUGADORES
    // ==========================================

    const nuevaAsignacion = {};

    for (const rango in jugadoresPorRango) {
      const jugadores = jugadoresPorRango[rango];

      // Ordenamos nuevamente por copas
      jugadores.sort((a, b) => {
        const copasA = Number(a.copas || 0);
        const copasB = Number(b.copas || 0);

        if (copasB !== copasA) {
          return copasB - copasA;
        }

        return new Date(a.creado) - new Date(b.creado);
      });

      let numeroGrupo = 1;
      let jugadoresEnGrupo = 0;

      for (const jugador of jugadores) {

        // Máximo 20 jugadores por grupo
        if (jugadoresEnGrupo >= 20) {
          numeroGrupo++;
          jugadoresEnGrupo = 0;
        }

        const grupo = String(numeroGrupo).padStart(3, "0");

        nuevaAsignacion[jugador.id] = {
          rango: Number(rango),
          grupoClasificacion: grupo
        };

        jugadoresEnGrupo++;
      }
    }

    // ==========================================
    // 8. PREPARAR ACTUALIZACIONES
    // ==========================================

    const actualizaciones = {};

    for (const jugador of jugadoresParaNuevaTemporada) {
      const nueva = nuevaAsignacion[jugador.id];

      // Nuevo rango
      actualizaciones[
        `usuarios/${jugador.id}/rango`
      ] = nueva.rango;

      // Nuevo grupo
      actualizaciones[
        `usuarios/${jugador.id}/grupoClasificacion`
      ] = nueva.grupoClasificacion;

      // Nueva temporada
      actualizaciones[
        `usuarios/${jugador.id}/temporadaClasificacion`
      ] = siguienteTemporada;
    }

 // ==========================================
// 9. GUARDAR HISTORIAL DETALLADO
// ==========================================

const historialJugadores = {};

for (const jugador of jugadoresProcesados) {
  historialJugadores[jugador.id] = {
    nombre: jugador.nombre,

    rangoAnterior: jugador.rangoActual,

    rangoNuevo: jugador.nuevoRango,

    grupoAnterior: jugador.grupoClasificacion,

    posicion: jugador.posicion,

    copas: Number(jugador.copas || 0),

    resultado: jugador.resultado
  };
}

actualizaciones[
  `historialClasificacion/temporada_${temporadaActual}`
] = {
  temporada: temporadaActual,

  inicio: temporada.inicio,

  fin: temporada.fin,

  estado: "cerrada",

  jugadores: historialJugadores,

  resumen: {
    jugadoresProcesados: jugadoresProcesados.length,

    ascendidos,

    permanecen,

    descendidos
  }
};

    // ==========================================
    // 10. CREAR NUEVA TEMPORADA
    // ==========================================

    const nuevoInicio = ahora;
    const nuevoFin = new Date(
      nuevoInicio.getTime() +
      (25 * 24 * 60 * 60 * 1000)
    );

    actualizaciones["clasificacion/temporadaActual"] = siguienteTemporada;
    actualizaciones["clasificacion/inicio"] = nuevoInicio.toISOString();
    actualizaciones["clasificacion/fin"] = nuevoFin.toISOString();
    actualizaciones["clasificacion/duracionDias"] = 25;
    actualizaciones["clasificacion/estado"] = "activa";
    actualizaciones["clasificacion/cierreEnProceso"] = null;

    // ==========================================
    // 11. HACER TODAS LAS MODIFICACIONES JUNTAS
    // ==========================================

    await db.ref().update(actualizaciones);

    // ==========================================
    // 12. RESPUESTA
    // ==========================================

    res.json({
      mensaje: "Temporada cerrada y nueva temporada iniciada correctamente",

      temporadaCerrada: temporadaActual,

      nuevaTemporada: siguienteTemporada,

      inicioNuevaTemporada: nuevoInicio.toISOString(),

      finNuevaTemporada: nuevoFin.toISOString(),

      resumen: {
        jugadoresProcesados: jugadoresProcesados.length,
        ascendidos,
        permanecen,
        descendidos
      },

      firebaseModificado: true
    });

  } catch (error) {
  console.error(
    "ERROR AL CERRAR TEMPORADA COMPLETA:",
    error
  );

  // Liberar el bloqueo solamente si este proceso lo había adquirido
  if (tokenCierre) {
    const bloqueoRef = db.ref("clasificacion/cierreEnProceso");

    await bloqueoRef.transaction((actual) => {
      if (actual && actual.token === tokenCierre) {
        return null;
      }

      return;
    });
  }

  res.status(500).json({
    error: error.message
  });
}
};

exports.simularCierreYRedistribucion = async (req, res) => {
  try {
    // ==========================================
    // JUGADORES FICTICIOS
    // NO SE GUARDAN EN FIREBASE
    // ==========================================

    const jugadores = [];

    for (let i = 1; i <= 20; i++) {
      jugadores.push({
        id: `sim${String(i).padStart(2, "0")}`,
        nombre: `Jugador ${String(i).padStart(2, "0")}`,
        copas: 3000 - ((i - 1) * 100),
        creado: new Date(
          Date.UTC(2026, 0, i)
        ).toISOString(),

        rango: 5,
        grupoClasificacion: "001"
      });
    }

    const rangoActual = Number(req.query.rango || 5);

if (![1, 3, 5, 10].includes(rangoActual)) {
  return res.status(400).json({
    error: "Rango no válido. Usa 1, 3, 5 o 10."
  });
}

    // ==========================================
    // ORDENAR POR COPAS
    // ==========================================

    jugadores.sort((a, b) => {
      const copasA = Number(a.copas || 0);
      const copasB = Number(b.copas || 0);

      if (copasB !== copasA) {
        return copasB - copasA;
      }

      return new Date(a.creado) - new Date(b.creado);
    });

    // ==========================================
    // ASCENSOS / PERMANENCIAS / DESCENSOS
    // ==========================================

    const jugadoresProcesados = [];

    for (const [index, jugador] of jugadores.entries()) {
      const posicion = index + 1;

      let nuevoRango = rangoActual;
      let resultado = "permanece";

      const cantidadAscensos = Math.floor(jugadores.length * 0.25);
const cantidadDescensos = Math.floor(jugadores.length * 0.25);

if (posicion <= cantidadAscensos && rangoActual < 10) {
    nuevoRango = rangoActual + 1;
    resultado = "ascenso";
} else if (
    posicion > jugadores.length - cantidadDescensos &&
    rangoActual > 3
) {
    nuevoRango = rangoActual - 1;
    resultado = "descenso";
}

      jugadoresProcesados.push({
        id: jugador.id,
        nombre: jugador.nombre,
        copas: jugador.copas,
        posicion,
        rangoActual,
        nuevoRango,
        resultado,
        creado: jugador.creado
      });
    }

    // ==========================================
    // AGRUPAR POR NUEVO RANGO
    // ==========================================

    const jugadoresPorRango = {};

    for (const jugador of jugadoresProcesados) {
      const rango = jugador.nuevoRango;

      if (!jugadoresPorRango[rango]) {
        jugadoresPorRango[rango] = [];
      }

      jugadoresPorRango[rango].push(jugador);
    }

    // ==========================================
    // CREAR GRUPOS DE MÁXIMO 20
    // ==========================================

    const nuevaDistribucion = {};

    for (const rango in jugadoresPorRango) {
      const jugadoresDelRango = jugadoresPorRango[rango];

      jugadoresDelRango.sort((a, b) => {
        const copasA = Number(a.copas || 0);
        const copasB = Number(b.copas || 0);

        if (copasB !== copasA) {
          return copasB - copasA;
        }

        return new Date(a.creado) - new Date(b.creado);
      });

      let numeroGrupo = 1;
      let jugadoresEnGrupo = 0;

      for (const jugador of jugadoresDelRango) {

        if (jugadoresEnGrupo >= 20) {
          numeroGrupo++;
          jugadoresEnGrupo = 0;
        }

        const grupo = String(numeroGrupo).padStart(3, "0");

        if (!nuevaDistribucion[rango]) {
          nuevaDistribucion[rango] = {};
        }

        if (!nuevaDistribucion[rango][grupo]) {
          nuevaDistribucion[rango][grupo] = [];
        }

        nuevaDistribucion[rango][grupo].push({
          id: jugador.id,
          nombre: jugador.nombre,
          copas: jugador.copas
        });

        jugadoresEnGrupo++;
      }
    }

    // ==========================================
    // RESUMEN
    // ==========================================

    const resumenRangos = {};

    for (const rango in nuevaDistribucion) {
      resumenRangos[rango] = {};

      for (const grupo in nuevaDistribucion[rango]) {
        resumenRangos[rango][grupo] =
          nuevaDistribucion[rango][grupo].length;
      }
    }

    // ==========================================
    // RESPUESTA
    // ==========================================

    res.json({
      simulacion: true,
      firebaseModificado: false,

      temporadaSimulada: 1,
      siguienteTemporada: 2,

      rangoSimulado: rangoActual,
      grupoSimulado: "001",

      resumen: {
        jugadores: jugadoresProcesados.length,

        ascendidos: jugadoresProcesados.filter(
          j => j.resultado === "ascenso"
        ).length,

        permanecen: jugadoresProcesados.filter(
          j => j.resultado === "permanece"
        ).length,

        descendidos: jugadoresProcesados.filter(
          j => j.resultado === "descenso"
        ).length
      },

      clasificacionFinal: jugadoresProcesados,

      redistribucion: nuevaDistribucion,

      cantidadJugadoresPorGrupo: resumenRangos
    });

  } catch (error) {
    console.error(
      "ERROR EN SIMULACIÓN DE CIERRE Y REDISTRIBUCIÓN:",
      error
    );

    res.status(500).json({
      error: error.message
    });
  }
};