/**
 * Email notifier using SMTP via nodemailer. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.
 * Falls back to console.log when not configured.
 */
let transporter = null;
try {
  const nodemailer = require('nodemailer');
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
} catch (e) {
  transporter = null;
}

async function sendEmail(to, subject, text, html) {
  if (!transporter) {
    console.log('[email] fallback:', to, subject, text);
    return { ok: false, logged: true };
  }
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  try {
    const info = await transporter.sendMail({ from, to, subject, text, html });
    return { ok: true, id: info.messageId };
  } catch (e) {
    console.error('email send failed', e);
    return { ok: false, error: String(e) };
  }
}

module.exports = { sendEmail };
