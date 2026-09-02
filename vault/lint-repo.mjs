// lint-repo.mjs — 공개 리포가 "클론해서 돌아가는가"를 검사한다. 2026-08-24 신설.
//
// 왜 만들었나:
//   2026-08-13 커밋에서 render.js·make-termcast.mjs 가 palette.mjs·inspect.mjs 를
//   import 하기 시작했는데 .gitignore 화이트리스트에 두 줄을 안 넣었다.
//   그래서 **11일간 공개된 채로 두 진입점이 모듈 해석 단계에서 실패**했다.
//   아무도 몰랐던 이유는 볼트가 "이 프로젝트는 git 저장소가 아니다"로 알고 있어서
//   「공개물이 실제로 도는가」를 점검하는 항목이 아예 없었기 때문이다.
//
// ★ 핵심 판정 기준: **로컬에 파일이 있는지가 아니라 추적되는지**를 본다.
//   로컬엔 다 있으니 로컬 기준으로 검사하면 항상 통과한다 — 그게 11일을 놓친 이유다.
//
// 화이트리스트 방식(`*` 무시 후 `!` 로 열기)의 대가라서 새 모듈을 쪼갤 때마다
// .gitignore 에 한 줄을 같이 넣어야 하고, 그걸 사람이 기억하는 건 실패한다.
//
// 사용법:
//   node pipeline/vault/lint-repo.mjs              # pipeline/ 워킹트리 검사
//   node pipeline/vault/lint-repo.mjs <클론경로>    # 실제 클론을 검사(최종 확인)
//
// exit 1 = 추적 누락이 있다. 경고가 아니라 게이트다.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const repo = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(HERE, '..');

if (!existsSync(path.join(repo, '.git'))) {
  console.error(`git 저장소가 아니다: ${repo}`);
  process.exit(2);
}

const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });

const tracked = new Set(git('ls-files').split(/\r?\n/).filter(Boolean));
const scripts = [...tracked].filter((f) => /\.(mjs|js)$/.test(f));

// from './x.mjs' · require('./x.js') · import('./x.mjs')
const IMPORT_RE = /(?:from|require\(|import\()\s*['"](\.[^'"]+)['"]/g;

const missing = [];
let checked = 0;

for (const f of scripts) {
  const raw = readFileSync(path.join(repo, f), 'utf8');
  // ⛔ 2026-08-24 버그 수정: 주석 안의 **예시**를 실제 import 로 읽었다.
  //   이 파일 42행이 `from './x.mjs' · require('./x.js')` 를 주석으로 적어뒀는데
  //   자기 자신을 스캔하며 「추적 누락 3건」을 냈다. export-material.mjs 도 같이 걸렸다.
  //   ★ 미추적일 때는 스캔 대상이 아니어서 안 보였다 — 전량 추적으로 바꾸니 드러났다.
  //   → 줄 단위로 주석을 떼고 본다. 블록 주석 안의 여러 줄도 `*` 로 시작하므로 걸린다.
  const src = raw.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const dir = path.posix.dirname(f);
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1];
    // 확장자 없는 상대 경로는 ESM에서 그대로는 안 돌지만, 우리 코드는 항상 붙인다.
    const target = path.posix.normalize(path.posix.join(dir, spec));
    checked++;
    if (!tracked.has(target)) {
      missing.push({
        from: f,
        spec,
        target,
        local: existsSync(path.join(repo, target)),
      });
    }
  }
}

console.log(`리포: ${path.basename(repo)} · 추적 ${tracked.size}개 · 스크립트 ${scripts.length}개 · 상대 import ${checked}건\n`);

if (!missing.length) {
  console.log('  ✅ 추적 누락 0 — 클론해도 모듈 해석은 통과한다');
  console.log('  ⚠️ 이 검사가 보는 것은 상대 import 뿐이다. npm 의존성·환경변수·');
  console.log('     외부 바이너리(ffmpeg·rclone·edge-tts)가 갖춰졌는지는 보지 않는다.');
  process.exit(0);
}

console.log(`  ⛔ 추적 누락 ${missing.length}건 — 클론하면 여기서 죽는다\n`);
for (const x of missing) {
  const where = x.local ? '로컬엔 있음 → .gitignore 화이트리스트 누락' : '로컬에도 없음 → 오타이거나 삭제됨';
  console.log(`  ${x.from}`);
  console.log(`    → ${x.spec}   (${x.target})`);
  console.log(`      ${where}`);
}
console.log('\n  고치는 법: .gitignore 에 "!<경로>" 한 줄을 추가하고 git add 한다.');
process.exit(1);
