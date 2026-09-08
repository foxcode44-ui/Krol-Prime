const db = require("../firebaseConfig");

async function obtenerJugador(id) {
    const snapshot = await db.ref("usuarios/" + id).once("value");

    if (!snapshot.exists()) {
        return null;
    }

    return snapshot.val();
}

async function guardarJugador(id, datos) {
    await db.ref("usuarios/" + id).update(datos);
}

module.exports = {
    obtenerJugador,
    guardarJugador
};
