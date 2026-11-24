const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../db');
const brew = require('../lib/brew');
const trustLib = require('../lib/trust');
const router = express.Router();

const PER_PAGE = 9;
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + EXT[file.mimetype]),
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!EXT[file.mimetype]) { req.uploadError = '이미지는 JPG, PNG, WEBP만 올릴 수 있어요.'; return cb(null, false); }
    cb(null, true);
  },
});
function handleUpload(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (err) req.uploadError = '이미지는 3MB 이하의 JPG, PNG, WEBP만 올릴 수 있어요.';
    next();
  });
}
function removeUpload(webPath) {
  if (!webPath || !webPath.startsWith('/uploads/')) return;
  fs.unlink(path.join(UPLOAD_DIR, path.basename(webPath)), () => {});
}

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}
const canEdit = (u, r) => u && (u.id === r.user_id || u.role === 'admin');
const canView = (u, r) => r.is_public || canEdit(u, r);

async function masters() {
  const [beans] = await pool.query('SELECT * FROM beans ORDER BY name');
  const [methods] = await pool.query('SELECT * FROM brew_methods ORDER BY id');
  return { beans, methods };
}
async function renderForm(res, recipe, error) {
  res.render('recipes/form', { title: recipe && recipe.id ? '레시피 수정' : '레시피 쓰기', recipe, error, ...(await masters()) });
}

// 입력값 검증과 변환
function parseForm(b) {
  const num = (v) => (v === undefined || v === '' ? null : Number(v));
  const scale = (k) => Math.min(Math.max(parseInt(b[k]) || 3, 1), 5);
  const d = {
    title: (b.title || '').trim(),
    bean_id: parseInt(b.bean_id),
    method_id: parseInt(b.method_id),
    dose_g: num(b.dose_g),
    water_g: num(b.water_g),
    water_temp_c: b.water_temp_c === undefined || b.water_temp_c === '' ? null : parseInt(b.water_temp_c),
    grind_level: parseInt(b.grind_level) || 5,
    brew_time_sec: (parseInt(b.brew_min) || 0) * 60 + (parseInt(b.brew_sec) || 0),
    tds_pct: num(b.tds_pct),
    output_g: num(b.output_g),
    sour: scale('sour'), sweet: scale('sweet'), bitter: scale('bitter'), body: scale('body'), aroma: scale('aroma'), overall: scale('overall'),
    note: (b.note || '').trim() || null,
    is_public: b.is_public ? 1 : 0,
  };
  let error = null;
  if (!d.title) error = '제목을 입력해 주세요.';
  else if (!d.bean_id || !d.method_id) error = '원두와 추출 방식을 선택해 주세요.';
  else if (!(d.dose_g > 0 && d.dose_g <= 100)) error = '원두량은 0보다 크고 100g 이하로 입력해 주세요.';
  else if (!(d.water_g > 0 && d.water_g <= 3000)) error = '물량은 0보다 크고 3000g 이하로 입력해 주세요.';
  else if (d.water_temp_c !== null && !(d.water_temp_c >= 0 && d.water_temp_c <= 100)) error = '물 온도는 0~100°C 사이로 입력해 주세요.';
  else if (d.grind_level < 1 || d.grind_level > 10) error = '분쇄도는 1~10 사이예요.';
  else if (!(d.brew_time_sec > 0 && d.brew_time_sec <= 172800)) error = '추출 시간을 입력해 주세요.';
  else if (d.tds_pct !== null && !(d.tds_pct > 0 && d.tds_pct <= 20)) error = 'TDS는 0보다 크고 20% 이하로 입력해 주세요.';
  else if (d.output_g !== null && !(d.output_g > 0 && d.output_g <= 3000)) error = '추출액 무게를 확인해 주세요.';
  d.extraction_yield = brew.extractionYield(d.tds_pct, d.output_g, d.dose_g);
  return { d, error };
}

