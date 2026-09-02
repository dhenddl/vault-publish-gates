# check-ready.ps1 -- 읽기 전용 점검. 아무것도 바꾸지 않는다.
# 재부팅 후 로그인하고 나서 한 번 실행한다. 전부 [OK]면 그대로 두고 나가면 된다.
# 만든 이유: 2026-08-12 재부팅 때 nvm이 v10으로 되돌아가 토큰 갱신이 조용히 깨졌다.
#           눈으로 확인할 항목이 흩어져 있어 한 번에 본다.

# ---------------------------------------------------------------------------
# 2026-08-26: 우리 예약 작업 이름과 볼트 경로가 박혀 있어서 **남의 기계에서 못 돌았다.**
#   기본값은 우리 것 그대로라 이 저장소에서의 실행 방식은 안 바뀐다.
#   ⛔ 이건 기록된 차단 목록에 「예약작업 이름」만 있었고 볼트 경로는 없었다 —
#     「내보내면 안 되는 것」은 셌는데 「받아서 돌아가는가」는 안 셌다.
# ---------------------------------------------------------------------------
param(
  [string]$RefreshTask   = 'dhenddl-refresh-tokens',
  [string]$PublishPrefix = 'dhenddl-publish-',
  [string]$SelfTask      = 'dhenddl-check-ready',
  [string]$BriefingDir   = (Join-Path $PSScriptRoot '..\..\second-brain\wiki\briefings'),
  [string]$BriefingName  = '데일리 브리핑 {0}.md'
)

$ok = 0; $ng = 0
function Chk($name, $cond, $detail) {
  if ($cond) { $s = '[OK]  '; $script:ok++ } else { $s = '[!!]  '; $script:ng++ }
  "{0}{1,-30} {2}" -f $s, $name, $detail
}

"===================== 발행 준비 점검 ====================="
"실행 시각 : " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
"부팅 시각 : " + (Get-CimInstance Win32_OperatingSystem).LastBootUpTime

# ---------------------------------------------------------------------------
# 사용자 프로필이 붙어 있는가  (2026-08-24 추가)
#   작업 스케줄러로 돌리면 사용자 프로필 하이브(UsrClass.dat)와 APPDATA가
#   안 붙는 경우가 있다. 그 상태에서 아래 두 검사는 "없다"를 반환한다:
#     - Claude 자동시작 : HKCU\Software\Classes\... 가 비어 보여 State=0
#     - Claude 앱 인증  : $env:APPDATA\Claude\logs 를 못 찾아 '로그 없음'
#   실제로 2026-08-24 첫 등록 직후 State=2 인데 작업 실행에서는 0 으로 읽혔다.
#   ★ 이건 설정이 꺼진 게 아니라 볼 수 없는 것이다. 「공백을 사실로 읽지 않는다」.
#   그래서 프로필이 안 붙은 실행에서는 두 항목을 [!!] 로 세지 않고 보류한다.
# ---------------------------------------------------------------------------
#   ⚠️ 자동 감지는 실패했다. $env:APPDATA 는 스케줄러 실행에서도 채워지는데
#   레지스트리 HKCU\Software\Classes 하이브(UsrClass.dat)만 다르게 매핑돼서
#   "APPDATA 는 보이는데 State 는 0" 이라는 어긋난 상태가 나온다.
#   추측으로 감지하지 않고 래퍼가 명시적으로 알려주게 한다 -- run-check-ready.cmd
#   가 CHECKREADY_SCHEDULED=1 을 설정한다. 사람이 손으로 돌리면 그 값이 없다.
$profOk = ($env:CHECKREADY_SCHEDULED -ne '1')
"실행 경로 : " + $(if ($profOk) { "사람이 직접 (프로필 의존 검사 포함)" } else { "작업 스케줄러 -- 프로필 의존 검사 2건 보류" })
""

