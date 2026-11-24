// 레시피 재현 신뢰도 계산
const round1 = (x) => Math.round(x * 10) / 10;
const M = 3;   // 보정 강도: 재현 결과가 적을수록 중립 점수(3점)에 가깝게
const C = 3;   // 중립 점수

function trust(recipe, trials) {
  const n = trials.length;
  if (n === 0) return { n: 0, avg: null, score: null, match: null, grade: '검증 전' };

  const avg = trials.reduce((s, t) => s + t.overall, 0) / n;
  const score = (n * avg + M * C) / (n + M);           // 표본 수로 보정한 평균 평점

  // 맛 재현율: 원본의 산미·쓴맛 점수와 재현자가 느낀 점수가 얼마나 가까운가 (차이 0이면 100%)
  const diff = trials.reduce((s, t) =>
    s + (Math.abs(t.sour - recipe.sour) + Math.abs(t.bitter - recipe.bitter)) / 2, 0) / n;
  const match = Math.round((1 - diff / 4) * 100);

  let grade;
  if (n < 3) grade = '검증 중';
  else if (score >= 4) grade = '믿고 따라 할 만해요';
  else if (score >= 3) grade = '무난해요';
  else grade = '재현이 어려운 레시피';

  return { n, avg: round1(avg), score: round1(score), match, grade };
}

module.exports = { trust };
