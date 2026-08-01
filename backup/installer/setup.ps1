$ErrorActionPreference = "Stop"

# ============================================================================
# Helper functions
# ============================================================================

function Write-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Success {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    Write-Host "    $Message" -ForegroundColor Green
}

function Test-Command {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command
    )

    return $null -ne (
        Get-Command $Command -ErrorAction SilentlyContinue
    )
}

function Update-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable(
        "Path",
        "Machine"
    )

    $userPath = [Environment]::GetEnvironmentVariable(
        "Path",
        "User"
    )

    $env:Path = "$machinePath;$userPath"
}

function Convert-SecureStringToPlainText {
    param(
        [Parameter(Mandatory = $true)]
        [System.Security.SecureString]$SecureString
    )

    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
        $SecureString
    )

    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
            $pointer
        )
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR(
            $pointer
        )
    }
}

# ============================================================================
# Paths
# ============================================================================

# project-root/installer/
$InstallerDirectory = Split-Path `
    -Parent `
    $MyInvocation.MyCommand.Path

# project-root/
$ProjectRoot = Split-Path `
    -Parent `
    $InstallerDirectory

# project-root/launcher/
$LauncherDirectory = Join-Path `
    $ProjectRoot `
    "launcher"

# project-root/tasks/
$TasksDirectory = Join-Path `
    $ProjectRoot `
    "tasks"

# project-root/installer/notebook-edit-tracker-0.0.1.vsix
$VsixPath = Join-Path `
    $InstallerDirectory `
    "notebook-edit-tracker-0.0.1.vsix"

# ============================================================================
# Header
# ============================================================================

Clear-Host

Write-Host ""
Write-Host "====================================================" `
    -ForegroundColor Green
Write-Host " Human-AI Experiment Environment Installer" `
    -ForegroundColor Green
Write-Host "====================================================" `
    -ForegroundColor Green

Write-Host ""
Write-Host "This installer will configure:" `
    -ForegroundColor White
Write-Host "  1. Node.js and npm check"
Write-Host "  2. Scoop"
Write-Host "  3. Git"
Write-Host "  4. Claude Code"
Write-Host "  5. Anthropic API key"
Write-Host "  6. Notebook Edit Tracker VS Code extension"
Write-Host "  7. claude-exp launcher"

Write-Host ""
Read-Host "Press ENTER to begin installation"

# ============================================================================
# Installation
# ============================================================================

