Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
    param([Parameter(Mandatory=$true)][string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([Parameter(Mandatory=$true)][string]$Message)
    Write-Host "    $Message" -ForegroundColor Green
}

function Write-WarningLine {
    param([Parameter(Mandatory=$true)][string]$Message)
    Write-Host "    $Message" -ForegroundColor Yellow
}

function Test-Command {
    param([Parameter(Mandatory=$true)][string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

# ============================================================================
# Paths
# ============================================================================

# project-root/installer/uninstall.ps1
$InstallerDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path

# project-root/
$ProjectRoot = Split-Path -Parent $InstallerDirectory

# project-root/launcher/
$LauncherDirectory = Join-Path $ProjectRoot "launcher"

# ============================================================================
# Header / confirmation
# ============================================================================

Clear-Host
Write-Host ""
Write-Host "====================================================" -ForegroundColor Yellow
Write-Host " Human-AI Experiment Environment Uninstaller" -ForegroundColor Yellow
Write-Host "====================================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "This removes experiment-specific components:" -ForegroundColor White
Write-Host "  - claude-exp npm link"
Write-Host "  - Claude Code global npm package"
Write-Host "  - SpecStory VS Code extension"
Write-Host "  - Notebook Edit Tracker VS Code extension (when identifiable)"
Write-Host "  - Saved user ANTHROPIC_API_KEY"
Write-Host "  - Entire repository integration when supported"
Write-Host ""
Write-Host "By default it PRESERVES:" -ForegroundColor White
Write-Host "  - Git"
Write-Host "  - Scoop"
Write-Host "  - Node.js / npm"
Write-Host "  - VS Code"
Write-Host "  - project files, .git, tasks, and .specstory history"
Write-Host ""

$Answer = Read-Host "Continue? [y/N]"
if ($Answer -notmatch '^(?i:y|yes)$') {
    Write-Host "Uninstall cancelled."
    exit 0
}

try {
    # ------------------------------------------------------------------------
    # Entire repository integration
    # ------------------------------------------------------------------------

    Write-Step "Disabling Entire for this repository"

    if (Test-Command "entire") {
        Push-Location $ProjectRoot
        try {
            $Help = (& entire --help 2>&1 | Out-String)
            if ($Help -match '(?m)^\s*disable\b') {
                & entire disable
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "Entire disabled for this repository."
                }
                else {
                    Write-WarningLine "Entire disable returned a non-zero exit code; continuing."
                }
            }
            else {
                Write-WarningLine "This Entire version does not advertise a 'disable' command; repository data was preserved."
            }
        }
        finally {
            Pop-Location
        }
    }
    else {
        Write-WarningLine "Entire CLI is not available; repository data was preserved."
    }

    # ------------------------------------------------------------------------
    # claude-exp launcher
    # ------------------------------------------------------------------------

    Write-Step "Removing claude-exp launcher"

    if (Test-Path $LauncherDirectory) {
        Push-Location $LauncherDirectory
        try {
            if (Test-Command "npm") {
                & npm unlink --global 2>$null
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "claude-exp npm link removed."
                }
                else {
                    Write-WarningLine "npm unlink did not complete cleanly; continuing."
                }
            }
            else {
                Write-WarningLine "npm is unavailable; claude-exp link could not be removed automatically."
            }
        }
        finally {
            Pop-Location
        }
    }
    else {
        Write-WarningLine "Launcher directory not found; skipping npm unlink."
    }

    # ------------------------------------------------------------------------
    # Claude Code
    # ------------------------------------------------------------------------

    Write-Step "Removing Claude Code"

    if (Test-Command "npm") {
        & npm uninstall --global @anthropic-ai/claude-code
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Claude Code global npm package removed."
        }
        else {
            Write-WarningLine "Claude Code uninstall returned a non-zero exit code; continuing."
        }
    }
    else {
        Write-WarningLine "npm is unavailable; Claude Code was not changed."
    }

    # ------------------------------------------------------------------------
    # SpecStory VS Code extension
    # ------------------------------------------------------------------------

    Write-Step "Removing SpecStory VS Code extension"

    if (Test-Command "code") {
        $Extensions = @(& code --list-extensions 2>$null | ForEach-Object { $_.Trim() })

        if ($Extensions -contains "SpecStory.specstory-vscode") {
            & code --uninstall-extension "SpecStory.specstory-vscode"
            if ($LASTEXITCODE -eq 0) {
                Write-Success "SpecStory VS Code extension removed."
            }
            else {
                Write-WarningLine "SpecStory extension uninstall returned a non-zero exit code; continuing."
            }
        }
        else {
            Write-Success "SpecStory VS Code extension is not installed."
        }
    }
    else {
        Write-WarningLine "VS Code CLI is unavailable; extensions were not changed."
    }

    # ------------------------------------------------------------------------
    # Notebook Edit Tracker
    # ------------------------------------------------------------------------

    Write-Step "Removing Notebook Edit Tracker"

    if (Test-Command "code") {
        $Extensions = @(& code --list-extensions 2>$null | ForEach-Object { $_.Trim() })

        # The installer installs a local VSIX, so its extension ID is not
        # available from setup.ps1. Find a uniquely matching installed ID.
        $NotebookMatches = @(
            $Extensions | Where-Object {
                $_ -match '(?i)notebook.*edit.*tracker|edit.*tracker.*notebook'
            }
        )

        if ($NotebookMatches.Count -eq 1) {
            & code --uninstall-extension $NotebookMatches[0]
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Notebook Edit Tracker removed."
            }
            else {
                Write-WarningLine "Notebook Edit Tracker uninstall returned a non-zero exit code; continuing."
            }
        }
        elseif ($NotebookMatches.Count -gt 1) {
            Write-WarningLine ("Multiple possible Notebook Edit Tracker extension IDs found: " + ($NotebookMatches -join ", "))
            Write-WarningLine "None were removed automatically."
        }
        else {
            Write-WarningLine "Notebook Edit Tracker extension ID could not be identified automatically."
        }
    }

    # ------------------------------------------------------------------------
    # Anthropic API key
    # ------------------------------------------------------------------------

    Write-Step "Removing saved Anthropic API key"

    [Environment]::SetEnvironmentVariable(
        "ANTHROPIC_API_KEY",
        $null,
        "User"
    )

    Remove-Item Env:ANTHROPIC_API_KEY -ErrorAction SilentlyContinue
    Write-Success "User ANTHROPIC_API_KEY removed."

    # ------------------------------------------------------------------------
    # Optional CLI cleanup
    # ------------------------------------------------------------------------

    Write-Step "Optional cleanup"

    Write-Host ""
    Write-Host "Entire CLI and Git are preserved because they may have existed before setup." -ForegroundColor White
    Write-Host "Scoop itself is also preserved." -ForegroundColor White
    Write-Host ""

    if (Test-Command "scoop") {
        $RemoveEntire = Read-Host "Also uninstall Entire CLI installed through Scoop? [y/N]"
        if ($RemoveEntire -match '^(?i:y|yes)$') {
            & scoop uninstall entire
            if ($LASTEXITCODE -ne 0) {
                & scoop uninstall entire/cli
            }

            if ($LASTEXITCODE -eq 0) {
                Write-Success "Entire CLI removed."
            }
            else {
                Write-WarningLine "Entire CLI could not be removed automatically."
            }

            $Buckets = (& scoop bucket list 2>$null | Out-String)
            if ($Buckets -match '(?m)^entire\s') {
                $RemoveBucket = Read-Host "Also remove the Entire Scoop bucket? [y/N]"
                if ($RemoveBucket -match '^(?i:y|yes)$') {
                    & scoop bucket rm entire
                    if ($LASTEXITCODE -eq 0) {
                        Write-Success "Entire Scoop bucket removed."
                    }
                }
            }
        }

        $RemoveGit = Read-Host "Also uninstall Git through Scoop? [y/N]"
        if ($RemoveGit -match '^(?i:y|yes)$') {
            & scoop uninstall git
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Scoop Git removed."
            }
            else {
                Write-WarningLine "Git could not be removed through Scoop."
            }
        }
    }

    Write-Host ""
    Write-Host "====================================================" -ForegroundColor Green
    Write-Host " Uninstall completed" -ForegroundColor Green
    Write-Host "====================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Project source files, tasks, .git, Node.js, npm, VS Code, and Scoop were preserved unless you explicitly chose otherwise."
    Write-Host ""
}
catch {
    Write-Host ""
    Write-Host "====================================================" -ForegroundColor Red
    Write-Host " Uninstall encountered an error" -ForegroundColor Red
    Write-Host "====================================================" -ForegroundColor Red
    Write-Host ""
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}