// style-metrics.mjs — 발행 원고의 문체 지표를 우리 코퍼스에서 직접 잰다. 2026-08-24 신설.
//
// 왜 만들었나:
//   `.claude/skills/no-ai-tell/SKILL.md` 3-1절이 공백 em dash 27건을 등재하고
//   **"[미측정] 이게 많은지 모른다 — 한국어 사람 글의 기준 사용률을 우리가 잰 적이 없다.
//   숫자만 등재하고 판정하지 않는다. 기준선이 생기면 그때 다시 본다"** 로 닫아뒀다.
//   2026-08-24 solo-skills(MIT)의 humanize-korean 에서 KatFish 기반 지표 **정의**를 얻었다.
//
// ⚠️⚠️ 남의 기준선 숫자를 우리 원고에 대지 않는다.
//   KatFish baseline 장르는 **에세이·시·초록**뿐이고 `news`/`qa`/`blog` 는 `null` 이다.
//   우리 원고는 카드뉴스 슬라이드·스레드·릴스 캡션이라 **그 표에 없는 장르**다.
//   남의 장르 기준선에 우리 값을 대면 「신호를 믿으면 안 되는 자리」 ⑦(다른 것을 나란히 놓았다)이다.
//   → 그래서 이 스크립트는 **지표 정의만 빌려오고 기준선은 우리 코퍼스에서 만든다.**
//      baseline.json 자신도 그 경로를 적어뒀다: "사용자 코퍼스로 보강 시 source에 ,user-corpus-{date} 추가".
//
// ⚠️ 판정하지 않는다. 이 스크립트는 **측정만** 한다 — exit 0 고정.
//   임계값은 회차가 쌓여 우리 분포를 알게 된 뒤에 정한다. 지금 임계를 박으면 근거 없는 게이트가 된다.
//
// 표면을 섞지 않는다: 캐러셀 카드 / 릴스 캡션 / 스레드 본문·답글을 따로 잰다.
//   「feedback-ig-surface-terms」 — 표면마다 글의 성격이 다르다.
//
// 사용: node pipeline/publish/style-metrics.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDNEWS = path.resolve(HERE, '..', 'cardnews');

// ── 지표 정의 (출처: solo-skills/humanize-korean, MIT · KatFish Park et al. 기반) ──
// 연결어미 목록은 quick-rules.md C-11 그대로: -고/-며/-지만/-면서/-아서/-어서/-자/-는데
const CONNECTIVE = /(고|며|지만|면서|아서|어서|자|는데)/;
const CONNECTIVE_ALL = /[가-힣](고|며|지만|면서|아서|어서|자|는데)(?=[\s,]|$)/g;
const CONNECTIVE_COMMA = /[가-힣](고|며|지만|면서|아서|어서|자|는데),/g;

const CONCLUSION_PIVOT = ['결론적으로', '따라서', '이를 통해', '그러므로'];
const SAFE_BALANCE = ['양쪽 모두', '두 가지 모두', '장점도 있지만', '신중하게', '균형'];

