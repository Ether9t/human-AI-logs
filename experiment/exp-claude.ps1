$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$NOTE = Get-Content "$ROOT\analysis_ guideline.md" -Raw

Set-Location $ROOT

claude --append-system-prompt @"
Project context:

$NOTE
"@