# 1. 노드 핀
$pin = "$env:LOCALAPPDATA\nvm\v22.21.1\node.exe"
$pinOk = Test-Path $pin
Chk '노드 핀 파일' $pinOk $(if ($pinOk) { (& $pin --version) } else { '없음 -- 버전 올렸으면 경로 수정 필요' })

# 2. 토큰 갱신 작업이 핀을 가리키는가
#   ⚠️ 2026-08-31 09:08 에 dhenddl-* 58건 전부를 run-hidden.vbs 로 감쌌다(콘솔 창이 뜨지 않게).
#   그 순간 노드 경로가 Execute 에서 Arguments 안쪽으로 들어갔고, Execute 만 읽던 이 검사는
#   09-01 08:00 부터 wscript.exe 를 보고 [!!] 를 냈다 -- 갱신 자체는 정상이었다
#   (08-31 10:00 결과 0, .env 토큰 3개 전부 길이가 바뀌었다).
#   ★ 래퍼를 씌우면 「무엇을 실행하나」가 Execute 에 더는 안 남는다. 두 필드를 합쳐서 본다.
#   ⛔ 안 고치면 매일 아침 [!!] 가 뜬다 -- 늑대 소년이 된 검사는 진짜 사고를 못 막는다
#      (이 파일 래퍼 run-check-ready.cmd 주석에 같은 말이 적혀 있다).
$rt = Get-ScheduledTask -TaskName $RefreshTask -ErrorAction SilentlyContinue
$rtCmd  = if ($rt) { "$($rt.Actions[0].Execute) $($rt.Actions[0].Arguments)" } else { '' }
$rtNode = [regex]::Match($rtCmd, '[^"]*nvm\\v22[^"]*node\.exe').Value
Chk '토큰갱신 노드 경로' ($rtNode -ne '') $(if ($rtNode) { $rtNode } else { $rtCmd })
if ($rt) {
  $rti = $rt | Get-ScheduledTaskInfo
  Chk '토큰갱신 마지막 결과' ($rti.LastTaskResult -eq 0) ("결과=$($rti.LastTaskResult)  실행=$($rti.LastRunTime)  다음=$($rti.NextRunTime)")
}

# 3. 발행 작업 상태
$pubs = Get-ScheduledTask | Where-Object { $_.TaskName -like "$PublishPrefix*" }
$notReady = $pubs | Where-Object { $_.State -ne 'Ready' }
# ⛔ 0건을 [OK] 로 내지 않는다 (2026-08-26). 접두어가 틀리면 「다 정상」으로 읽힌다 --
#   빈 결과와 문제 없음이 화면에서 같아 보이는 자리다. 오늘 볼트 도구에서 반복해서 나온 모양이다.
Chk '발행 작업 상태' (($pubs.Count -gt 0) -and ($notReady.Count -eq 0)) $(if ($pubs.Count -eq 0) { "0건 -- 접두어 '$PublishPrefix' 로 잡히는 작업이 없다" } else { "총 $($pubs.Count)건 / Ready 아님 $($notReady.Count)건" })
$next = $pubs | ForEach-Object { $_ | Get-ScheduledTaskInfo } | Where-Object { $_.NextRunTime } | Sort-Object NextRunTime | Select-Object -First 1
if ($next) { "      다음 발행 : " + $next.NextRunTime }

