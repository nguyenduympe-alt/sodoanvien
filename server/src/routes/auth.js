/** Đăng nhập & phiên người dùng */
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { signToken, requireAuth } = require('../auth');

const router = express.Router();

router.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Nhập tên đăng nhập và mật khẩu' });
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(String(username).trim());
  if (!u || !u.active || !bcrypt.compareSync(String(password), u.passwordHash)) {
    return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  }
  const token = signToken(u);
  res.json({
    token,
    user: { id: u.id, username: u.username, displayName: u.displayName, role: u.role, unitId: u.unitId, memberId: u.memberId },
  });
});

router.get('/auth/me', requireAuth(), (req, res) => res.json({ user: req.user }));

module.exports = { router };
