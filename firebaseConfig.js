const admin = require("firebase-admin");

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
    serviceAccount = require("./krol-prime-8f534-firebase-adminsdk-fbsvc-2b9897bb17.json");
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://krol-prime-8f534-default-rtdb.firebaseio.com"
});

module.exports = admin.database();