// check-ai-label.mjs — 게시물 AI 라벨(is_ai_generated) 실물 확인 (읽기 전용, 발행 없음)
//
// 사용법:
//   node check-ai-label.mjs                 # 최근 25건 전량
//   node check-ai-label.mjs --reels         # 릴스만 — 라벨 의무가 걸리는 표면
//   node check-ai-label.mjs <media_id>      # 한 건만 (발행 직후 확인용)
//
// ★ 이 스크립트가 필요한 이유 — 릴스 라벨은 코드가 켤 수 없다.
// 우리 릴스는 API 발행이 아니다: 렌더 → 드라이브 → **폰 앱 수동 업로드**다.
// 그래서 AI 라벨도 앱의 `Add AI label` 토글로 켜게 되는데, 사람 손으로 켠 것은
// 영수증이 없다 — 켰다고 생각했는데 안 켜져 있어도 아무 신호가 없다.
// `is_ai_generated`는 **발행 경로와 무관하게 읽기 필드로 제공**된다
// (2026-08-07 실측: 폰 업로드 릴스 포함 22건 전량이 값을 반환. 필드 누락 아님).
//
// ⛔⛔ **2026-08-24 정정 — *"API가 폰 토글의 유일한 검증 수단이다"*는 틀렸다. 반례가 나왔다.**
//   2026-08-14 19:37 KST 릴스(`leadmagnet-2`, edge-tts 음성 포함):
//     · **앱 화면에는 「AI 콘텐츠」 라벨이 표시된다** (사용자 확인 + 스크린샷)
//     · **API 는 `is_ai_generated = false`** — 목록 조회 · 개별 조회 · 단일 필드 조회 **3경로 모두 일치**
//     · `ai_info` · `is_ai_edited` 같은 다른 필드는 **존재하지 않는다**("nonexisting field")
//   대조로 8/17 · 8/19 · 8/21 은 같은 경로에서 `true` 다 → **필드가 항상 틀리는 게 아니라 어긋날 때가 있다.**
//   원인 미확정 `[미검증]` — 사후 토글인지 · 라벨 종류가 다른지 · 필드 갱신이 누락되는지 구분 못 했다.
//
// ▶ **그래서 이 지표는 한 방향으로만 신뢰한다:**
//     `true`  → 라벨이 켜져 있다 (반례 없음)
//     `false` → **모른다.** 「꺼짐」이 아니다. 앱에서 눈으로 봐야 한다
//   ⚠️ 그래서 아래 출력에서 false 를 *"off"* 로 찍지 않는다 — 거짓 음성을 만든 표기였다.
//
// ⚠️ 라벨 의무 대상: 메타 공식이 "A reel narrated with a realistic AI-generated voiceover"를
//    라벨 의무 예시로 명시 열거한다. `edge-tts` 같은 Neural TTS 내레이션이 여기 걸린다.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './env.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const IG_BASE = 'https://graph.instagram.com/v23.0';

const env = loadEnv(HERE);

async function api(url, params) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u);
  return { ok: res.ok, json: await res.json() };
}

// 세 상태를 구분한다 — 값 true / 값 false / 필드 자체가 없음.
// ⚠️ **false 를 「꺼짐」으로 찍지 않는다** (2026-08-24 반례: 앱엔 라벨이 있는데 API 는 false).
//    false 는 「API가 켜졌다고 말하지 않는다」까지만 뜻한다. 판정은 앱 화면이다.
function labelState(m) {
  if (!Object.prototype.hasOwnProperty.call(m, 'is_ai_generated')) return { icon: '❓', text: '응답에 필드 없음' };
  return m.is_ai_generated
    ? { icon: '✅', text: 'API=true (켜져 있다)' }
    : { icon: '❔', text: 'API=false (앱에서 확인 필요)' };
}

const token = env.IG_ACCESS_TOKEN;
if (!token) { console.error('.env에 IG_ACCESS_TOKEN 없음'); process.exit(1); }

const argv = process.argv.slice(2);
const reelsOnly = argv.includes('--reels');
const singleId = argv.find((a) => /^\d+$/.test(a));

const FIELDS = 'id,media_type,media_product_type,timestamp,permalink,caption,is_ai_generated';

const me = await api(`${IG_BASE}/me`, { fields: 'id,username', access_token: token });
if (!me.ok) { console.error(`계정 조회 실패: ${JSON.stringify(me.json.error)}`); process.exit(1); }
console.log(`계정: @${me.json.username}\n`);

let items;
if (singleId) {
  const one = await api(`${IG_BASE}/${singleId}`, { fields: FIELDS, access_token: token });
  if (!one.ok) { console.error(`❌ 조회 실패: ${JSON.stringify(one.json.error)}`); process.exit(1); }
  items = [one.json];
} else {
  // ⚠️ limit은 25 이상으로 둔다 — 20으로 잘라 릴스 10건 중 2건을 놓친 적이 있다(2026-08-07).
  const list = await api(`${IG_BASE}/${me.json.id}/media`, { fields: FIELDS, limit: '25', access_token: token });
  if (!list.ok) { console.error(`❌ 목록 조회 실패: ${JSON.stringify(list.json.error)}`); process.exit(1); }
  items = list.json.data;
}

const shown = reelsOnly ? items.filter((m) => m.media_product_type === 'REELS') : items;

for (const m of shown) {
  const st = labelState(m);
  const cap = (m.caption ?? '').slice(0, 22).replace(/\n/g, ' ');
  const surface = m.media_product_type === 'REELS' ? '릴스  ' : '피드  ';
  console.log(`${st.icon} [${m.timestamp.slice(0, 10)}] ${surface} ${String(m.media_type).padEnd(14)} ${st.text.padEnd(14)} "${cap}"`);
  if (m.is_ai_generated) console.log(`     ${m.permalink}`);
}

const on = shown.filter((m) => m.is_ai_generated === true).length;
const missing = shown.filter((m) => !Object.prototype.hasOwnProperty.call(m, 'is_ai_generated')).length;
const reels = shown.filter((m) => m.media_product_type === 'REELS');
const reelsOn = reels.filter((m) => m.is_ai_generated === true).length;

console.log(`\n조회 ${shown.length}건 · API=true ${on}건${missing ? ` · 필드 없음 ${missing}건` : ''}`);
console.log(`  └ 릴스 ${reels.length}건 중 API=true ${reelsOn}건`);
console.log('\n⚠️ **API=false 는 「라벨 꺼짐」이 아니다.** 2026-08-14 릴스는 앱에 「AI 콘텐츠」가 붙어 있는데');
console.log('   API 는 3경로 모두 false 였다(원인 `[미검증]`). **판정은 앱 화면이고 이 표는 참고다.**');
console.log('   ▶ true 는 신뢰한다(반례 없음). false 는 앱에서 눈으로 확인한다.');
if (on === 0) console.log('\n⚠️ API=true 가 하나도 없다. AI 음성·합성 영상을 올린 회차가 있으면 반드시 앱에서 볼 것.');
