// server.js

const express = require("express");
const apn = require("node-apn");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── APNS Provider ─────────────────────────────────────────────────────────────

const provider = new apn.Provider({
  token: {
    key:    process.env.APNS_AUTH_KEY,
    keyId:  process.env.APNS_KEY_ID,
    teamId: process.env.APNS_TEAM_ID,
  },
  production: false,
});

const BUNDLE_ID = process.env.APNS_BUNDLE_ID;

// ── Token store ───────────────────────────────────────────────────────────────
const tokens = new Set();

// ── Routes ────────────────────────────────────────────────────────────────────

// iOS app registers its token here on every launch
app.post("/register", (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "token required" });
  tokens.add(token);
  console.log(`✅ Registered: ${token.slice(0, 10)}… (${tokens.size} total)`);
  res.json({ ok: true });
});

// Remove a specific device token
app.post("/unregister", (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "token required" });
  const existed = tokens.has(token);
  tokens.delete(token);
  console.log(`🗑️  Unregistered: ${token.slice(0, 10)}… (${tokens.size} remaining)`);
  res.json({ ok: true, existed });
});

// Dashboard calls this to fire a push
app.post("/send", async (req, res) => {
  const { token, title, body } = req.body;
  if (!token || !title) return res.status(400).json({ error: "token and title required" });

  const note  = new apn.Notification();
  note.topic  = BUNDLE_ID;
  note.expiry = Math.floor(Date.now() / 1000) + 3600;
  note.badge  = 1;
  note.sound  = "default";
  note.alert  = { title, body: body || "" };

  try {
    const result = await provider.send(note, token);
    if (result.failed.length > 0) {
      const reason = result.failed[0].response?.reason ?? "Unknown APNS error";
      if (["BadDeviceToken", "Unregistered"].includes(reason)) tokens.delete(token);
      return res.status(400).json({ error: reason });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard fetches this to populate the device dropdown
app.get("/tokens", (_req, res) => {
  res.json({ tokens: [...tokens] });
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server on :${PORT}`));