# 3-1. 최근 발행 결과 -- 실패한 회차가 있나 (2026-08-28 신설)
#
# ⛔⛔ 왜 넣었나: 같은 날 publish.mjs 에 **발행 직전 게이트**를 넣었다.
#   게이트가 막으면 아무것도 발행하지 않고 **종료 코드 2** 로 끝난다. 그건 옳은 동작인데,
#   ★★ 「막혔다」를 아무도 모르면 그냥 **그날 글이 안 나간 것**과 같다.
#   19:00 회차가 막혀도 로그 파일 안에만 남고 사람은 로그를 안 읽는다.
#   ▶ 그래서 다음 날 아침 점검이 **어제 실패한 회차를 이름으로 찍는다.**
#
# 종료 코드: 0=성공 · 1=발행 실패 · 2=게이트 차단 · 267011=아직 안 돌았음(정상)
# ⚠️ 36시간으로 잡는다 -- 전날 21:00 회차를 다음 날 08:00 점검이 잡으려면 24시간으로는 모자란다.
#
# ⚠️ 2026-08-28 확장: 발행 작업(`dhenddl-publish-*`)만 보면 **주간 리포트 같은 다른 작업의
#   실패를 아무도 모른다.** 같은 날 `dhenddl-weekly-replies`(월 10:30, 읽기 전용)를 만들면서
#   그 구멍이 보였다 — 실패해도 로그 파일 안에만 남는다.
#   ▶ 그래서 **결과 스캔은 `dhenddl-*` 전부**를 본다. 위 「발행 작업 상태」는 편성 충족을 세는
#     것이라 `dhenddl-publish-*` 그대로 둔다. **두 검사는 묻는 게 다르다.**
$cut = (Get-Date).AddHours(-36)
$allTasks = Get-ScheduledTask | Where-Object { $_.TaskName -like 'dhenddl-*' }
$recentRuns = $allTasks | ForEach-Object {
    $t = $_; $i = $_ | Get-ScheduledTaskInfo
    if ($i.LastRunTime -and $i.LastRunTime -gt $cut) {
        [pscustomobject]@{ Name = $t.TaskName; When = $i.LastRunTime; Code = $i.LastTaskResult }
    }
}
# ⛔⛔ 2026-08-31 수정: 이 검사가 **자기 자신을 실패로 세고 있었다.** 8/29·8/30 이틀 연속 exit 1.
#   267009 = SCHED_S_TASK_RUNNING 이다. 점검이 도는 **중에** 자기 작업 상태를 읽으면 당연히
#   「실행 중」이고, `Code -ne 0` 이 그걸 실패로 셌다. 구조상 매 실행 100% 재현된다.
#   ★ 바로 위 2026-08-28 확장(`dhenddl-publish-*` → `dhenddl-*`)이 자기를 대상에 넣으면서 생겼다.
#     넓힌 그 순간부터였는데 그날 08:00 은 변경 전 실행이라 통과했고, 다음 날부터 걸렸다.
#   ★★ 진짜 피해는 빨간불이 아니라 **실패 건수가 늘 1 이상이라 진짜 실패가 묻히는 것**이다.
#      볼트 원칙 그대로다 — *"무시되는 검사는 없는 것보다 나쁘다."*
#   ▶ 자기 자신은 **구조적으로 항상 실행 중**이라 뺀다.
#   ⛔ 다만 **남의 작업의 267009 는 지우지 않는다** — 진짜로 멈춰 있는 것일 수 있다.
#      실패로 세지 않되 **따로 찍어서 보이게** 한다. 「실패 아님」과 「안 보이게」는 다르다.
$RUNNING = 267009   # SCHED_S_TASK_RUNNING
$failed  = @($recentRuns | Where-Object { $_.Code -ne 0 -and $_.Code -ne $RUNNING })
$running = @($recentRuns | Where-Object { $_.Code -eq $RUNNING -and $_.Name -ne $SelfTask })
$detail  = if ($recentRuns.Count -eq 0) { '실행된 작업 없음' } else {
    "실행 $($recentRuns.Count)건 / 실패 $($failed.Count)건" + $(if ($running.Count) { " / 실행 중 $($running.Count)건" } else { '' })
}
Chk '최근 36h 작업 결과' ($failed.Count -eq 0) $detail
foreach ($f in $failed) {
    $why = switch ($f.Code) { 2 { '게이트 차단 -- 원고를 고치고 다시 돌린다' } 1 { '발행 실패 -- 로그를 본다' } default { "종료 코드 $($f.Code)" } }
    "      [!!] {0}  {1}  {2}" -f $f.Name, $f.When, $why
    "           로그: pipeline\publish\logs\  ·  재발행: Start-ScheduledTask -TaskName '{0}'" -f $f.Name
}
foreach ($r in $running) {
    "      [..] {0}  {1}  실행 중 -- 36h 안에 시작해서 아직 안 끝났다. 멈춘 것일 수 있으니 볼 것." -f $r.Name, $r.When
}

