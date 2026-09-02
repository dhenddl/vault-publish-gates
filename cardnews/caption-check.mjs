// caption-check.mjs — 릴스 산출물에 캡션 파일이 붙었는지, 언제 붙었는지 본다.
//
// 사용법: node caption-check.mjs
//
// ★ 왜 만들었나 (2026-08-21)
//   2026-07-27에 팁7·팁8 릴스가 캡션 없이 나갔다. 렌더가 매니페스트 작성보다 먼저였고,
//   캡션 생성기는 참조할 파일이 없어 **에러 없이 안내 로그만 찍고 넘어갔다**(종료 코드 정상).
//   빌드가 성공으로 보였으므로 사람이 폰 드라이브를 열어보기 전까지 아무도 몰랐다.
//   그때 없던 검사가 이것이다. 영상 옆에 캡션이 있는지, 그리고 **같이 만들어졌는지**를 본다.
//
// ★ 판정 기준: 캡션이 영상보다 1시간 넘게 늦으면 「사후」로 본다.
//   정상 빌드는 렌더 직후에 캡션을 쓰므로 차이가 몇 초다. 몇 시간 차이는 사람이 나중에 붙인 것이다.
import { readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out');
const HOUR = 3600 * 1000;

const rows = [];
for (const d of readdirSync(OUT)) {
  const dir = join(OUT, d);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
  const files = readdirSync(dir);
  const mp4 = files.find((f) => f.endsWith('reels.mp4'));
  if (!mp4) continue;
  const cap = files.find((f) => f.endsWith('caption.txt'));
  const mt = statSync(join(dir, mp4)).mtimeMs;
  if (!cap) { rows.push({ slug: d, state: '없음', gap: null }); continue; }
  const ct = statSync(join(dir, cap)).mtimeMs;
  const gap = ct - mt;
  rows.push({ slug: d, state: gap > HOUR ? '사후' : '동시', gap });
}

const none = rows.filter((r) => r.state === '없음');
const late = rows.filter((r) => r.state === '사후');

console.log(`릴스 산출물        ${rows.length} 편`);
console.log(`캡션 동시 생성     ${rows.length - none.length - late.length} 편`);
console.log(`캡션 사후 생성     ${late.length} 편`);
console.log(`캡션 없음          ${none.length} 편`);

if (none.length) {
  console.log('');
  console.log('캡션 없음:');
  for (const r of none) console.log(`  ${r.slug}`);
}
if (late.length) {
  console.log('');
  console.log('사후 생성 (몇 시간 뒤에 사람이 붙임):');
  for (const r of late) console.log(`  ${r.slug.padEnd(14)} +${Math.round(r.gap / HOUR)}시간`);
}
