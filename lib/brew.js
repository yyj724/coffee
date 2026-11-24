// 추출 계산·진단 로직 (참고용 기준)
const EY_MIN = 18;   // 추출 수율 참고 범위(%)
const EY_MAX = 22;

const toNum = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const round1 = (x) => Math.round(x * 10) / 10;

// 추출 비율: 물 ÷ 원두 (1:N 의 N)
function ratio(dose, water) {
  return round1(Number(water) / Number(dose));
}

// 추출 수율(%) = TDS(%) × 추출액(g) ÷ 원두(g)
function extractionYield(tds, outputG, dose) {
  if (!tds || !outputG || !dose) return null;
  return round1((Number(tds) * Number(outputG)) / Number(dose));
}

function fmtTime(sec) {
  sec = Number(sec);
  if (sec >= 3600) return Math.floor(sec / 3600) + '시간 ' + Math.round((sec % 3600) / 60) + '분';
  return Math.floor(sec / 60) + '분 ' + (sec % 60) + '초';
}

function inRange(v, min, max) {
  return v < min ? 'below' : v > max ? 'above' : 'ok';
}

// 진단: 맛 점수 + 추출 수율 + 방식별 기준 범위를 종합
function diagnose(r) {
  const m = r.method;
  const ratioVal = ratio(r.dose_g, r.water_g);
  const ey = toNum(r.extraction_yield);
  const temp = toNum(r.water_temp_c);
  const time = Number(r.brew_time_sec);

  // 1) 기준 범위 점검
  const checks = [];
  const rMin = Number(m.ratio_min), rMax = Number(m.ratio_max);
  checks.push({ label: '추출 비율', value: '1:' + ratioVal, range: `1:${rMin} ~ 1:${rMax}`, state: inRange(ratioVal, rMin, rMax) });
  if (temp !== null && m.temp_min !== null) {
    checks.push({ label: '물 온도', value: temp + '°C', range: `${m.temp_min} ~ ${m.temp_max}°C`, state: inRange(temp, Number(m.temp_min), Number(m.temp_max)) });
  }
  checks.push({ label: '추출 시간', value: fmtTime(time), range: `${fmtTime(m.time_min_sec)} ~ ${fmtTime(m.time_max_sec)}`, state: inRange(time, Number(m.time_min_sec), Number(m.time_max_sec)) });
  if (ey !== null) {
    checks.push({ label: '추출 수율', value: ey + '%', range: `${EY_MIN} ~ ${EY_MAX}%`, state: inRange(ey, EY_MIN, EY_MAX) });
  }

  // 2) 과소·과다 추출 신호 수집
  const signals = [];
  const diff = Number(r.sour) - Number(r.bitter);
  if (diff >= 2) signals.push({ dir: 'under', why: '산미가 쓴맛보다 확실히 강해요.' });
  else if (diff <= -2) signals.push({ dir: 'over', why: '쓴맛이 산미보다 확실히 강해요.' });
  if (ey !== null) {
    if (ey < EY_MIN) signals.push({ dir: 'under', why: `추출 수율 ${ey}%가 참고 범위(${EY_MIN}%)보다 낮아요.` });
    else if (ey > EY_MAX) signals.push({ dir: 'over', why: `추출 수율 ${ey}%가 참고 범위(${EY_MAX}%)보다 높아요.` });
  }
  const under = signals.filter((s) => s.dir === 'under').length;
  const over = signals.filter((s) => s.dir === 'over').length;

  let status = 'balanced';
  if (under && over) status = 'mixed';
  else if (under) status = 'under';
  else if (over) status = 'over';

  // 3) 제안
  const tips = [];
  if (status === 'under') {
    tips.push('분쇄도를 1~2단계 더 곱게 갈아 보세요.');
    if (temp === null || temp < Number(m.temp_max)) tips.push('물 온도를 2~3°C 올려 보세요.');
    tips.push('추출 시간을 조금 늘리거나 뜸 들이기를 충분히 해 보세요.');
  } else if (status === 'over') {
    tips.push('분쇄도를 1~2단계 더 굵게 갈아 보세요.');
    if (temp === null || temp > Number(m.temp_min)) tips.push('물 온도를 2~3°C 낮춰 보세요.');
    tips.push('추출 시간을 조금 줄여 보세요.');
  } else if (status === 'mixed') {
    tips.push('맛 점수와 수율이 서로 다른 방향을 가리켜요. TDS와 추출액 무게를 다시 측정해 보세요.');
    tips.push('같은 레시피로 한 번 더 추출해 맛 점수를 다시 기록해 보세요.');
  } else {
    tips.push('균형이 잘 맞아요. 한 번에 한 가지 변수만 바꿔서 비교해 보세요.');
  }
  checks.forEach((c) => {
    if (c.label === '추출 비율' && c.state !== 'ok') tips.push(`비율이 방식별 참고 범위(${c.range})를 ${c.state === 'below' ? '진하게' : '묽게'} 벗어났어요.`);
    if (c.label === '추출 시간' && c.state !== 'ok') tips.push(`추출 시간이 방식별 참고 범위(${c.range})를 벗어났어요.`);
  });

  const meta = {
    under: { label: '과소추출 가능성', icon: 'bi-droplet-half' },
    over: { label: '과다추출 가능성', icon: 'bi-fire' },
    mixed: { label: '신호가 엇갈려요', icon: 'bi-question-circle' },
    balanced: { label: '균형 잡힌 추출', icon: 'bi-check-circle' },
  }[status];

  return { status, label: meta.label, icon: meta.icon, reasons: signals.map((s) => s.why), tips, checks, ratio: ratioVal, ey };
}

module.exports = { ratio, extractionYield, diagnose, fmtTime, EY_MIN, EY_MAX };