# 4. 전원 -- 절전에 안 들어가는가 (AC)
$sleepAc = (powercfg /q SCHEME_CURRENT SUB_SLEEP STANDBYIDLE | Select-String 'AC .*: *0x([0-9a-f]+)').Matches.Groups[1].Value
Chk '절전 진입(AC)' ($sleepAc -eq '00000000') $(if ($sleepAc -eq '00000000') { '안 함' } else { "0x$sleepAc 초 -- 절전에 들어간다" })

# 5. 재부팅 창이 무인 작업 시각을 덮는가  (2026-08-24 재설계)
#    종전 검사는 "업데이트 일시중지가 살아 있는가"였다. 그건 임시 방어였고
#    최대 5주라 반드시 만료된다 -- 만료될 때마다 [!!]가 떠서 경보가 무뎌진다.
#    ★ 8/22 사고가 가르쳐준 실제 리스크는 다른 쪽이었다:
#      활성시간(active hours) 밖에서는 Windows가 재부팅해도 되고, 실제로
#      2026-08-21 23:29에 그렇게 했다(활성시간 8~23, 종료 직후 29분).
#      그런데 우리 브리핑은 06:07에 돈다 -- 즉 브리핑 시각이 활성시간 밖이다.
#    그래서 감시 대상을 "일시중지"에서 "활성시간이 무인 작업을 덮는가"로 바꾼다.
#    일시중지는 정보로만 출력한다.
$u = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings' -ErrorAction SilentlyContinue
$ahStart = $u.ActiveHoursStart; $ahEnd = $u.ActiveHoursEnd
$briefHour = 6   # <브리핑 생성 작업> = 06:07
$ahCovers = ($null -ne $ahStart) -and ($null -ne $ahEnd) -and ($briefHour -ge $ahStart) -and ($briefHour -lt $ahEnd)
Chk '활성시간이 브리핑 덮음' $ahCovers $(if ($null -eq $ahStart) { '활성시간 설정 없음 -- 아무 때나 재부팅될 수 있다' } elseif ($ahCovers) { "활성시간 $ahStart~$ahEnd (06시 포함)" } else { "활성시간 $ahStart~$ahEnd -- 06시가 밖이라 브리핑 중 재부팅 가능. 시작을 6으로" })
$pause = $u.PauseUpdatesExpiryTime
$pauseOk = $pause -and ([datetime]$pause -gt (Get-Date).ToUniversalTime())
"      업데이트 일시중지 : " + $(if ($pause) { "$pause 까지" + $(if ($pauseOk) { ' (유효)' } else { ' (만료 -- 자동시작이 켜져 있으면 치명적이지 않다)' }) } else { '설정 없음' })

