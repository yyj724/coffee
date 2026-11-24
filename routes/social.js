const express = require('express');
const pool = require('../db');
const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}
const clamp = (v) => Math.min(Math.max(parseInt(v) || 3, 1), 5);

// 따라 만들기: 조건을 복제해 내 비공개 초안으로 만들고 수정 화면으로 이동
router.post('/:id/fork', requireLogin, async (req, res) => {
  const uid = req.session.user.id;
  const [rows] = await pool.query('SELECT * FROM recipes WHERE id = ?', [req.params.id]);
  const r = rows[0];
  if (!r || !r.is_public || r.user_id === uid) return res.redirect('/recipes/' + req.params.id);

  const title = (r.title + ' (따라 만들기)').slice(0, 150);
  const [ins] = await pool.query(
    `INSERT INTO recipes (user_id, bean_id, method_id, title, dose_g, water_g, water_temp_c, grind_level,
       brew_time_sec, is_public, forked_from)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [uid, r.bean_id, r.method_id, title, r.dose_g, r.water_g, r.water_temp_c, r.grind_level, r.brew_time_sec, r.id]);
  res.redirect('/recipes/' + ins.insertId + '/edit');
});

// 재현 결과 남기기 (사용자당 한 번, 다시 보내면 수정)
router.post('/:id/trial', requireLogin, async (req, res) => {
  const uid = req.session.user.id;
  const [rows] = await pool.query('SELECT * FROM recipes WHERE id = ?', [req.params.id]);
  const r = rows[0];
  if (!r || !r.is_public || r.user_id === uid) return res.redirect('/recipes/' + req.params.id);

  const note = (req.body.note || '').trim().slice(0, 500) || null;
  await pool.query(
    `INSERT INTO trials (recipe_id, user_id, overall, sour, bitter, note) VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE overall = VALUES(overall), sour = VALUES(sour), bitter = VALUES(bitter),
       note = VALUES(note), created_at = NOW()`,
    [r.id, uid, clamp(req.body.overall), clamp(req.body.sour), clamp(req.body.bitter), note]);
  res.redirect('/recipes/' + r.id + '#trials');
});

router.post('/:id/trial/delete', requireLogin, async (req, res) => {
  await pool.query('DELETE FROM trials WHERE recipe_id = ? AND user_id = ?', [req.params.id, req.session.user.id]);
  res.redirect('/recipes/' + req.params.id + '#trials');
});

module.exports = router;
