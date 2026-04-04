/**
 * Push notifications via Firebase Cloud Messaging. Expects FIREBASE_SERVICE_ACCOUNT_JSON env containing
 * the service account JSON string. Falls back to console.log when not configured.
 */
let admin = null;
try {
  const firebaseAdmin = require('firebase-admin');
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    firebaseAdmin.initializeApp({ credential: firebaseAdmin.credential.cert(serviceAccount) });
    admin = firebaseAdmin;
  }
} catch (e) {
  admin = null;
}

async function sendPush(tokenOrTopic, payload) {
  if (!admin) {
    console.log('[fcm] fallback:', tokenOrTopic, payload);
    return { ok: false, logged: true };
  }
  try {
    const res = await admin.messaging().send({ token: tokenOrTopic, notification: payload });
    return { ok: true, id: res };
  } catch (e) {
    console.error('fcm send failed', e);
    return { ok: false, error: String(e) };
  }
}

module.exports = { sendPush };
