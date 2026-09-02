# vault-publish-gates

발행 전에 **틀린 걸 잡는 검사기 13개**. 위키 쪽 4개, 발행 원고 쪽 9개입니다.

## 먼저 — 이건 발행 도구가 아닙니다

클론해서 돌려도 **아무것도 안 올라갑니다.** 검사만 합니다.

원고를 쓰고 발행하는 부분은 여기 없습니다. 이 저장소의 범위는 **「쓴 것을 검사하는 것」**까지입니다.

## 왜 만들었나

자동으로 글이 나가는 구조를 만들고 나니, 사람이 마지막에 읽어보는 단계가 사라졌습니다.

그래서 사고가 나기 시작했습니다. 확인 안 한 숫자가 그대로 나가고, 죽은 링크가 붙고, 시간이 지나면 틀려질 표현이 예약된 글에 박혀 있었습니다.

**하나씩 사고를 겪고 하나씩 붙였습니다.** 설계해서 만든 게 아닙니다. 그래서 목록에 일관성이 없어 보일 수 있는데, 각각이 실제로 한 번씩 데인 자리입니다.

## 검사기 목록

### 위키·메모 쪽

| 파일 | 무엇을 잡나 |
|---|---|
| `vault/lint-links.mjs` | 깨진 링크 · 고아 페이지 · frontmatter 누락 · 목록 미등재 · 0바이트 페이지 |
| `vault/lint-claims.mjs` | 「쓰면 안 되는 숫자」 대장 생성·대조 |
| `vault/lint-repo.mjs` | 공개 저장소가 **클론해서 돌아가는가** |
| `vault/claim-markers.mjs` | 위 둘이 읽는 **미검증 표시 규약**(라이브러리) |

### 발행 원고 쪽

| 파일 | 무엇을 잡나 |
|---|---|
| `publish/check-numbers.mjs` | **미검증 표시가 붙은 숫자**가 원고에 들어가는 것 |
| `publish/check-rank-claims.mjs` | **시간이 지나면 틀려지는 표현**(순위·「현재」류) |
| `publish/check-ai-label.mjs` | 발행분의 AI 라벨이 **실제로 켜졌는지** |
| `publish/check-served-quality.mjs` | 플랫폼이 **되돌려주는 영상 규격** |
| `publish/style-metrics.mjs` | 문장 길이·쉼표 습관 같은 문체 지표 |
| `cardnews/alt-coverage.mjs` | 카드뉴스 **대체 텍스트 커버리지** |
| `cardnews/caption-check.mjs` | 캡션 길이·CTA 위치 |
| `cardnews/deck-check.mjs` | 카드 입력↔출력 대응 |
| `cardnews/lines-path.mjs` | 화면 대본 **경로 규칙 단일 출처**(라이브러리) |

### 아침 점검

| 파일 | 무엇을 잡나 |
|---|---|
| `publish/check-ready.ps1` | 노드 경로 · 예약 작업 상태 · **최근 36시간 실패** · 토큰 길이 · 커밋 신원 |
| `publish/run-check-ready.cmd` | 위를 매일 자동으로 돌리고 로그를 남기는 래퍼 |

## 실제로 걸렸던 것들

**만든 날 저자를 물었습니다.** `check-rank-claims` 를 붙인 날, 제가 **한 시간 전에 고친 문장**을 그게 잡았습니다. 「현재 1위」 같은 표현이었는데 발행은 며칠 뒤였습니다.

**경고 4건이 전부 오탐이었습니다.** 링크 코드 길이로 오타를 잡으려 했는데, 열 개 중 아홉 개가 8자라서 8자를 규칙으로 삼았습니다. 7자짜리도 정상이었어요. **표본 아홉 개로 규칙을 만들면 이렇게 됩니다.** 그 검사는 지웠습니다.

**0건이 통과가 되면 안 됩니다.** 지목한 파일이 없을 때 조용히 「이상 없음」으로 끝나던 자리가 있었습니다. 파일명 오타와 「문제 없음」은 구분돼야 합니다.

## ⚠️ 쓰기 전에 바꿔야 할 것

**볼트 경로.** 위키 쪽 검사기는 기본값으로 `second-brain` 폴더를 봅니다. 다른 이름이면 `--vault <경로>` 로 주세요. 없는 경로를 주면 **조용히 빈 리포트가 나오지 않고 멈춥니다.**

```bash
node vault/lint-links.mjs --vault ../my-notes
node vault/lint-claims.mjs --vault ../my-notes
node publish/check-numbers.mjs --vault ../my-notes
```

**아침 점검의 작업 이름.** `check-ready.ps1` 은 예약 작업 접두어를 인자로 받습니다. 기본값은 제 것이라 그대로 돌리면 **작업 0건**이 나옵니다. 그리고 0건은 이제 정상이 아니라 경고로 처리됩니다.

```powershell
.\publish\check-ready.ps1 -PublishPrefix 'myprefix-*' -BriefingDir '..\notes\briefings'
```

**`lint-claims.mjs --write`** 는 대상 페이지 이름이 코드에 박혀 있습니다. `--write` 없이는 안 쓰이고 명확히 멈춥니다.

**계정 핸들.** 일부 파일에 제 계정 이름이 문자열로 남아 있을 수 있습니다. 쓰시기 전에 한 번 훑어보세요.

## 필요한 것

**npm 의존이 0입니다.** Node 만 있으면 돕니다.

`check-ready.ps1` 만 Windows PowerShell 이 필요합니다. 나머지는 어디서든 돕니다.

## 견본 설정

`vault/CLAUDE.sample.md` 는 이 검사기들이 전제하는 **폴더 규칙과 작성 규약**을 적어둔 견본입니다. 제 실제 설정에서 경로·계정·운영 항목을 걷어낸 판입니다.

## 만든 곳

혼자 SNS·블로그를 자동으로 굴리면서 겪은 것들입니다. 과정을 [@dhenddl1](https://instagram.com/dhenddl1) 에 적고 있습니다.

MIT 입니다. 고쳐 쓰셔도 됩니다.