// ───────── 목록 ─────────
router.get('/', async (req, res) => {
  const uid = req.session.user ? req.session.user.id : 0;
  const q = (req.query.q || '').trim();
  const method = parseInt(req.query.method) || '';
  const bean = parseInt(req.query.bean) || '';
  const sort = ['latest', 'popular', 'rating'].includes(req.query.sort) ? req.query.sort : 'latest';
  const page = Math.max(parseInt(req.query.page) || 1, 1);

  const where = ['(r.is_public = 1 OR r.user_id = ?)'];
  const params = [uid];
  if (q) { where.push('(r.title LIKE ? OR r.note LIKE ?)'); params.push('%' + q + '%', '%' + q + '%'); }
  if (method) { where.push('r.method_id = ?'); params.push(method); }
  if (bean) { where.push('r.bean_id = ?'); params.push(bean); }
  const w = where.join(' AND ');

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM recipes r WHERE ${w}`, params);
  const order = { latest: 'r.id DESC', popular: 'like_count DESC, r.id DESC', rating: 'r.overall DESC, r.id DESC' }[sort];
  const [recipes] = await pool.query(
    `SELECT r.id, r.title, r.dose_g, r.water_g, r.overall, r.image_path, r.is_public,
            u.nickname, b.name AS bean_name, m.name AS method_name,
            (SELECT COUNT(*) FROM recipe_likes l WHERE l.recipe_id = r.id) AS like_count
     FROM recipes r JOIN users u ON u.id = r.user_id JOIN beans b ON b.id = r.bean_id JOIN brew_methods m ON m.id = r.method_id
     WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, PER_PAGE, (page - 1) * PER_PAGE]);

  res.render('recipes/list', {
    title: '레시피', recipes, ...(await masters()),
    query: { q, method, bean, sort }, page, totalPages: Math.max(Math.ceil(total / PER_PAGE), 1), total,
  });
});

// ───────── 쓰기 ─────────
router.get('/new', requireLogin, async (req, res) => {
  // 추출 계산기에서 넘어오면 값을 미리 채워 줌
  const pre = Object.keys(req.query).length ? { ...req.query, is_public: 'on' } : null;
  renderForm(res, pre, null);
});

