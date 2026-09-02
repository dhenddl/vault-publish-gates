// check-served-quality.mjs — **인스타가 되돌려주는 영상의 실제 규격을 잰다** (읽기 전용, 발행 없음)
//
// 왜 만들었나 (2026-08-24):
//   조립 경로를 **720×1280으로 맞출지** 판단해야 하는데, 우리 기존 릴스 20편은 전부 1080×1920이고
//   **해상도를 변수로 써본 적이 없다.** 그런데 인스타는 업로드본을 **재인코딩해서 서빙**한다.
//   → **인스타가 이미 우리 1080을 강등해 서빙하고 있으면 720으로 올리든 1080으로 올리든 결과가 같다.**
//   그러면 이 질문은 발행 실험 없이 해소된다.
//
// 방법: Graph API `media_url`(동영상에 대해 CDN 링크를 준다) → ffprobe 로 헤더만 읽는다.
//   ⚠️ `media_url` 은 **만료되는 CDN URL** 이다. 받는 즉시 재야 한다.
//   ⚠️ ffmpeg-static 은 `pipeline/cardnews` 에만 설치돼 있다 — 거기 경로를 직접 가리킨다.
//
// 읽기 전용이다. 발행·수정·삭제 API 를 호출하지 않는다.
// 사용: node check-served-quality.mjs [--limit 40] [--json]

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from './env.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const IG_BASE = 'https://graph.instagram.com/v23.0';

const args = { limit: 40, json: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--limit') args.limit = parseInt(argv[++i], 10);
  else if (argv[i] === '--json') args.json = true;
}

const env = loadEnv(HERE);
const token = env.IG_ACCESS_TOKEN;
if (!token) { console.error('.env 에 IG_ACCESS_TOKEN 이 없다'); process.exit(1); }

async function api(url, params) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u);
  return { ok: res.ok, json: await res.json() };
}

const me = await api(`${IG_BASE}/me`, { fields: 'id,username', access_token: token });
if (!me.ok) { console.error('계정 조회 실패:', JSON.stringify(me.json)); process.exit(1); }
console.log(`계정: @${me.json.username}`);

const list = await api(`${IG_BASE}/${me.json.id}/media`, {
  fields: 'id,media_type,media_product_type,timestamp,permalink,media_url',
  limit: args.limit, access_token: token,
});
if (!list.ok) { console.error('미디어 조회 실패:', JSON.stringify(list.json)); process.exit(1); }

const all = list.json.data || [];

