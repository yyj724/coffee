// 발표·테스트용 샘플 데이터 (데모 회원 4명, 레시피 8개, 재현 결과, 댓글, 좋아요)
const bcrypt = require('bcryptjs');
const pool = require('./db');
const brew = require('./lib/brew');

(async () => {
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM users WHERE username LIKE 'demo\\_%'");
  if (n > 0) { console.log('이미 샘플 데이터가 있어요. 먼저 지우고 싶다면 안내한 삭제 명령을 실행하세요.'); process.exit(0); }

  const hash = await bcrypt.hash('coffee1234', 10);
  const demo = [
    ['demo_sour', '산미덕후'], ['demo_drip', '드립러버'], ['demo_lab', '카페인연구원'], ['demo_newbie', '초보바리스타'],
  ];
  const u = {};
  for (const [username, nickname] of demo) {
    const [r] = await pool.query('INSERT INTO users (username, nickname, email, password_hash) VALUES (?, ?, ?, ?)',
      [username, nickname, username + '@example.com', hash]);
    u[username] = r.insertId;
  }

  const [beans] = await pool.query('SELECT id, name FROM beans');
  const [methods] = await pool.query('SELECT id, name FROM brew_methods');
  const bean = (k) => beans.find((b) => b.name.includes(k)).id;
  const method = (k) => methods.find((m) => m.name === k).id;

  async function addRecipe(r) {
    const ey = brew.extractionYield(r.tds, r.out, r.dose);
    const [res] = await pool.query(
      `INSERT INTO recipes (user_id, bean_id, method_id, title, dose_g, water_g, water_temp_c, grind_level, brew_time_sec,
         tds_pct, output_g, extraction_yield, sour, sweet, bitter, body, aroma, overall, note, is_public, forked_from)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [r.user, r.bean, r.method, r.title, r.dose, r.water, r.temp, r.grind, r.time, r.tds || null, r.out || null, ey,
       r.sour, r.sweet, r.bitter, r.body, r.aroma, r.overall, r.note || null, r.fork || null]);
    return res.insertId;
  }

  const r1 = await addRecipe({ user: u.demo_sour, bean: bean('예가체프'), method: method('핸드드립'),
    title: '산미가 또렷한 예가체프 핸드드립', dose: 15, water: 240, temp: 93, grind: 6, time: 150, tds: 1.20, out: 200,
    sour: 4, sweet: 3, bitter: 1, body: 2, aroma: 5, overall: 4,
    note: '뜸 30초 후 세 번에 나눠 부었어요. 꽃향이 좋은데 맛이 조금 얇아요.' });
  const r2 = await addRecipe({ user: u.demo_drip, bean: bean('예가체프'), method: method('핸드드립'),
    title: '달콤하게 균형 잡은 예가체프 (따라 만들기)', dose: 15, water: 255, temp: 94, grind: 5, time: 170, tds: 1.35, out: 210,
    sour: 3, sweet: 4, bitter: 2, body: 3, aroma: 5, overall: 5, fork: r1,
    note: '원본의 과소추출 진단을 보고 분쇄도를 6에서 5로 곱게, 온도를 1도 올리고 시간을 늘렸어요.' });
  const r3 = await addRecipe({ user: u.demo_lab, bean: bean('케냐'), method: method('에어로프레스'),
    title: '과일향 폭발 케냐 에어로프레스', dose: 14, water: 200, temp: 88, grind: 4, time: 120, tds: 1.50, out: 170,
    sour: 4, sweet: 4, bitter: 3, body: 3, aroma: 5, overall: 4, note: '뒤집어서 추출하고 2분 뒤에 눌렀어요.' });
  await addRecipe({ user: u.demo_drip, bean: bean('산토스'), method: method('프렌치프레스'),
    title: '고소하고 묵직한 브라질 프렌치프레스', dose: 30, water: 450, temp: 94, grind: 8, time: 240,
    sour: 2, sweet: 3, bitter: 3, body: 5, aroma: 3, overall: 4, note: '4분 우리고 윗거품을 걷어낸 뒤 눌렀어요.' });
  await addRecipe({ user: u.demo_sour, bean: bean('수프리모'), method: method('핸드드립'),
    title: '진하게 뽑은 콜롬비아 핸드드립 (실패 기록)', dose: 18, water: 250, temp: 96, grind: 3, time: 215, tds: 1.90, out: 225,
    sour: 1, sweet: 2, bitter: 5, body: 4, aroma: 2, overall: 2, note: '너무 쓰고 텁텁했어요. 분쇄도를 굵게 해서 다시 해 볼 예정이에요.' });
  await addRecipe({ user: u.demo_lab, bean: bean('안티구아'), method: method('핸드드립'),
    title: '아침용 깔끔한 과테말라 핸드드립', dose: 20, water: 320, temp: 92, grind: 5, time: 180, tds: 1.32, out: 280,
    sour: 3, sweet: 4, bitter: 2, body: 3, aroma: 4, overall: 4, note: '출근 전에 만들기 좋은 무난한 레시피예요.' });
  await addRecipe({ user: u.demo_drip, bean: bean('예가체프'), method: method('콜드브루'),
    title: '여름용 에티오피아 콜드브루', dose: 60, water: 600, temp: 4, grind: 8, time: 50400,
    sour: 2, sweet: 4, bitter: 1, body: 3, aroma: 4, overall: 5, note: '냉장고에서 14시간 우렸어요. 쓴맛이 거의 없어요.' });
  await addRecipe({ user: u.demo_sour, bean: bean('케냐'), method: method('핸드드립'),
    title: '케냐 AA 분할 추출 실험', dose: 16, water: 256, temp: 92, grind: 6, time: 165, tds: 1.28, out: 215,
    sour: 4, sweet: 3, bitter: 2, body: 3, aroma: 5, overall: 4, note: '물을 5번에 나눠 부어 봤어요.' });

  // 재현 결과 (레시피, 사용자, 종합, 산미, 쓴맛, 메모)
  const trials = [
    [r1, 'demo_drip', 4, 4, 2, '향이 정말 좋아요. 저는 조금 더 곱게 갈았어요.'],
    [r1, 'demo_lab', 3, 4, 1, '산미가 좀 강해서 취향은 아니었어요.'],
    [r2, 'demo_sour', 5, 3, 2, '확실히 균형이 좋아졌어요!'],
    [r2, 'demo_lab', 5, 3, 2, '단맛이 잘 올라와요.'],
    [r2, 'demo_newbie', 5, 4, 2, '처음 해 봤는데도 맛있게 나왔어요.'],
    [r3, 'demo_sour', 4, 4, 3, '과일향이 진해요.'],
  ];
  for (const [rid, uname, overall, sour, bitter, note] of trials) {
    await pool.query('INSERT INTO trials (recipe_id, user_id, overall, sour, bitter, note) VALUES (?, ?, ?, ?, ?, ?)',
      [rid, u[uname], overall, sour, bitter, note]);
  }

  // 댓글
  const comments = [
    [r1, 'demo_newbie', '온도를 몇 도로 했는지 궁금해요!'],
    [r1, 'demo_sour', '93도예요. 더 올리면 쓴맛이 늘어서 분쇄도를 먼저 바꿔 보세요.'],
    [r2, 'demo_drip', '따라 만들어 줘서 고마워요. 진단 덕분에 방향을 잡았어요.'],
    [r3, 'demo_newbie', '에어로프레스 처음인데 도전해 볼게요.'],
  ];
  for (const [rid, uname, content] of comments) {
    await pool.query('INSERT INTO comments (recipe_id, user_id, content) VALUES (?, ?, ?)', [rid, u[uname], content]);
  }

  // 좋아요
  const likes = [[r1, 'demo_drip'], [r1, 'demo_lab'], [r2, 'demo_sour'], [r2, 'demo_lab'], [r2, 'demo_newbie'], [r3, 'demo_drip']];
  for (const [rid, uname] of likes) {
    await pool.query('INSERT IGNORE INTO recipe_likes (recipe_id, user_id) VALUES (?, ?)', [rid, u[uname]]);
  }

  console.log('샘플 데이터를 넣었어요. 데모 계정 아이디: demo_sour, demo_drip, demo_lab, demo_newbie / 비밀번호: coffee1234');
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
