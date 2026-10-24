<# 
.SYNOPSIS
    Cria checkpoint Git do projeto sem alterar HEAD, branch nem índice real.
.DESCRIPTION
    Cria branch temporária, faz add+commit nela, cria ref refs/checkpoints/AAAAMMDD-HHMMSS,
    depois remove a branch temporária. Faz poda (últimos 50).
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
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$Level] $Msg"
    try {
        $d = Split-Path $LogPath -Parent
        if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
        Add-Content -Path $LogPath -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
    } catch {}
    Write-Host $line
}

function Test-Secrets {
    param([string[]]$Files)
    $patterns = @(
        '(?i)(api[_-]?key|secret|token|password|passwd|credential)\s*[:=]\s*["' + "'" + ']?[a-zA-Z0-9_\-]{16,}',
        '(?i)(sk-[a-zA-Z0-9]{32,})',
        '(?i)(gh[pousr]_[a-zA-Z0-9]{36,})',
        '(?i)(AKIA[0-9A-Z]{16})',
        '(?i)(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)'
    )
    $found = @()
    foreach ($f in $Files) {
        if (-not (Test-Path $f)) { continue }
        $c = Get-Content $f -Raw -ErrorAction SilentlyContinue
        if (-not $c) { continue }
        foreach ($p in $patterns) {
            if ($c -match $p) {
                $found += $f
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

# Garante identidade git local
git -C $repoRoot config user.email "apollocut@local" 2>$null
git -C $repoRoot config user.name "ApolloCut Agent" 2>$null

# Guarda branch atual
$currentBranch = git -C $repoRoot rev-parse --abbrev-ref HEAD
Write-Log "Branch atual: $currentBranch"

# Verifica .gitignore
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
"@ | Set-Content -Path $gitignore -Encoding UTF8
}

# Cria branch temporária
$procId = [System.Diagnostics.Process]::GetCurrentProcess().Id
$tempBranch = "_ckpt_" + $procId
Write-Log "Criando branch temporária: $tempBranch"
git -C $repoRoot checkout -b $tempBranch HEAD 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Log "Falha ao criar branch temporária" "ERROR"
    exit 1
}
Write-Log "Branch temporária criada com sucesso"

try {
    # Adiciona tudo
    Write-Log "Adicionando arquivos..."
    $addResult = git -C $repoRoot add -A 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Log "git add falhou" "ERROR"
        exit 1
    }
    Write-Log "Arquivos adicionados"

    # Verifica se há mudanças
    $status = git -C $repoRoot status --porcelain 2>$null
    if (-not $status -or $status.Trim() -eq "") {
        Write-Log "Nenhuma alteração - nada para checkpoint" "WARN"
        exit 0
    }
    Write-Log "Mudanças detectadas, criando commit..."

    # Verifica segredos
    $stagedFiles = git -C $repoRoot diff --cached --name-only
    $secretHits = Test-Secrets $stagedFiles
    if ($secretHits.Count -gt 0) {
        Write-Log "SEGREDOS DETECTADOS: $($secretHits -join ', ')" "ERROR"
        exit 1
    }
    Write-Log "Sem segredos detectados"

    # Cria commit
    $ts = Get-Date -Format "yyyyMMdd-HHmmss"
    $msg = "checkpoint $ts"
    $cnt = ($stagedFiles | Measure-Object).Count
    if ($cnt -gt 0) { $msg = "$msg ($cnt arquivos)" }
    Write-Log "Criando commit: $msg"
    git -C $repoRoot commit -m $msg 2>&1 | ForEach-Object { Write-Log $_ }
    if ($LASTEXITCODE -ne 0) {
        Write-Log "Falha ao criar commit" "ERROR"
        exit 1
    }
    $commitHash = git -C $repoRoot rev-parse HEAD
    Write-Log "Commit criado: $commitHash"

    # Cria ref
    $ts2 = Get-Date -Format "yyyyMMdd-HHmmss"
    $refName = "refs/checkpoints/$ts2"
    git -C $repoRoot update-ref $refName $commitHash
    Write-Log "Checkpoint criado: $refName -> $commitHash"
    Write-Log "Mensagem: $msg"

    # Poda
    Write-Log "Verificando poda (max $MaxCheckpoints)..."
    $allRefs = git -C $repoRoot for-each-ref --sort=-creatordate --format="%(refname)" "refs/checkpoints/*"
    $count = 0
    foreach ($ref in $allRefs) {
        $count++
        if ($count -gt $MaxCheckpoints) {
            git -C $repoRoot update-ref -d $ref 2>$null
            Write-Log "Poda: removido $ref"
        }
    }

    # Diff vs anterior
    $refs = git -C $repoRoot for-each-ref --sort=-creatordate --format="%(refname) %(creatordate:short)" "refs/checkpoints/*"
    $all = @($refs -split "`n" | Where-Object { $_ })
    if ($all.Count -ge 2) {
        $prevRef = $all[1].Split(" ")[0]
        $diff = git -C $repoRoot diff --name-only $prevRef $refName 2>$null
        if ($diff) {
            Write-Log "Arquivos alterados desde último checkpoint:"
            $diff.Split("`n") | Where-Object { $_ } | ForEach-Object { Write-Log "  $_" }
        }
    }
} finally {
    Write-Log "Voltando para branch: $currentBranch"
    git -C $repoRoot checkout $currentBranch 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Log "Falha ao voltar para branch original" "ERROR"
    }
    Write-Log "Removendo branch temporária: $tempBranch"
    git -C $repoRoot branch -D $tempBranch 2>$null
}

Write-Log "=== Checkpoint concluído ==="
exit 0