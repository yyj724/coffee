const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const router = express.Router();

router.get('/register', (req, res) => {
  res.render('register', { title: '회원가입', error: null, form: {} });
});

router.post('/register', async (req, res) => {
  const { username, nickname, email, password, password2 } = req.body;
  const form = { username, nickname, email };
  const fail = (msg) => res.render('register', { title: '회원가입', error: msg, form });

  if (!username || !nickname || !email || !password) return fail('모든 항목을 입력해 주세요.');
  if (!/^[a-zA-Z0-9_]{4,20}$/.test(username)) return fail('아이디는 영문, 숫자, 밑줄 4~20자로 만들어 주세요.');
  if (nickname.length < 2 || nickname.length > 20) return fail('닉네임은 2~20자로 입력해 주세요.');
  if (password.length < 6) return fail('비밀번호는 6자 이상이어야 해요.');
  if (password !== password2) return fail('비밀번호가 서로 달라요.');

  try {
    // 가장 먼저 가입한 사람은 관리자로 지정
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM users');
    const role = n === 0 ? 'admin' : 'user';
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (username, nickname, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [username, nickname, email, hash, role]);
    res.redirect('/login');
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return fail('이미 사용 중인 아이디 또는 이메일이에요.');
    throw e;
  }
});

router.get('/login', (req, res) => {
  res.render('login', { title: '로그인', error: null });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    return res.render('login', { title: '로그인', error: '아이디 또는 비밀번호가 올바르지 않아요.' });
  }
  req.session.user = { id: u.id, username: u.username, nickname: u.nickname, role: u.role };
  res.redirect('/');
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