// ⚠️ 진단을 먼저 찍는다 — media_url 이 없으면 그 사실이 보여야 한다(조용히 0편으로 넘기지 않는다)
const diag = {};
for (const m of all) {
  const k = `${m.media_type}/${m.media_product_type || '-'}  url=${m.media_url ? 'Y' : 'N'}`;
  diag[k] = (diag[k] || 0) + 1;
}
console.log(`조회 ${all.length}편 · 타입별 media_url 유무:`);
for (const [k, v] of Object.entries(diag).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(36)} ${v}편`);
}
console.log('');

const vids = all.filter((m) => m.media_url && (m.media_type === 'VIDEO' || m.media_product_type === 'REELS'));
const 릴스전체 = all.filter((m) => m.media_type === 'VIDEO' || m.media_product_type === 'REELS');
const 막힌수 = 릴스전체.length - vids.length;
console.log(`잴 수 있는 동영상 ${vids.length}편 / 릴스 ${릴스전체.length}편\n`);

// ⛔⛔ **한 편이라도 막혀 있으면 여기서 안내한다.** 0편일 때만 띄우면 늦다 —
//   2026-08-27 에 오독이 난 상황이 정확히 **1/19 였다**(전부 막힌 게 아니었다).
//   그때 log.md 는 *"측정이 막혔다"* 고 적으면서 **같은 항목에서** 릴스 5편의
//   도달/이탈/시청을 297/65.5/4,331 로 전부 보고했다 — 나란히 있는데 안 갈랐다.
//   ★ changelog(July 30, 2026): *"All other fields ... are returned as normal."*
//   ★ `check-insights.mjs` 는 `media_url` 참조가 **0건**이다(2026-08-28 실측).
if (막힌수 > 0) {
  console.log(`⚠️ 릴스 ${막힌수}편이 media_url 없이 온다 — **화질 측정만** 막힌 것이다.`);
  console.log('   이 스크립트는 media_url 로 CDN 헤더를 받아 ffprobe 로 해상도·비트레이트를 잰다.');
  console.log('   ✅ 도달·조회·평균시청·이탈률은 **다른 문(/insights)** 이라 계속 나온다:');
  console.log('      node check-insights.mjs');
  console.log('   ⛔ 이걸 「릴스 측정이 막혔다」로 적지 마라. 막힌 건 화질 하나다.\n');
}
if (!vids.length) {
  console.log('⛔ media_url 이 붙은 동영상이 없다. 위 진단표를 보고 원인을 가른다:');
  console.log('   · VIDEO 인데 url=N  → 저작권 보호 변경(2026-07-30) 또는 필드 권한·처리 지연');
  console.log('   · VIDEO 자체가 없음 → limit 창 안이 캐러셀뿐이다. --limit 을 늘려라');
  console.log('');
  // ⛔⛔ **여기서 「릴스 측정이 막혔다」로 읽지 마라.** 막힌 건 이 스크립트뿐이다.
  //   2026-08-27 log.md 가 *"측정이 막혔다"* 고 적은 **같은 항목에서** 릴스 5편의
  //   도달/이탈/시청을 297/65.5/4,331 처럼 전부 보고했다 —
  //   **막혔다는 서술과 측정값이 나란히 있었는데 아무도 안 갈랐다**(2026-08-28 브리핑 발견 2).
  //   ★ changelog(July 30, 2026) 원문: *"All other fields on the media object, such as
  //     id, permalink, caption, and timestamp, are returned as normal."*
  //   ★ `check-insights.mjs` 는 `media_url` 을 **한 번도 안 쓴다**(참조 0건, 2026-08-28 실측).
  console.log('⚠️ 이건 **화질 측정만** 막힌 것이다 — 이 스크립트는 media_url 로 CDN 헤더를 받아');
  console.log('   ffprobe 로 해상도·비트레이트를 잰다. 그 문 하나가 닫혔다.');
  console.log('   ✅ 도달·조회·평균시청·이탈률은 **다른 문(/insights)** 이라 계속 나온다:');
  console.log('      node check-insights.mjs');
  process.exit(0);
}

// ffprobe 위치 — cardnews 쪽 node_modules 를 직접 가리키고, 없으면 PATH 로 떨어진다
let ffprobe = 'ffprobe';
for (const name of ['ffprobe.exe', 'ffprobe']) {
  const c = join(HERE, '..', 'cardnews', 'node_modules', 'ffmpeg-static', name);
  if (existsSync(c)) { ffprobe = c; break; }
}
if (ffprobe === 'ffprobe') {
  const c = join(HERE, '..', 'cardnews', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
  if (existsSync(c)) ffprobe = c.replace(/ffmpeg\.exe$/, 'ffprobe.exe');
}
console.log(`ffprobe: ${ffprobe}\n`);

const rows = [];
for (const m of vids) {
  const r = spawnSync(ffprobe, [
    '-v', 'error', '-analyzeduration', '3000000', '-probesize', '3000000',
    '-show_entries', 'stream=index,codec_type,codec_name,width,height,r_frame_rate,bit_rate',
    '-show_entries', 'format=duration,bit_rate,size',
    '-of', 'default=nw=1', m.media_url,
  ], { encoding: 'utf-8', timeout: 90000 });
  const kv = {};
  let inVideo = false;
  for (const line of (r.stdout || '').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i < 0) continue;
    const k = line.slice(0, i), v = line.slice(i + 1);
    if (k === 'codec_type') { inVideo = v === 'video'; continue; }
    if (['width', 'height', 'r_frame_rate'].includes(k)) { if (inVideo) kv[k] = v; continue; }
    if (k === 'bit_rate') { kv[inVideo ? 'vbr' : 'abr_or_fmt'] = v; continue; }
    if (['duration', 'size'].includes(k)) kv[k] = v;
  }
  rows.push({
    date: m.timestamp.slice(0, 10),
    kind: m.media_product_type || m.media_type,
    w: kv.width, h: kv.height, fps: kv.r_frame_rate,
    dur: kv.duration, vbr: kv.vbr, size: kv.size,
    permalink: m.permalink,
    err: r.status !== 0 ? (r.stderr || 'ffprobe 실패').trim().slice(0, 90) : null,
  });
}

if (args.json) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }

console.log('날짜        표면       서빙 해상도     fps      길이     비트레이트   파일');
console.log('-'.repeat(80));
for (const r of rows) {
  if (r.err) { console.log(`${r.date}  ${(r.kind || '').padEnd(10)} ⛔ ${r.err}`); continue; }
  console.log(`${r.date}  ${(r.kind || '').padEnd(10)} ${`${r.w}x${r.h}`.padEnd(14)} ` +
    `${(r.fps || '').padEnd(8)} ${(Number(r.dur) || 0).toFixed(2).padStart(6)}s  ` +
    `${(r.vbr ? (Number(r.vbr) / 1000).toFixed(0) + ' kbps' : '-').padStart(10)}  ` +
    `${r.size ? (Number(r.size) / 1048576).toFixed(2) + ' MB' : '-'}`);
}

const ok = rows.filter((r) => !r.err);
if (!ok.length) { console.log('\n⛔ 전부 실패 — CDN URL 만료 또는 네트워크 문제일 수 있다. 다시 돌려보라.'); process.exit(1); }

const byRes = {};
for (const r of ok) byRes[`${r.w}x${r.h}`] = (byRes[`${r.w}x${r.h}`] || 0) + 1;
console.log('\n서빙 해상도 분포:');
for (const [k, v] of Object.entries(byRes).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(12)} ${v}편`);

const kept = ok.filter((r) => Number(r.w) >= 1080).length;
console.log(`\n1080 이상으로 서빙: ${kept} / ${ok.length}편`);
if (kept === ok.length) {
  console.log('▶ **업로드 해상도가 유지된다.** 720으로 올리면 720으로 서빙될 가능성이 높다 → 1080 유지가 유리하다.');
  console.log('  그러면 조립을 1080으로 하고 **Flow 클립만 업스케일**하는 쪽을 다시 재봐야 한다(경계강도 72% 손실).');
} else if (kept === 0) {
  console.log('▶ **전량 강등된다.** 720으로 올려도 결과가 같다 → **720 조립 경로에 손해가 없다.**');
} else {
  console.log('▶ **섞여 있다.** 회차별로 다르다 — 날짜·도달과 대조해 조건을 찾아야 한다.');
}
console.log('\n⚠️ media_url 은 만료되는 CDN 링크다. 이 표는 측정 시점 값이고 하한도 상한도 아니다.');
