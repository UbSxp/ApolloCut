import base64
script = r'''<# 
.SYNOPSIS
    Cria checkpoint Git do projeto sem alterar HEAD, branch nem índice real.
.DESCRIPTION
    Cria branch temporária _checkpoint_work, faz add+commit nela, cria ref refs/checkpoints/AAAAMMDD-HHMMSS
    apontando para o commit, depois remove a branch temporária.
    Faz poda (mantém últimos 50 checkpoints).
    Aborta se detectar segredos em arquivos não ignorados.
.NOTES
    Requer: git no PATH. Projeto deve ser repositório git.
#>

param(
    [string]$ProjectPath = (Get-Location).Path,
    [int]$MaxCheckpoints = 50,
    [string]$LogPath = "$ProjectPath\.opencode\checkpoint.log"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Log {
    param([string]$Msg, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] [$Level] $Msg"
    try {
        $logDir = Split-Path $LogPath -Parent
        if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
        Add-Content -Path $LogPath -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
    } catch {}
    Write-Host $line
}

function Test-SecretPatterns {
    param([string[]]$Files)
    $sq = "'"
    $p1 = "(?i)(api[_-]?key|secret|token|password|passwd|credential)\s*[:=]\s*[" + $sq + "]?[a-zA-Z0-9_\-]{16,}"
    $p2 = "(?i)(sk-[a-zA-Z0-9]{32,})"
    $p3 = "(?i)(gh[pousr]_[a-zA-Z0-9]{36,})"
    $p4 = "(?i)(xox[baprs]-[a-zA-Z0-9-]{10,})"
    $p5 = "(?i)(AKIA[0-9A-Z]{16})"
    $p6 = "(?i)(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)"
    $patterns = @($p1, $p2, $p3, $p4, $p5, $p6)
    $found = @()
    foreach ($file in $Files) {
        if (-not (Test-Path $file)) { continue }
        $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
        if (-not $content) { continue }
        foreach ($pat in $patterns) {
            if ($content -match $pat) {
                $found += "$file : $($matches[0].Substring(0, [Math]::Min(80, $matches[0].Length)))"
            }
        }
    }
    return $found
}

Write-Log "=== Iniciando checkpoint ==="
$repoRoot = git -C $ProjectPath rev-parse --show-toplevel 2>$null
if (-not $repoRoot) {
    Write-Log "Não é repositório git: $ProjectPath" "ERROR"
    exit 1
}
Write-Log "Repositório: $repoRoot"

git -C $repoRoot config user.email "apollocut@local" 2>$null
git -C $repoRoot config user.name "ApolloCut Agent" 2>$null

$currentBranch = git -C $repoRoot rev-parse --abbrev-ref HEAD

$gitignore = Join-Path $repoRoot ".gitignore"
if (-not (Test-Path $gitignore)) {
    Write-Log ".gitignore não encontrado — criando básico" "WARN"
    @"
# Dependencies
node_modules/

# Build outputs
dist/
build/
*.wasm

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
Thumbs.db
.DS_Store

# Temporary
*.tmp
*.temp
*.bak
*~

# Cache
.cache/
.eslintcache
.stylelintcache

# Coverage
coverage/

# Local config
.env
.env.local
"@ | Set-Content -Path $gitignore -Encoding UTF8
}

$pid = $PID
$tempBranch = "_checkpoint_work_" + $pid
Write-Log "Criando branch temporária: " + $tempBranch
git -C $repoRoot checkout -b $tempBranch HEAD 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Log "Falha ao criar branch temporária" "ERROR"
    exit 1
}

try {
    Write-Log "Adicionando arquivos modificados..."
    $addResult = git -C $repoRoot add -A 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Log "git add falhou: " + $addResult "ERROR"
        exit 1
    }

    $status = git -C $repoRoot status --porcelain 2>$null
    if (-not $status -or $status.Trim() -eq "") {
        Write-Log "Nenhuma alteração no working tree — nada para checkpoint" "WARN"
        exit 0
    }

    $stagedFiles = git -C $repoRoot diff --cached --name-only
    $secretHits = Test-SecretPatterns $stagedFiles
    if ($secretHits.Count -gt 0) {
        Write-Log "SEGREDOS DETECTADOS em arquivos staged — abortando checkpoint" "ERROR"
        $secretHits | ForEach-Object { Write-Log "  $_" "ERROR" }
        Write-Log "Adicione ao .gitignore ou remova os segredos antes de continuar." "ERROR"
        exit 1
    }

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $shortMsg = "checkpoint " + $timestamp
    $changedCount = ($stagedFiles | Measure-Object).Count
    if ($changedCount -gt 0) {
        $shortMsg = $shortMsg + " (" + $changedCount + " arquivos)"
    }

    Write-Log "Criando commit: " + $shortMsg
    git -C $repoRoot commit -m $shortMsg 2>&1 | ForEach-Object { Write-Log $_ }
    if ($LASTEXITCODE -ne 0) {
        Write-Log "Falha ao criar commit" "ERROR"
        exit 1
    }
    $commitHash = git -C $repoRoot rev-parse HEAD

    $refName = "refs/checkpoints/" + $timestamp
    git -C $repoRoot update-ref $refName $commitHash
    Write-Log "Checkpoint criado: " + $refName + " -> " + $commitHash
    Write-Log "Mensagem: " + $shortMsg

    Write-Log "Verificando poda (max " + $MaxCheckpoints + ")..."
    $allRefs = git -C $repoRoot for-each-ref --sort=-creatordate --format="%(refname)" "refs/checkpoints/*"
    $count = 0
    foreach ($ref in $allRefs) {
        $count++
        if ($count -gt $MaxCheckpoints) {
            git -C $repoRoot update-ref -d $ref 2>$null
            Write-Log "Poda: removido " + $ref + " (excede " + $MaxCheckpoints + ")"
        }
    }

    $refs = git -C $repoRoot for-each-ref --sort=-creatordate --format="%(refname) %(creatordate:short)" "refs/checkpoints/*"
    $all = @($refs -split "`n" | Where-Object { $_ })
    if ($all.Count -ge 2) {
        $prevRef = $all[1].Split(" ")[0]
        $diff = git -C $repoRoot diff --name-only $prevRef $refName 2>$null
        if ($diff) {
            Write-Log "Arquivos alterados desde checkpoint anterior:"
            $diff.Split("`n") | ForEach-Object { if ($_ ) { Write-Log "  " + $_ } }
        }
    }
} finally {
    Write-Log "Voltando para branch original: " + $currentBranch
    git -C $repoRoot switch $currentBranch 2>$null
    Write-Log "Removendo branch temporária: " + $tempBranch
    git -C $repoRoot branch -D $tempBranch 2>$null
}

Write-Log "=== Checkpoint concluído ==="
exit 0
'''

with open('C:/Users/DUARDIN/ApolloCut/tools/checkpoint.ps1', 'w', encoding='utf-8') as f:
    f.write(script)
print('Done')