# 6. 토큰이 비어 있지 않은가 (값은 출력하지 않는다)
$envPath = Join-Path $PSScriptRoot '.env'
$envOk = $true; $envMsg = @()
#
# ⛔⛔ 위 두 줄을 2026-08-26 에 주석을 넣다가 같이 지웠다. 커밋(690a0d3)까지 갔다.
#    구문 검사는 통과했다 -- 변수가 없어도 PowerShell 은 $null 로 파싱된다.
#    ★★ 「구문 검증 통과」를 「동작 무변경」으로 읽었다. 다른 검사다.
#    08-27 06:50 에 스크립트를 실제로 돌려서 잡았다. 예약 실행(08:00) 전이었다.
#    📌 규칙: 스크립트를 고치면 -- 주석만 고쳐도 -- 돌려본다.
#
# ✅ THREADS_ACCESS_TOKEN_2 추가 (2026-08-27, 08-26 발견분 해소)
#    ⛔ 그 전까지 이 목록에 2계정 토큰이 없었다. 그 토큰으로 발행하는 예약 작업이
#       t-05~t-18 로 14건 걸려 있는데, 죽어도 이 점검이 [OK] 를 냈다.
#       refresh-tokens.mjs:17 은 2계정을 포함했다 -- 갱신은 되고 점검만 빠져 있었다.
#    ★★ 축: 계정을 늘리면 재는 도구도 같이 늘려야 한다.
#       08-25 에 check-threads-insights.mjs 가 같은 이유로 2계정을 못 봤다. 그게 첫 번째였다.
#    ⚠️ 아래 정규식 "^$k=(.+)$" 는 뒤에 = 를 요구하므로 _2 가 기본 키와 안 섞인다.
#       (refresh-tokens.mjs:16 이 같은 이유를 같은 말로 적어뒀다)
#    ⛔ 계정을 또 늘리면 여기, refresh-tokens.mjs:12-17, publish.mjs:60,
#       check-threads-insights.mjs:42 -- 네 곳을 같이 고친다.
foreach ($k in 'IG_ACCESS_TOKEN','THREADS_ACCESS_TOKEN','THREADS_ACCESS_TOKEN_2') {
  $line = Select-String -Path $envPath -Pattern "^$k=(.+)$" -ErrorAction SilentlyContinue
  $len = if ($line) { $line.Matches.Groups[1].Value.Trim().Length } else { 0 }
  if ($len -lt 50) { $envOk = $false }
  # 주의: "$len자" 로 쓰면 한글이 변수명에 붙어 $len자 라는 없는 변수가 된다 (조용히 빈칸).
  $envMsg += "$k=$($len) 자"
}
if ((Get-Content $envPath -Raw) -match 'undefined') { $envOk = $false; $envMsg += '!!undefined 발견' }
Chk '.env 토큰' $envOk ($envMsg -join '  ')

# 6-2. 저장소 커밋 신원이 실명/회사 이메일이 아닌가  (2026-08-27 신설)
#
# ⛔ 2026-08-06 사고: 공개 레포 첫 커밋이 전역 gitconfig 를 그대로 써서
#    <실명 로마자> <회사 도메인 이메일> 이 올라갔다.
#    깃허브 Contributors 에도 실명이 표시됐고, 레포 삭제로만 지워졌다.
#    ⚠️ 이 파일은 공개 자료로 나간다 -- 실제 값을 여기 옮겨 적지 않는다.
#       2026-08-27 에 내가 옮겨 적었고, export-material 의 신원 스캔이 그걸 잡았다.
#    그때 절차를 정했다 -- "개인 프로젝트 레포는 git init 직후 로컬 user.email 부터 설정한다."
# ⛔⛔ 그런데 2026-08-26 에 새로 만든 저장소 둘(workspace / vault)이 그 절차를 안 지켰다.
#    문서에만 적힌 절차는 20일 뒤 새 저장소에서 지켜지지 않았다. 그래서 검사로 옮긴다.
# ★ 저장소를 하드코딩하지 않고 .git 을 찾아 돈다 -- 새로 만든 저장소가 자동으로 걸린다.
#    (하드코딩하면 "다음에 만들 저장소"를 정확히 놓친다. 이번에 놓친 방식이 그것이다)
# ⚠️ 전역 gitconfig 는 회사 저장소용이라 그대로 둔다. 검사 대상은 이 프로젝트 안뿐이다.
$idOk = $true; $idMsg = @()
$projRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$roots = Get-ChildItem -Path $projRoot -Filter '.git' -Recurse -Force -Depth 3 -ErrorAction SilentlyContinue |
         Where-Object { $_.FullName -notmatch '\\node_modules\\' }
