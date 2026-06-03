$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PROJECT_ROOT = Split-Path -Parent $SCRIPT_DIR

$NOTE = Get-Content "$SCRIPT_DIR\exp-claude.md" -Raw

Set-Location $PROJECT_ROOT

claude --append-system-prompt @"
Project context:

$NOTE
"@