router.post('/', requireLogin, handleUpload, async (req, res) => {
  const { d, error } = parseForm(req.body);
  const err = req.uploadError || error;
  if (err) { if (req.file) removeUpload('/uploads/' + req.file.filename); return renderForm(res, { ...req.body }, err); }
  const img = req.file ? '/uploads/' + req.file.filename : null;
  const [r] = await pool.query(
    `INSERT INTO recipes (user_id, bean_id, method_id, title, dose_g, water_g, water_temp_c, grind_level, brew_time_sec,
       tds_pct, output_g, extraction_yield, sour, sweet, bitter, body, aroma, overall, note, image_path, is_public)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.session.user.id, d.bean_id, d.method_id, d.title, d.dose_g, d.water_g, d.water_temp_c, d.grind_level, d.brew_time_sec,
     d.tds_pct, d.output_g, d.extraction_yield, d.sour, d.sweet, d.bitter, d.body, d.aroma, d.overall, d.note, img, d.is_public]);
  res.redirect('/recipes/' + r.insertId);
});

// ───────── 상세 ─────────
router.get('/:id', async (req, res) => {
  const u = req.session.user;
  const [rows] = await pool.query(
    `SELECT r.*, u.nickname, b.name AS bean_name, b.origin AS bean_origin, b.roast_level,
            m.name AS method_name, m.ratio_min, m.ratio_max, m.temp_min, m.temp_max, m.time_min_sec, m.time_max_sec, m.tip,
            o.title AS origin_title
     FROM recipes r JOIN users u ON u.id = r.user_id JOIN beans b ON b.id = r.bean_id JOIN brew_methods m ON m.id = r.method_id
     LEFT JOIN recipes o ON o.id = r.forked_from
     WHERE r.id = ?`, [req.params.id]);
  const recipe = rows[0];
  if (!recipe || !canView(u, recipe)) return res.status(404).render('404', { title: '레시피를 찾을 수 없어요' });

  await pool.query('UPDATE recipes SET views = views + 1 WHERE id = ?', [recipe.id]);
  recipe.views += 1;

  const [comments] = await pool.query(
    `SELECT c.*, u.nickname FROM comments c JOIN users u ON u.id = c.user_id WHERE c.recipe_id = ? ORDER BY c.id`, [recipe.id]);
  const [[{ likeCount }]] = await pool.query('SELECT COUNT(*) AS likeCount FROM recipe_likes WHERE recipe_id = ?', [recipe.id]);
  let liked = false;
  if (u) {
    const [l] = await pool.query('SELECT 1 FROM recipe_likes WHERE recipe_id = ? AND user_id = ?', [recipe.id, u.id]);
    liked = l.length > 0;
  }
  const diag = brew.diagnose({ ...recipe, method: recipe });
  const [trials] = await pool.query(
    `SELECT t.*, u.nickname FROM trials t JOIN users u ON u.id = t.user_id WHERE t.recipe_id = ? ORDER BY t.id DESC`, [recipe.id]);
  const [children] = await pool.query(
    `SELECT r.id, r.title, u.nickname FROM recipes r JOIN users u ON u.id = r.user_id
     WHERE r.forked_from = ? AND r.is_public = 1 ORDER BY r.id DESC`, [recipe.id]);
  const myTrial = u ? (trials.find((t) => t.user_id === u.id) || null) : null;
  res.render('recipes/view', {
    title: recipe.title, recipe, comments, likeCount, liked, diag, fmtTime: brew.fmtTime, canEdit: canEdit(u, recipe),
    trust: trustLib.trust(recipe, trials), trials, children, myTrial,
  });
});

// ───────── 수정 ─────────
router.get('/:id/edit', requireLogin, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM recipes WHERE id = ?', [req.params.id]);
  const recipe = rows[0];
  if (!recipe) return res.status(404).render('404', { title: '레시피를 찾을 수 없어요' });
  if (!canEdit(req.session.user, recipe)) return res.status(403).send('수정 권한이 없어요.');
  renderForm(res, recipe, null);
});

router.post('/:id/edit', requireLogin, handleUpload, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM recipes WHERE id = ?', [req.params.id]);
  const old = rows[0];
  if (!old) return res.status(404).render('404', { title: '레시피를 찾을 수 없어요' });
  if (!canEdit(req.session.user, old)) return res.status(403).send('수정 권한이 없어요.');

  const { d, error } = parseForm(req.body);
  const err = req.uploadError || error;
  if (err) { if (req.file) removeUpload('/uploads/' + req.file.filename); return renderForm(res, { ...req.body, id: old.id, image_path: old.image_path }, err); }

  let img = old.image_path;
  if (req.file) { removeUpload(old.image_path); img = '/uploads/' + req.file.filename; }
  else if (req.body.remove_image) { removeUpload(old.image_path); img = null; }

  await pool.query(
    `UPDATE recipes SET bean_id=?, method_id=?, title=?, dose_g=?, water_g=?, water_temp_c=?, grind_level=?, brew_time_sec=?,
       tds_pct=?, output_g=?, extraction_yield=?, sour=?, sweet=?, bitter=?, body=?, aroma=?, overall=?, note=?, image_path=?, is_public=?
     WHERE id=?`,
    [d.bean_id, d.method_id, d.title, d.dose_g, d.water_g, d.water_temp_c, d.grind_level, d.brew_time_sec,
     d.tds_pct, d.output_g, d.extraction_yield, d.sour, d.sweet, d.bitter, d.body, d.aroma, d.overall, d.note, img, d.is_public, old.id]);
  res.redirect('/recipes/' + old.id);
});

// ───────── 삭제 ─────────
router.post('/:id/delete', requireLogin, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM recipes WHERE id = ?', [req.params.id]);
  const r = rows[0];
  if (!r) return res.redirect('/recipes');
  if (!canEdit(req.session.user, r)) return res.status(403).send('삭제 권한이 없어요.');
  removeUpload(r.image_path);
  await pool.query('DELETE FROM recipes WHERE id = ?', [r.id]);
  res.redirect('/recipes');
});

// ───────── 댓글 ─────────
router.post('/:id/comments', requireLogin, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM recipes WHERE id = ?', [req.params.id]);
  const r = rows[0];
  const content = (req.body.content || '').trim();
  if (r && canView(req.session.user, r) && content) {
    await pool.query('INSERT INTO comments (recipe_id, user_id, content) VALUES (?, ?, ?)', [r.id, req.session.user.id, content]);
  }
  res.redirect('/recipes/' + req.params.id + '#comments');
});

router.post('/:id/comments/:cid/delete', requireLogin, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM comments WHERE id = ? AND recipe_id = ?', [req.params.cid, req.params.id]);
  const c = rows[0];
  const u = req.session.user;
  if (c && (c.user_id === u.id || u.role === 'admin')) await pool.query('DELETE FROM comments WHERE id = ?', [c.id]);
  res.redirect('/recipes/' + req.params.id + '#comments');
});

// ───────── 좋아요 ─────────
router.post('/:id/like', requireLogin, async (req, res) => {
  const uid = req.session.user.id;
  const [exist] = await pool.query('SELECT 1 FROM recipe_likes WHERE recipe_id = ? AND user_id = ?', [req.params.id, uid]);
  if (exist.length) await pool.query('DELETE FROM recipe_likes WHERE recipe_id = ? AND user_id = ?', [req.params.id, uid]);
  else await pool.query('INSERT IGNORE INTO recipe_likes (recipe_id, user_id) VALUES (?, ?)', [req.params.id, uid]);
  res.redirect('/recipes/' + req.params.id);
});

module.exports = router;
