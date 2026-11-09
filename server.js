/**
 * Automated Backend Server for Web Chat & Boss Game (Node.js)
 * Configured with EmailJS integration using:
 * Service ID: service_az8s2vo
 * Template ID: template_cb4xnwh
 */

const express = require('express');
const admin = require('firebase-admin');
const cron = require('node-cron');
const axios = require('axios'); // Dùng để gọi API gửi email qua EmailJS từ server nếu cần

const app = express();
app.use(express.json());

// Initialize Firebase Admin SDK
admin.initializeApp({
  databaseURL: "https://webchat-4ad28-default-rtdb.firebaseio.com"
});

const db = admin.database();

// Cấu hình thông tin EmailJS của bạn
const EMAILJS_CONFIG = {
  serviceId: "service_az8s2vo",
  templateId: "template_cb4xnwh",
  // Lưu ý: Để gửi từ server Node.js qua EmailJS REST API, bạn cần Public Key & Private Key (tuỳ chọn)
  // Hoặc bạn có thể gọi trực tiếp từ phía Client (Frontend) như đã hướng dẫn trước đó.
};

// Health check endpoint for Render
app.get('/', (req, res) => {
  res.status(200).send('Web Chat Automation Server is running successfully with EmailJS config!');
});

// API endpoint hỗ trợ gửi OTP trực tiếp từ Server qua EmailJS REST API
app.post('/api/send-otp', async (req, res) => {
  try {
    const { username, email, otpCode } = req.body;
    
    if (!username || !email || !otpCode) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin username, email hoặc otpCode!' });
    }

    // Payload chuẩn theo mẫu Template của EmailJS (bao gồm các biến username và message)
    const emailData = {
      service_id: EMAILJS_CONFIG.serviceId,
      template_id: EMAILJS_CONFIG.templateId,
      user_id: "YOUR_PUBLIC_KEY", // Thay bằng Public Key của bạn trên EmailJS
      template_params: {
        to_name: username,
        username: username,
        message: `Mã OTP xác nhận khôi phục tài khoản của bạn là: ${otpCode}. Có hiệu lực trong 15 ngày.`,
        otp_code: otpCode,
        to_email: email
      }
    };

    // Gọi API của EmailJS để gửi email tự động từ server
    const response = await axios.post('https://api.emailjs.com/api/v1.0/email/send', emailData, {
      headers: { 'Content-Type': 'application/json' }
    });

    res.status(200).json({ success: true, message: 'Gửi email OTP thành công qua EmailJS!', data: response.data });
  } catch (err) {
    console.error('[EMAILJS ERROR]:', err.response?.data || err.message);
    res.status(500).json({ success: false, message: 'Lỗi khi gửi email qua EmailJS', error: err.response?.data || err.message });
  }
});

// CRON JOB 1: Reset Boss every Monday at 00:00 (0 0 * * 1)
cron.schedule('0 0 * * 1', async () => {
  try {
    console.log('[CRON] Executing weekly Boss reset...');
    const bossRef = db.ref('boss_game');
    const snap = await bossRef.get();
    
    if (snap.exists()) {
      const currentBoss = snap.val();
      await bossRef.update({
        currentHp: currentBoss.maxHp || 1000000,
        scoreRed: 0,
        scoreBlue: 0,
        lastResetAt: Date.now()
      });
      console.log('[CRON] Boss successfully reset for the new week.');
    }
  } catch (err) {
    console.error('[CRON ERROR] Failed to reset Boss:', err);
  }
});

// CRON JOB 2: Auto unmute users and cleanup expired OTP requests every hour
cron.schedule('0 * * * *', async () => {
  const now = Date.now();
  try {
    console.log('[CRON] Checking user mutes and expired OTPs...');

    // 1. Unmute expired mutes
    const usersSnap = await db.ref('users').get();
    if (usersSnap.exists()) {
      const users = usersSnap.val();
      for (const username of Object.keys(users)) {
        const u = users[username];
        if (u.mutedUntil && u.mutedUntil <= now) {
          await db.ref(`users/${username}`).update({ mutedUntil: 0 });
          console.log(`[CRON] Unmuted user: ${username}`);
        }
      }
    }

    // 2. Delete OTP requests older than 15 days or expired
    const resetSnap = await db.ref('reset_requests').get();
    if (resetSnap.exists()) {
      const requests = resetSnap.val();
      for (const reqKey of Object.keys(requests)) {
        const r = requests[reqKey];
        if (r.expiresAt && now > r.expiresAt) {
          await db.ref(`reset_requests/${reqKey}`).remove();
          console.log(`[CRON] Removed expired OTP request for: ${r.username}`);
        }
      }
    }
  } catch (err) {
    console.error('[CRON ERROR] Failed background maintenance:', err);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Automation server running on port ${PORT}`);
});
