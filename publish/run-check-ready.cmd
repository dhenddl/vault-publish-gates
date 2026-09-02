@echo off
setlocal
REM ---------------------------------------------------------------
REM  ASCII ONLY. Do NOT put Korean text or emoji in this file.
REM  2026-08-11: Korean REM comments silently broke cmd parsing and
REM  the script still returned exit 0 (false success).
REM
REM  Why this wrapper exists (2026-08-24):
REM    1) SHELL PIN. check-ready.ps1 contains Korean. PowerShell 5.1
REM       reads a BOM-less UTF-8 file as cp949 and dies with parse
REM       errors. The .ps1 now carries a UTF-8 BOM so 5.1 works too,
REM       but we still pin pwsh 7 because that is what we verify with.
REM    2) LOG. The 2026-08-22 reboot incident showed the check was
REM       catching both the cause and the effect, and nobody ran it.
REM       Output is appended so there is a history to read later.
REM    3) EXIT CODE. check-ready.ps1 returns 1 when any item is [!!]
REM       (added 2026-08-24). Task Scheduler stores it as
REM       LastTaskResult, so a bad morning is visible without opening
REM       the log.
REM
REM  Usage:
REM    run-check-ready.cmd        run the check, append to log
REM ---------------------------------------------------------------
REM  ★ 2026-08-24: chcp 65001 is REQUIRED.
REM  Without it the console code page is cp949 (Korean Windows) and the
REM  ">>" redirect stores pwsh's UTF-8 output as cp949 bytes. The log then
REM  reads back as garbage in any UTF-8 reader -- a log that exists but
REM  cannot be read. Same class of failure as leaving no log at all.
chcp 65001 > nul

set "HERE=%~dp0"
set "PWSH=C:\Program Files\PowerShell\7\pwsh.exe"
if not exist "%PWSH%" set "PWSH=powershell.exe"
set "LOG=%HERE%logs\check-ready.log"

REM  Tell the script this is an unattended run. The scheduler maps the
REM  HKCU\Software\Classes hive differently, so two profile-dependent
REM  checks (Claude autostart State, Claude app auth log) cannot be
REM  trusted here. Better to hold them than to raise a false alarm --
REM  a check that cries wolf gets ignored, which is the failure we are
REM  trying to fix in the first place.
set "CHECKREADY_SCHEDULED=1"

if not exist "%HERE%logs" mkdir "%HERE%logs"

echo ==================== >> "%LOG%"
"%PWSH%" -NoProfile -ExecutionPolicy Bypass -File "%HERE%check-ready.ps1" >> "%LOG%" 2>&1
set "RC=%ERRORLEVEL%"
echo [exit %RC%] >> "%LOG%"

REM Echo the tail so a human running this by hand sees the result.
"%PWSH%" -NoProfile -Command "Get-Content -LiteralPath $env:LOG -Tail 22"

endlocal & exit /b %RC%