// 8대 번역투 중 우리 no-ai-tell A등급 8번이 **덮지 않는** 항목만 본다.
// 이미 덮는 것(무생물 주어·~에 있어서·-들·당신)은 여기서 다시 세지 않는다.
const TRANSLATIONESE = {
  '이중 피동 (되어지다·여지다)': /(되어지|되어졌|여지는|여진다|잊혀지|보여지|쓰여지)/g,
  '~에 의해 피동': /에 의해/g,
  '대명사 직역 (그·그녀·그것·그들)': /(?:^|[\s"'(])(그녀|그것|그들)(?=[\s은는이가을를도의,.]|$)/g,
  '조사 이중결합 (~에서의·~으로의·~에의)': /(에서의|에로의|으로의|로의|에의|으로부터의)/g,
  'have·make 직역 (~을 가지다·가지고 있다)': /(을|를) (가지고 있|가진다|가지다|만든다)/g,
  '진행형 남발 (~고 있다)': /고 있(다|습니다|어요|었|는)/g,
  '한자어 명사화 (-성·-적·-화)': /[가-힣](성|적|화)(?=[\s은는이가을를의,.]|$)/g,
};

// ⚠️ 매니페스트마다 형이 다르다 — threadsText 가 문자열인 회차와 배열인 회차가 섞여 있다
//    (2026-08-24 실측에서 여기서 죽었다). 문자열로 평탄화하고 나서 잰다.
const flat = (v) => Array.isArray(v) ? v.map(flat).join('\n')
  : (typeof v === 'string' ? v : (v == null ? '' : String(v)));
const stripDeco = (s) => flat(s)
  .replace(/https?:\/\/\S+/g, ' ')      // URL 제외 (Do-NOT: 고유명사·주소)
  .replace(/[#@][^\s#@]+/g, ' ')        // 해시태그·멘션 제외
  .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ');  // 이모지 제외

const sentencesOf = (text) => stripDeco(text)
  .split(/(?<=[.!?])\s+|\n+/)
  .map((s) => s.trim())
  .filter((s) => s.length > 1);

const eojeolsOf = (s) => s.split(/\s+/).filter(Boolean);

function measure(label, docs) {
  // docs: [{name, text}]
  const allSent = [];
  let connTotal = 0, connComma = 0;
  const lex = { pivot: 0, balance: 0 };
  const trans = {};
  for (const k of Object.keys(TRANSLATIONESE)) trans[k] = 0;
  let chars = 0;

  for (const d of docs) {
    const t = stripDeco(d.text);
    chars += t.length;
    allSent.push(...sentencesOf(d.text));
    connTotal += (t.match(CONNECTIVE_ALL) || []).length;
    connComma += (t.match(CONNECTIVE_COMMA) || []).length;
    for (const w of CONCLUSION_PIVOT) lex.pivot += (t.split(w).length - 1);
    for (const w of SAFE_BALANCE) lex.balance += (t.split(w).length - 1);
    for (const [k, re] of Object.entries(TRANSLATIONESE)) {
      trans[k] += (t.match(re) || []).length;
    }
  }

  const n = allSent.length;
  const withComma = allSent.filter((s) => s.includes(',')).length;
  const lens = allSent.map((s) => eojeolsOf(s).length);
  const mean = lens.reduce((a, b) => a + b, 0) / (n || 1);
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / (n || 1));
  const commas = allSent.reduce((a, s) => a + (s.match(/,/g) || []).length, 0);

  return {
    label, docs: docs.length, sentences: n, chars,
    comma_inclusion_rate: n ? (withComma / n) * 100 : 0,      // C-12 정의
    comma_usage_rate: n ? commas / n : 0,                     // 문장당 쉼표 수
    ending_comma_rate: connTotal ? (connComma / connTotal) * 100 : 0,  // C-11 — ★ 분모 = 연결어미 총수(우리 정의)
    connective_total: connTotal, connective_comma: connComma,
    sent_len_mean: mean, sent_len_sd: sd,                     // E-1 (저쪽 임계 stdev 8)
    lex, trans,
  };
}

// ── 코퍼스 수집 ──
const surfaces = { '캐러셀 카드': [], '릴스 캡션': [], '스레드 본문': [], '스레드 답글': [] };

// 캐러셀: cardnews/<slug>.json (24회차). slides[].* 의 텍스트 필드를 모은다.
const skipCard = new Set(['slides.json', 'package.json', 'package-lock.json', 'reels-recipes.json', 'deck-roles.json']);
for (const f of readdirSync(CARDNEWS).filter((x) => x.endsWith('.json') && !skipCard.has(x))) {
  try {
    const j = JSON.parse(readFileSync(path.join(CARDNEWS, f), 'utf8'));
    const slides = j.slides || [];
    if (!slides.length) continue;
    const bits = [];
    for (const s of slides) {
      for (const [k, v] of Object.entries(s)) {
        if (typeof v === 'string' && !/^(type|id|slug|icon|image|color|palette)$/i.test(k)) bits.push(v);
        if (Array.isArray(v)) for (const x of v) if (typeof x === 'string') bits.push(x);
      }
    }
    if (bits.length) surfaces['캐러셀 카드'].push({ name: f, text: bits.join('\n') });
  } catch { /* 형식이 다른 파일은 건너뛴다 */ }
}

// 릴스·스레드: publish/post-*.json
for (const f of readdirSync(HERE).filter((x) => /^post-.*\.json$/.test(x))) {
  try {
    const j = JSON.parse(readFileSync(path.join(HERE, f), 'utf8'));
    if (j.caption) surfaces['릴스 캡션'].push({ name: f, text: j.caption });
    if (j.threadsText) surfaces['스레드 본문'].push({ name: f, text: j.threadsText });
    if (j.threadsTextOnly) surfaces['스레드 본문'].push({ name: f, text: j.threadsTextOnly });
    if (Array.isArray(j.threadsReplies) && j.threadsReplies.length) {
      surfaces['스레드 답글'].push({ name: f, text: j.threadsReplies.join('\n') });
    }
  } catch { /* skip */ }
}

// ── 출력 ──
console.log('발행 원고 문체 지표 — 우리 코퍼스 실측');
console.log('지표 정의 출처: solo-skills/humanize-korean (MIT) · KatFish(Park et al.) 기반');
console.log('⚠️ 남의 기준선(에세이·시·초록)과 대조하지 않는다 — 우리 장르가 그 표에 없다.\n');

const fmt = (x, d = 1) => x.toFixed(d);
const rows = [];
for (const [label, docs] of Object.entries(surfaces)) {
  if (!docs.length) { console.log(`${label}: 자료 0건 — 건너뜀\n`); continue; }
  const m = measure(label, docs);
  rows.push(m);
  console.log(`■ ${m.label}  (문서 ${m.docs}건 · 문장 ${m.sentences}개 · ${m.chars}자)`);
  console.log(`   쉼표 포함 문장률   ${fmt(m.comma_inclusion_rate)}%      문장당 쉼표 ${fmt(m.comma_usage_rate, 2)}개`);
  console.log(`   연결어미 뒤 쉼표   ${fmt(m.ending_comma_rate)}%   (${m.connective_comma}/${m.connective_total})  ← 저쪽 단일 최강 지표`);
  console.log(`   문장 길이(어절)    평균 ${fmt(m.sent_len_mean)} · 표준편차 ${fmt(m.sent_len_sd)}   ← 저쪽 임계 sd 8 미만=균일`);
  console.log(`   결산 피벗 4종      ${m.lex.pivot}회      안전 균형 5종 ${m.lex.balance}회`);
  const hits = Object.entries(m.trans).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  console.log(`   번역투(우리 목록 밖) ${hits.length ? hits.map(([k, v]) => `${k} ${v}`).join(' · ') : '0건'}`);
  console.log('');
}

// ── ★★ 문구 반복 — 저쪽이 「대행 티가 나는 1순위」로 지목한 축 ──
//
// 근거: solo-skills/threads-reply 절대규칙 1번. 2026-08-08에 답글 76건을 쓰면서
//       "감사합니다 ㅎㅎ"를 **7번** 썼고, 그게 대행 티의 1순위였다고 기록돼 있다.
// ⚠️ 우리가 이 축을 잰 적이 없다. 「독창성 경고 (2026-08-21)」 조사는 **영상 프레임**
//    유사도(5초 지점 88~95% 동일)만 봤고 **문구** 반복은 보지 않았다.
// ⚠️ CTA는 의도된 반복이다 — 「댓글 키워드 자동 DM」이 채택한 레이아웃이라 제외한다.
const CTA_EXEMPT = /(리틀리|litt\.ly|프로필 링크|댓글에|팔로우|저장|DM|링크는 프로필)/;

function repeats(docs, minLen = 8) {
  const seen = new Map();   // 문구 -> Set(문서명)
  for (const d of docs) {
    for (const line of stripDeco(d.text).split(/\n+/)) {
      const s = line.trim();
      if (s.length < minLen || CTA_EXEMPT.test(s)) continue;
      if (!seen.has(s)) seen.set(s, new Set());
      seen.get(s).add(d.name);
    }
  }
  return [...seen.entries()]
    .filter(([, set]) => set.size >= 2)
    .map(([s, set]) => ({ text: s, docs: set.size }))
    .sort((a, b) => b.docs - a.docs);
}

console.log('■ 문구 반복 (회차를 넘어 같은 줄이 재등장 · CTA 제외)');
let repTotal = 0;
for (const [label, docs] of Object.entries(surfaces)) {
  if (docs.length < 2) continue;
  const r = repeats(docs);
  repTotal += r.length;
  if (!r.length) { console.log(`   ${label}: 0건`); continue; }
  console.log(`   ${label}: ${r.length}건`);
  for (const x of r.slice(0, 6)) {
    console.log(`     ${x.docs}회차  "${x.text.slice(0, 58)}${x.text.length > 58 ? '…' : ''}"`);
  }
}
console.log('');

console.log('---');
console.log('★ 이 값들은 판정이 아니라 기준선이다. 회차가 쌓이면 우리 분포를 알게 되고,');
console.log('  그때 임계를 정한다. 지금 임계를 박으면 근거 없는 게이트가 된다.');
if (repTotal) {
  console.log(`⚠️ 문구 반복 ${repTotal}건 — CTA가 아닌데 회차를 넘어 같은 줄이 재등장한다.`);
}
process.exit(0);