foreach ($g in $roots) {
  $repo = Split-Path $g.FullName -Parent
  $mail = (& git -C $repo config user.email) 2>$null
  $short = Split-Path $repo -Leaf
  if (-not $mail) { $idOk = $false; $idMsg += "$short=설정없음(전역상속)" }
  elseif ($mail -notmatch 'users\.noreply\.github\.com$') { $idOk = $false; $idMsg += "$short=$mail" }
}
Chk '저장소 커밋 신원' $idOk $(if ($idOk) { "$($roots.Count)개 전부 noreply" } else { '실명/개인 이메일: ' + ($idMsg -join '  ') })

# 6-3. 공개 저장소에 실제로 올라간 작성자  (2026-08-27 신설)
#
# ⛔⛔ 바로 위 6-2 로는 못 잡는 구멍이 있다.
#    자료 저장소는 **임시 클론에서 푸시된다.** 푸시가 끝나면 클론이 사라져서
#    프로젝트 안의 .git 을 아무리 돌아도 안 보인다(2026-08-27 실측: 찾은 클론 0개).
#    실제로 그 경로로 `instagram-threads-autopublish` 에 실명+회사 도메인이 올라갔고,
#    08-06 에 같은 레포에서 같은 사고가 났었는데 20일 만에 재발했다.
# ★★★ 그래서 이 검사는 **전제가 아니라 결과**를 본다 — 원격 API 로 실제 작성자를 읽는다.
#    푸시가 어디서 이뤄졌든 걸린다.
# ⚠️ 네트워크가 없으면 판정 보류다(exit 0). 검사기가 못 돌았다고 발행 점검을 세우지 않는다.
$paOk = $true; $paMsg = ''
$paScript = Join-Path $PSScriptRoot '..\vault\check-public-authors.mjs'
if (-not (Test-Path $paScript)) {
  $paMsg = '검사기 없음 -- ' + $paScript
} elseif (-not (Test-Path $pin)) {
  $paMsg = '노드 없음 -- 판정 보류'
} else {
  $paOut = & $pin $paScript 2>&1
  if ($LASTEXITCODE -eq 0) {
    # ⚠️ 2026-08-28: 패턴이 안 맞으면 Select-String 이 null 을 주고 .ToString() 이 거기서 터진다.
    #    실제로 콘솔 인코딩이 다른 셸에서 실행하니 이 줄이 예외를 냈다(스케줄러 실행에서는 안 났다).
    #    ⛔ 판정(exit 0)은 이미 났는데 **표시하다가 터지는 것**이라, 사람이 「검사가 실패했다」로 오독한다.
    #    ▶ 매칭 실패는 그냥 문구가 없는 것이다. 터지지 않게 한다.
    $paHit = $paOut | Select-String -Pattern '^✅ 공개 저장소' | Select-Object -First 1
    $paMsg = if ($paHit) { $paHit.ToString() } else { '이상 없음' }
  } else {
    $paOk = $false
    $paMsg = (($paOut | Select-String -Pattern '^⛔ ') -join ' / ')
    if (-not $paMsg) { $paMsg = '검사기가 exit 1 -- 직접 실행해 볼 것' }
  }
}
Chk '공개 저장소 작성자' $paOk $paMsg

# 6-4. 신원 방어 ①②가 아직 설치돼 있는가  (2026-08-27 신설)
#
# ⛔ ①(includeIf)과 ②(pre-push 훅)는 **홈 디렉터리에 있다 = 버전관리 밖이다.**
#    윈도우를 다시 깔거나 파일이 사라지면 **조용히 무방비가 된다.**
#    어제 릴스 대본이 .gitignore 안에 있어 한 편을 잃은 것과 같은 모양이다.
# ▶ 그래서 리포에 정본을 두고(`vault/git-identity/`), 여기서 **설치본이 정본과 같은지**까지 본다.
#    "설치했다"와 "아직 설치돼 있다"는 다른 명제다.
$giOk = $true; $giMsg = @()
$srcDir  = Join-Path $PSScriptRoot '..\vault\git-identity'
$hookSrc = Join-Path $srcDir 'pre-push'
$cfgSrc  = Join-Path $srcDir 'gitconfig-dhenddl'

