/**
 * Twilio WhatsApp helper. Uses TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 * If not configured, falls back to console.log for safety.
 */
let client = null;
try {
  const { Twilio } = require('twilio');
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) client = new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
} catch (e) {
  client = null;
}

async function sendWhatsApp(toUserIdOrPhone, message) {
  // toUserIdOrPhone: ideally phone number like 'whatsapp:+91XXXXXXXXXX' or mapped user id in DB
  const from = process.env.TWILIO_WHATSAPP_FROM; // e.g. 'whatsapp:+1415XXXX'
  if (!client || !from) {
    console.log('[twilio] sendWhatsApp fallback:', toUserIdOrPhone, message);
    return { ok: false, logged: true };
  }
  // assume caller passes a full whatsapp: number
  try {
    const res = await client.messages.create({ from, to: toUserIdOrPhone, body: message });
    return { ok: true, sid: res.sid };
  } catch (e) {
    console.error('twilio send failed', e);
    return { ok: false, error: String(e) };
  }
}

module.exports = { sendWhatsApp };
