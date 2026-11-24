const express = require('express');
const pool = require('../db');
const brew = require('../lib/brew');
const router = express.Router();

async function getMethods() {
  const [m] = await pool.query('SELECT * FROM brew_methods ORDER BY id');
  return m;
}
const base = { title: '추출 계산기', fmtTime: brew.fmtTime, result: null, error: null, form: {}, prefillQuery: '' };

router.get('/', async (req, res) => {
  res.render('calculator', { ...base, methods: await getMethods() });
});

router.post('/', async (req, res) => {
  const b = req.body;
  const num = (v) => (v === undefined || v === '' ? null : Number(v));
  const scale = (k) => Math.min(Math.max(parseInt(b[k]) || 3, 1), 5);
  const f = {
    method_id: parseInt(b.method_id) || '',
    dose_g: num(b.dose_g), water_g: num(b.water_g),
    water_temp_c: b.water_temp_c === undefined || b.water_temp_c === '' ? null : parseInt(b.water_temp_c),
    brew_min: parseInt(b.brew_min) || 0, brew_sec: parseInt(b.brew_sec) || 0,
    tds_pct: num(b.tds_pct), output_g: num(b.output_g),
    sour: scale('sour'), bitter: scale('bitter'),
  };
  const time = f.brew_min * 60 + f.brew_sec;
  const methods = await getMethods();
  const method = methods.find((m) => m.id === f.method_id);

  let error = null;
  if (!method) error = '추출 방식을 선택해 주세요.';
  else if (!(f.dose_g > 0 && f.dose_g <= 100)) error = '원두량은 0보다 크고 100g 이하로 입력해 주세요.';
  else if (!(f.water_g > 0 && f.water_g <= 3000)) error = '물량은 0보다 크고 3000g 이하로 입력해 주세요.';
  else if (f.water_temp_c !== null && !(f.water_temp_c >= 0 && f.water_temp_c <= 100)) error = '물 온도는 0~100°C 사이로 입력해 주세요.';
  else if (!(time > 0 && time <= 172800)) error = '추출 시간을 입력해 주세요.';
  else if (f.tds_pct !== null && !(f.tds_pct > 0 && f.tds_pct <= 20)) error = 'TDS는 0보다 크고 20% 이하로 입력해 주세요.';
  else if (f.output_g !== null && !(f.output_g > 0 && f.output_g <= 3000)) error = '추출액 무게를 확인해 주세요.';
  if (error) return res.render('calculator', { ...base, methods, form: f, error });

  const ey = brew.extractionYield(f.tds_pct, f.output_g, f.dose_g);
  const diag = brew.diagnose({
    dose_g: f.dose_g, water_g: f.water_g, water_temp_c: f.water_temp_c, brew_time_sec: time,
    extraction_yield: ey, sour: f.sour, bitter: f.bitter, method,
  });

  // "이 값으로 레시피 쓰기" 링크용
  const q = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => { if (v !== null && v !== '') q.set(k, v); });

  res.render('calculator', { ...base, methods, form: f, result: diag, prefillQuery: q.toString() });
});

module.exports = router;