$hooksPath = (& git config --global core.hooksPath) 2>$null
if (-not $hooksPath) { $giOk = $false; $giMsg += 'core.hooksPath 없음' }
else {
  $hookDst = Join-Path $hooksPath 'pre-push'
  if (-not (Test-Path $hookDst)) { $giOk = $false; $giMsg += 'pre-push 훅 없음' }
  elseif (Test-Path $hookSrc) {
    $a = (Get-FileHash $hookDst -Algorithm SHA256).Hash
    $b = (Get-FileHash $hookSrc -Algorithm SHA256).Hash
    if ($a -ne $b) { $giOk = $false; $giMsg += 'pre-push 훅이 리포 정본과 다름' }
  }
}

# includeIf 는 키 이름에 URL 이 들어가 있어 이름으로 찾는다
$inc = (& git config --global --get-regexp '^includeIf\..*dhenddl.*\.path') 2>$null
if (-not $inc) { $giOk = $false; $giMsg += 'includeIf(dhenddl) 없음' }
else {
  $incPath = ($inc | Select-Object -First 1) -replace '^\S+\s+', ''
  if (-not (Test-Path $incPath)) { $giOk = $false; $giMsg += 'includeIf 가 가리키는 파일 없음' }
  elseif (Test-Path $cfgSrc) {
    $a = (Get-FileHash $incPath -Algorithm SHA256).Hash
    $b = (Get-FileHash $cfgSrc  -Algorithm SHA256).Hash
    if ($a -ne $b) { $giOk = $false; $giMsg += 'gitconfig-dhenddl 이 리포 정본과 다름' }
  }
}
Chk '신원 방어 설치상태' $giOk $(if ($giOk) { 'includeIf + pre-push 훅 · 정본과 일치' } else { ($giMsg -join '  ') })

# 7. 오늘자 데일리 브리핑이 생성됐는가 (결과 기반 카나리아)
#    2026-08-15 Claude 앱 OAuth 만료로 정기 브리핑이 6일간 안 돌았는데 아무도 몰랐다.
#    원인이 무엇이든 "결과물이 없다"는 사실 하나로 잡히므로 이 검사가 가장 넓다.
$brDir  = $BriefingDir
$brName = $BriefingName -f (Get-Date -Format 'yyyy-MM-dd')
$brFile = Join-Path $brDir $brName
$brDue  = (Get-Date) -ge (Get-Date -Hour 7 -Minute 0 -Second 0)
$brHas  = Test-Path $brFile
if (-not $brDue) {
  Chk '오늘자 브리핑' $true '07시 전이라 판정 보류'
} else {
  Chk '오늘자 브리핑' $brHas $(if ($brHas) { '있음  ' + (Get-Item $brFile).LastWriteTime.ToString('HH:mm') } else { '없음 -- 앱 로그인과 예약작업을 볼 것' })
}

