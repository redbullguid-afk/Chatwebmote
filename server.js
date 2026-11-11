/**
 * Automated Backend Server for Web Chat & Boss Game (Node.js)
 * Configured with EmailJS integration using:
 * Service ID: service_az8s2vo
 * Template ID: template_cb4xnwh
 */

const express = require('express');
const admin = require('firebase-admin');
const cron = require('node-cron');
const axios = require('axios');

const app = express();
app.use(express.json());

// Initialize Firebase Admin SDK
admin.initializeApp({
  databaseURL: "https://webchat-4ad28-default-rtdb.firebaseio.com"
});

const db = admin.database();

// Cấu hình thông tin EmailJS
const EMAILJS_CONFIG = {
  serviceId: "service_az8s2vo",
  templateId: "template_cb4xnwh",
  publicKey: "YOUR_PUBLIC_KEY" // Thay bằng Public Key của bạn nếu dùng REST API
};

// 1. Health check endpoint cho Render
app.get('/', (req, res) => {
  res.status(200).send('Web Chat Automation Server is running successfully with EmailJS config!');
});

// 2. API Endpoint: Gửi OTP trực tiếp qua EmailJS REST API từ Server
app.post('/api/send-otp', async (req, res) => {
  try {
    const { username, email, otpCode } = req.body;
    
    if (!username || !email || !otpCode) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin username, email hoặc otpCode!' });
    }

    // Payload chuẩn gửi đến EmailJS
    const emailData = {
      service_id: EMAILJS_CONFIG.serviceId,
      template_id: EMAILJS_CONFIG.templateId,
      user_id: EMAILJS_CONFIG.publicKey,
      template_params: {
        to_email: email,
        username: username,
        to_name: username,
        otp_code: otpCode,
        message: `Xin chào ${username} đây là mã otp của bạn:${otpCode} vui lòng không chia sẻ với bất kỳ ai và không gửi hoặc trả lời email này`
      }
    };

    const response = await axios.post('https://api.emailjs.com/api/v1.0/email/send', emailData, {
      headers: { 'Content-Type': 'application/json' }
    });

    res.status(200).json({ success: true, message: 'Gửi email OTP thành công qua EmailJS!', data: response.data });
  } catch (err) {
    console.error('[EMAILJS ERROR]:', err.response?.data || err.message);
    res.status(500).json({ success: false, message: 'Lỗi khi gửi email qua EmailJS', error: err.response?.data || err.message });
  }
});

// 3. CRON JOB 1: Reset Boss hàng tuần vào Thứ 2 lúc 00:00 (0 0 * * 1)
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

// 4. CRON JOB 2: Tự động mở khóa mõm User & dọn dẹp/khóa OTP quá hạn 5 phút (Chạy mỗi phút)
cron.schedule('* * * * *', async () => {
  const now = Date.now();
  try {
    // A. Tự động gỡ "Khóa Mõm" khi hết hạn
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

    // B. Kiểm tra mã OTP quá hạn 5 phút: Chuyển trạng thái thành "Đã khóa (Quá 5 phút)"
    const resetSnap = await db.ref('reset_requests').get();
    if (resetSnap.exists()) {
      const requests = resetSnap.val();
      for (const reqKey of Object.keys(requests)) {
        const r = requests[reqKey];
        if (r.expiresAt && now > r.expiresAt && r.status === 'Đang chờ xác minh') {
          await db.ref(`reset_requests/${reqKey}`).update({ status: 'Đã khóa (Quá 5 phút)' });
          console.log(`[CRON] Locked expired OTP request for: ${r.username}`);
        }
      }
    }
  } catch (err) {
    console.error('[CRON ERROR] Background maintenance failed:', err);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Automation server running on port ${PORT}`);
});
