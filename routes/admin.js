const express = require('express');
const pool = require('../db');
const router = express.Router();

router.use((req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin')
    return res.status(403).send('관리자만 접근할 수 있어요.');
  next();
});

const back = (res, tab, msg, isErr) =>
  res.redirect('/admin?' + new URLSearchParams({ tab, msg, err: isErr ? '1' : '0' }).toString());
const num = (v) => (v === undefined || v === '' ? null : Number(v));

router.get('/', async (req, res) => {
  const [[counts]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM recipes) AS recipes,
            (SELECT COUNT(*) FROM comments) AS comments, (SELECT COUNT(*) FROM trials) AS trials,
            (SELECT COUNT(*) FROM cafes) AS cafes`);
  const [users] = await pool.query(
    `SELECT u.id, u.username, u.nickname, u.email, u.role, u.created_at,
            (SELECT COUNT(*) FROM recipes r WHERE r.user_id = u.id) AS recipe_count
     FROM users u ORDER BY u.id`);
  const [beans] = await pool.query(
    'SELECT b.*, (SELECT COUNT(*) FROM recipes r WHERE r.bean_id = b.id) AS used FROM beans b ORDER BY b.id');
  const [methods] = await pool.query(
    'SELECT m.*, (SELECT COUNT(*) FROM recipes r WHERE r.method_id = m.id) AS used FROM brew_methods m ORDER BY m.id');
  const [cafes] = await pool.query('SELECT id, name, city, country, opened_year, category FROM cafes ORDER BY id');
  res.render('admin/index', {
    title: '관리자', counts, users, beans, methods, cafes,
    tab: ['users', 'beans', 'methods', 'cafes'].includes(req.query.tab) ? req.query.tab : 'users',
    msg: req.query.msg || null, isErr: req.query.err === '1',
  });
});

// ───────── 회원 ─────────
router.post('/users/:id/role', async (req, res) => {
  const role = req.body.role;
  if (!['user', 'admin'].includes(role)) return back(res, 'users', '올바르지 않은 역할이에요.', true);
  if (Number(req.params.id) === req.session.user.id) return back(res, 'users', '내 권한은 바꿀 수 없어요.', true);
  await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
  back(res, 'users', '역할을 바꿨어요.');
});

// ───────── 원두 ─────────
router.post('/beans', async (req, res) => {
  const name = (req.body.name || '').trim();
  const origin = (req.body.origin || '').trim();
  const roast = req.body.roast_level;
  const proc = (req.body.process || '').trim() || null;
  if (!name || !origin || !['light', 'medium', 'dark'].includes(roast))
    return back(res, 'beans', '이름, 원산지, 로스팅 단계를 입력해 주세요.', true);
  await pool.query('INSERT INTO beans (name, origin, roast_level, process) VALUES (?, ?, ?, ?)', [name, origin, roast, proc]);
  back(res, 'beans', '원두를 추가했어요.');
});

router.post('/beans/:id/delete', async (req, res) => {
  try {
    await pool.query('DELETE FROM beans WHERE id = ?', [req.params.id]);
    back(res, 'beans', '원두를 삭제했어요.');
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2') return back(res, 'beans', '레시피에서 쓰고 있는 원두는 삭제할 수 없어요.', true);
    throw e;
  }
});

// ───────── 추출 방식 (진단 기준 범위) ─────────
function parseMethod(b) {
  const d = {
    ratio_min: num(b.ratio_min), ratio_max: num(b.ratio_max),
    temp_min: num(b.temp_min), temp_max: num(b.temp_max),
    time_min_sec: Math.round(num(b.time_min) * 60), time_max_sec: Math.round(num(b.time_max) * 60),
    tip: (b.tip || '').trim() || null,
  };
  let err = null;
  if (!(d.ratio_min > 0 && d.ratio_max > d.ratio_min)) err = '추출 비율은 최대가 최소보다 커야 해요.';
  else if ((d.temp_min === null) !== (d.temp_max === null)) err = '물 온도는 최소·최대를 함께 입력하거나 둘 다 비워 주세요.';
  else if (d.temp_min !== null && !(d.temp_min >= 0 && d.temp_max <= 100 && d.temp_max >= d.temp_min)) err = '물 온도 범위를 확인해 주세요.';
  else if (!(d.time_min_sec > 0 && d.time_max_sec >= d.time_min_sec)) err = '추출 시간 범위를 확인해 주세요.';
  return { d, err };
}

router.post('/methods', async (req, res) => {
  const name = (req.body.name || '').trim();
  const { d, err } = parseMethod(req.body);
  if (!name) return back(res, 'methods', '방식 이름을 입력해 주세요.', true);
  if (err) return back(res, 'methods', err, true);
  try {
    await pool.query(
      `INSERT INTO brew_methods (name, ratio_min, ratio_max, temp_min, temp_max, time_min_sec, time_max_sec, tip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, d.ratio_min, d.ratio_max, d.temp_min, d.temp_max, d.time_min_sec, d.time_max_sec, d.tip]);
    back(res, 'methods', '추출 방식을 추가했어요.');
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return back(res, 'methods', '이미 있는 추출 방식 이름이에요.', true);
    throw e;
  }
});

router.post('/methods/:id', async (req, res) => {
  const { d, err } = parseMethod(req.body);
  if (err) return back(res, 'methods', err, true);
  await pool.query(
    `UPDATE brew_methods SET ratio_min=?, ratio_max=?, temp_min=?, temp_max=?, time_min_sec=?, time_max_sec=?, tip=? WHERE id=?`,
    [d.ratio_min, d.ratio_max, d.temp_min, d.temp_max, d.time_min_sec, d.time_max_sec, d.tip, req.params.id]);
  back(res, 'methods', '기준 범위를 저장했어요. 진단 엔진에 바로 반영돼요.');
});

// ───────── 카페 (지도) ─────────
router.post('/cafes', async (req, res) => {
  const b = req.body;
  const name = (b.name || '').trim(), city = (b.city || '').trim(), country = (b.country || '').trim();
  const lat = num(b.lat), lng = num(b.lng), year = num(b.opened_year);
  const url = (b.source_url || '').trim();
  if (!name || !city || !country) return back(res, 'cafes', '이름, 도시, 나라를 입력해 주세요.', true);
  if (lat === null || lng === null || !(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180))
    return back(res, 'cafes', '위도(-90~90)와 경도(-180~180)를 확인해 주세요.', true);
  if (year !== null && !(year >= 1000 && year <= new Date().getFullYear())) return back(res, 'cafes', '개업 연도를 확인해 주세요.', true);
  if (url && !/^https?:\/\//.test(url)) return back(res, 'cafes', '출처 주소는 http:// 또는 https://로 시작해야 해요.', true);
  await pool.query(
    `INSERT INTO cafes (name, city, country, lat, lng, opened_year, category, signature, description, source_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, city, country, lat, lng, year, (b.category || '').trim() || null, (b.signature || '').trim() || null,
     (b.description || '').trim() || null, url || null]);
  back(res, 'cafes', '카페를 추가했어요. 지도에서 확인해 보세요.');
});

router.post('/cafes/:id/delete', async (req, res) => {
  await pool.query('DELETE FROM cafes WHERE id = ?', [req.params.id]);
  back(res, 'cafes', '카페를 삭제했어요.');
});

module.exports = router;