# 8. Claude 앱 인증이 살아 있는가 (원인 기반 조기 경보)
#    2026-08-15 09:17:08 실제 로그: "Refresh token expired" 뒤 session_stale_relogin 으로 latch.
#    한 번 걸리면 앱이 재시도를 건너뛰어 사람이 재로그인할 때까지 자가 복구가 안 된다.
#    기준선은 마지막 로그인 시각이다 -- 그 전 실패는 이미 해소된 것이라 세지 않는다.
$appLog = Join-Path $env:APPDATA 'Claude\logs\main.log'
$credF  = Join-Path $env:USERPROFILE '.claude\.credentials.json'
$since  = (Get-Date).AddHours(-24)
$base   = '최근 24시간'
if (Test-Path $credF) {
  $loginAt = (Get-Item $credF).LastWriteTime
  if ($loginAt -gt $since) { $since = $loginAt; $base = '마지막 로그인 이후' }
}
if (Test-Path $appLog) {
  $bad = 0
  foreach ($ln in (Get-Content $appLog -Tail 20000 -ErrorAction SilentlyContinue)) {
    if ($ln -match 'session_stale_relogin|Refresh token expired') {
      if ($ln -match '^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})') {
        try {
          if ([datetime]::ParseExact($matches[1], 'yyyy-MM-dd HH:mm:ss', $null) -ge $since) { $bad++ }
        } catch {}
      }
    }
  }
  Chk 'Claude 앱 인증' ($bad -eq 0) $(if ($bad -eq 0) { $base + ' 인증 실패 없음' } else { $base + ' 실패 ' + $bad + ' 건 -- 앱에서 재로그인할 것' })
} elseif (-not $profOk) {
  Chk 'Claude 앱 인증' $true '보류 -- 스케줄러 실행'
} else {
  Chk 'Claude 앱 인증' $true '앱 로그 없음 -- 건너뜀'
}
# 9. Claude 앱 자동 시작이 켜져 있는가 (재부팅 내구성)
#    2026-08-21 23:29 Windows Update(Lenovo 드라이버)가 OS를 재시작했다. 크래시가 아니라
#    설정대로였다 -- 활성시간이 8~23시라 23시 종료 직후에 재시작 조건이 열린다.
#    Claude 앱과 VSCode는 자동시작이 없어서 안 켜졌고, 주말 내내 꺼진 상태로
#    브리핑이 8/22 . 8/23 결번됐다. 발행은 작업 스케줄러라 3건 전부 살았다.
#    ★ 카카오톡은 같은 재부팅을 겪고 30초 뒤 스스로 돌아왔다 -- 차이는 시작 등록뿐이었다.
#    재부팅을 막는 대신 재부팅을 견디게 만든 것이고, 이 검사가 그 설정을 지킨다.
#    MSIX 앱이라 설치 경로에 버전이 박혀 있다(업데이트마다 바뀐다). 그래서 경로가 아니라
#    startupTask 의 State 값을 본다. 2=Enabled, 4=EnabledByPolicy, 0/1=꺼짐.
$stKey = 'HKCU:\Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\SystemAppData\Claude_pzs8sxrjxfjjc\ClaudeStartup'
$stVal = (Get-ItemProperty $stKey -Name State -ErrorAction SilentlyContinue).State
$stOk  = ($stVal -eq 2 -or $stVal -eq 4)
if (-not $profOk) {
  Chk 'Claude 자동시작' $true '보류 -- 스케줄러 실행(HKCU\Software\Classes 매핑 다름)'
} else {
  Chk 'Claude 자동시작' $stOk $(if ($stOk) { "State=$stVal (켜짐)" } elseif ($null -eq $stVal) { '키 없음 -- 앱 재설치 또는 패키지명 변경 확인' } else { "State=$stVal (꺼짐) -- 재부팅되면 브리핑이 멈춘다" })
}

""
"===================== 결과: OK $ok / 이상 $ng ====================="
if ($ng -eq 0) { "전부 정상. 로그인 상태 그대로 두고 나가면 된다." }
else { "[!!] 항목을 확인할 것. 로그아웃하지 말 것." }

# ---------------------------------------------------------------------------
# 종료 코드 -- 2026-08-24 추가.
# 그전까지는 이상이 몇 건이든 exit 0 이었다. 그래서 8/22 재부팅 사고 때
# 이 스크립트가 원인(업데이트 일시중지 만료)과 결과(브리핑 없음)를 둘 다 잡고
# 있었는데도 아무도 몰랐다 -- 사람이 화면을 봐야만 알 수 있는 구조였다.
# 볼트 원칙: "경고로 두면 무시된다 -> 하드 실패."  이제 스케줄러에 물릴 수 있다.
# ---------------------------------------------------------------------------
if ($ng -gt 0) { exit 1 } else { exit 0 }
