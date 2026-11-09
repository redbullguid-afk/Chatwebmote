/**
 * Automated Backend Server for Web Chat & Boss Game (Node.js)
 * Handles:
 * 1. Weekly Boss Reset every Monday.
 * 2. Automatic unmuting of users when mutedUntil expires.
 * 3. Automatic deletion of expired OTP/reset requests after 15 days.
 */

const express = require('express');
const admin = require('firebase-admin');
const cron = require('node-cron');

const app = express();
app.use(express.json());

// Initialize Firebase Admin SDK using environment credentials or default config
// Ensure you set GOOGLE_APPLICATION_CREDENTIALS or provide databaseURL in production
admin.initializeApp({
  databaseURL: "https://webchat-4ad28-default-rtdb.firebaseio.com"
});

const db = admin.database();

// Health check endpoint for Render
app.get('/', (req, res) => {
  res.status(200).send('Web Chat Automation Server is running successfully!');
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