try {

    # ------------------------------------------------------------------------
    # Validate project files
    # ------------------------------------------------------------------------

    Write-Step "Checking experiment files"

    if (-not (Test-Path $LauncherDirectory)) {
        throw "Launcher directory not found: $LauncherDirectory"
    }

    $PackageJsonPath = Join-Path `
        $LauncherDirectory `
        "package.json"

    if (-not (Test-Path $PackageJsonPath)) {
        throw "package.json not found: $PackageJsonPath"
    }

    if (-not (Test-Path $VsixPath)) {
        throw "VS Code extension not found: $VsixPath"
    }

    # Git does not preserve empty folders, so create tasks/ when needed.
    if (-not (Test-Path $TasksDirectory)) {
        New-Item `
            -ItemType Directory `
            -Path $TasksDirectory `
            -Force |
            Out-Null
    }

    Write-Success "Experiment files found."

    # ------------------------------------------------------------------------
    # PowerShell execution policy
    # ------------------------------------------------------------------------

    Write-Step "Checking PowerShell execution policy"

    $CurrentPolicy = Get-ExecutionPolicy `
        -Scope CurrentUser

    if (
        $CurrentPolicy -eq "Restricted" -or
        $CurrentPolicy -eq "Undefined"
    ) {
        Set-ExecutionPolicy `
            -ExecutionPolicy RemoteSigned `
            -Scope CurrentUser `
            -Force

        Write-Success "Execution policy set to RemoteSigned."
    }
    else {
        Write-Success "Execution policy is already compatible."
    }

    # ------------------------------------------------------------------------
    # Node.js and npm
    # ------------------------------------------------------------------------

    Write-Step "Checking Node.js and npm"

    if (-not (Test-Command "node")) {
        throw @"
Node.js is not installed.

Install the current Node.js LTS version, then run this installer again.
"@
    }

    if (-not (Test-Command "npm")) {
        throw "npm is not available."
    }

    $NodeVersion = node --version
    $NpmVersion = npm --version

    Write-Host "    Node.js: $NodeVersion"
    Write-Host "    npm:     $NpmVersion"

    Write-Success "Node.js and npm are available."

    # ------------------------------------------------------------------------
    # Scoop
    # ------------------------------------------------------------------------

    Write-Step "Installing Scoop"

    if (-not (Test-Command "scoop")) {
        Invoke-RestMethod `
            -Uri "https://get.scoop.sh" |
            Invoke-Expression

        Update-ProcessPath

        Write-Success "Scoop installed."
    }
    else {
        Write-Success "Scoop is already installed."
    }

    if (-not (Test-Command "scoop")) {
        throw @"
Scoop was installed, but the scoop command is not available.

Close PowerShell, open a new PowerShell window, and run setup.ps1 again.
"@
    }

    # ------------------------------------------------------------------------
    # Git
    # ------------------------------------------------------------------------

    Write-Step "Installing Git"

    if (-not (Test-Command "git")) {
        scoop install git

        Update-ProcessPath

        Write-Success "Git installed."
    }
    else {
        Write-Success "Git is already installed."
    }

    if (-not (Test-Command "git")) {
        throw "Git installation completed, but the git command is unavailable."
    }

    $GitVersion = git --version
    Write-Host "    $GitVersion"

    # ------------------------------------------------------------------------
    # Claude Code
    # ------------------------------------------------------------------------

    Write-Step "Installing Claude Code"

    npm install `
        --global `
        @anthropic-ai/claude-code

    if ($LASTEXITCODE -ne 0) {
        throw "Claude Code installation failed."
    }

    # npm global commands on Windows live in npm's global prefix directory.
    $NpmGlobalPrefix = (npm prefix -g).Trim()

    if ([string]::IsNullOrWhiteSpace($NpmGlobalPrefix)) {
        throw "Unable to determine the npm global prefix."
    }

    $UserPath = [Environment]::GetEnvironmentVariable(
        "Path",
        "User"
    )

    $UserPathEntries = @(
        $UserPath -split ";" |
        Where-Object {
            -not [string]::IsNullOrWhiteSpace($_)
        }
    )

    if ($UserPathEntries -notcontains $NpmGlobalPrefix) {
        $NewUserPath = (
            @($UserPathEntries + $NpmGlobalPrefix) |
            Select-Object -Unique
        ) -join ";"

        [Environment]::SetEnvironmentVariable(
            "Path",
            $NewUserPath,
            "User"
        )
    }

    Update-ProcessPath

    if (-not (Test-Command "claude")) {
        throw @"
Claude Code was installed, but the claude command is unavailable.

npm global prefix:
    $NpmGlobalPrefix

Close PowerShell, open a new PowerShell window, and run setup.ps1 again.
"@
    }

    $ClaudeVersion = claude --version
    Write-Host "    Claude Code: $ClaudeVersion"

    Write-Success "Claude Code installed."

    # ------------------------------------------------------------------------
    # Anthropic API key
    # ------------------------------------------------------------------------

    Write-Step "Configuring the experiment API key"

    Write-Host ""
    Write-Host "Enter the experiment Anthropic API key." `
        -ForegroundColor Yellow
    Write-Host "The characters will not be displayed while typing." `
        -ForegroundColor DarkGray
    Write-Host ""

    $SecureApiKey = Read-Host `
        "Anthropic API Key" `
        -AsSecureString

    $ApiKey = Convert-SecureStringToPlainText `
        $SecureApiKey

    if ([string]::IsNullOrWhiteSpace($ApiKey)) {
        throw "The Anthropic API key cannot be empty."
    }

    if (-not $ApiKey.StartsWith("sk-")) {
        Write-Host ""
        Write-Host (
            "Warning: The entered value does not begin with 'sk-'."
        ) -ForegroundColor Yellow

        $ContinueWithKey = Read-Host `
            "Continue with this key? Enter Y to continue"

        if ($ContinueWithKey -notmatch "^[Yy]$") {
            throw "API key configuration cancelled."
        }
    }

    # Save for future PowerShell sessions.
    [Environment]::SetEnvironmentVariable(
        "ANTHROPIC_API_KEY",
        $ApiKey,
        "User"
    )

    # Make it available immediately in this process.
    $env:ANTHROPIC_API_KEY = $ApiKey

    # Remove temporary plaintext value.
    $ApiKey = $null
    $SecureApiKey.Dispose()

    Write-Success "Anthropic API key configured."

    # ------------------------------------------------------------------------
    # Notebook Edit Tracker VS Code extension
    # ------------------------------------------------------------------------

    Write-Step "Installing Notebook Edit Tracker"

    if (-not (Test-Command "code")) {
        throw @"
The VS Code command-line command 'code' is unavailable.

Make sure Visual Studio Code is installed and its command-line tool is
available in PATH, then run setup.ps1 again.

You can test this by opening a new PowerShell window and running:

    code --version
"@
    }

    code `
        --install-extension `
        $VsixPath `
        --force

    if ($LASTEXITCODE -ne 0) {
        throw "VS Code failed to install the Notebook Edit Tracker extension."
    }

    Write-Success "Notebook Edit Tracker installed."

    # ------------------------------------------------------------------------
    # Experiment launcher
    # ------------------------------------------------------------------------

    Write-Step "Installing the claude-exp launcher"

    Push-Location $LauncherDirectory

    try {
        npm install

        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed in the launcher directory."
        }

        npm link

        if ($LASTEXITCODE -ne 0) {
            throw "npm link failed in the launcher directory."
        }
    }
    finally {
        Pop-Location
    }

    $NpmGlobalPrefix = (npm prefix -g).Trim()

    if ([string]::IsNullOrWhiteSpace($NpmGlobalPrefix)) {
        throw "Unable to determine the npm global prefix."
    }

    $UserPath = [Environment]::GetEnvironmentVariable(
        "Path",
        "User"
    )

    $UserPathEntries = @(
        $UserPath -split ";" |
        Where-Object {
            -not [string]::IsNullOrWhiteSpace($_)
        }
    )

    if ($UserPathEntries -notcontains $NpmGlobalPrefix) {
        $NewUserPath = (
            @($UserPathEntries + $NpmGlobalPrefix) |
            Select-Object -Unique
        ) -join ";"

        [Environment]::SetEnvironmentVariable(
            "Path",
            $NewUserPath,
            "User"
        )
    }

    Update-ProcessPath

    if (-not (Test-Command "claude-exp")) {
        throw @"
The launcher was linked, but the claude-exp command is unavailable.

npm global prefix:
    $NpmGlobalPrefix

Close PowerShell, open a new PowerShell window, and run:

    claude-exp 1
"@
    }

    Write-Success "claude-exp launcher installed."
    Write-Host "    $((Get-Command claude-exp).Source)"

    # ------------------------------------------------------------------------
    # Git repository initialization
    # ------------------------------------------------------------------------

    Write-Step "Checking experiment Git repository"

    $GitDirectory = Join-Path `
        $ProjectRoot `
        ".git"

    if (-not (Test-Path $GitDirectory)) {
        Push-Location $ProjectRoot

        try {
            git init

            if ($LASTEXITCODE -ne 0) {
                throw "Unable to initialize the Git repository."
            }
        }
        finally {
            Pop-Location
        }

        Write-Success "Git repository initialized."
    }
    else {
        Write-Success "Git repository already exists."
    }

    # ------------------------------------------------------------------------
    # Final verification
    # ------------------------------------------------------------------------

    Write-Step "Verifying installation"

    $MissingCommands = @()

    foreach (
        $Command in @(
            "git",
            "claude",
            "claude-exp",
            "code"
        )
    ) {
        if (-not (Test-Command $Command)) {
            $MissingCommands += $Command
        }
    }

    if ($MissingCommands.Count -gt 0) {
        throw (
            "The following commands are unavailable: " +
            ($MissingCommands -join ", ")
        )
    }

    $SavedApiKey = [Environment]::GetEnvironmentVariable(
        "ANTHROPIC_API_KEY",
        "User"
    )

    if ([string]::IsNullOrWhiteSpace($SavedApiKey)) {
        throw "The Anthropic API key was not saved."
    }

    # Do not print the key.
    $SavedApiKey = $null

    # ------------------------------------------------------------------------
    # Success
    # ------------------------------------------------------------------------

    Write-Host ""
    Write-Host "====================================================" `
        -ForegroundColor Green
    Write-Host " Installation completed successfully" `
        -ForegroundColor Green
    Write-Host "====================================================" `
        -ForegroundColor Green

    Write-Host ""
    Write-Host "Installed and configured:" `
        -ForegroundColor White
    Write-Host "  - Scoop"
    Write-Host "  - Git"
    Write-Host "  - Claude Code"
    Write-Host "  - Experiment Anthropic API key"
    Write-Host "  - Notebook Edit Tracker"
    Write-Host "  - claude-exp launcher"

    Write-Host ""
    Write-Host "You can now start a task with:" `
        -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    claude-exp 1" `
        -ForegroundColor White
    Write-Host ""

    Write-Host (
        "A newly opened terminal will also have access to the saved API key."
    ) -ForegroundColor DarkGray

    Write-Host ""
    Read-Host "Press ENTER to close"
}
catch {
    Write-Host ""
    Write-Host "====================================================" `
        -ForegroundColor Red
    Write-Host " Installation failed" `
        -ForegroundColor Red
    Write-Host "====================================================" `
        -ForegroundColor Red

    Write-Host ""
    Write-Host $_.Exception.Message `
        -ForegroundColor Red

    Write-Host ""
    Write-Host "Fix the issue above and run setup.ps1 again." `
        -ForegroundColor Yellow

    Write-Host ""
    Read-Host "Press ENTER to close"

    exit 1
}