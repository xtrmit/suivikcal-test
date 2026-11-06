# Repart d'un dépôt suivikcal-test propre : supprime l'ancien dépôt (et tout son historique), le recrée,
# puis y envoie la version actuelle en un seul commit. À lancer une seule fois (nettoyage de l historique).
#   .\tools\repartir-propre.ps1
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location (Split-Path $PSScriptRoot -Parent)
function Fail([string]$m) { Write-Host "`n[X] $m" -ForegroundColor Red; exit 1 }
function Ok([string]$m)   { Write-Host "[OK] $m" -ForegroundColor Green }

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Fail "GitHub CLI (gh) introuvable." }
$user = (gh api user --jq .login 2>$null); if (-not $user) { Fail "Pas connecté à GitHub." }; $user = $user.Trim()
$version = [regex]::Match((Get-Content version.js -Raw -Encoding UTF8), "SUIVIKCAL_VERSION\s*=\s*'([^']+)'").Groups[1].Value

Write-Host "Le dépôt $user/suivikcal-test va être SUPPRIMÉ puis recréé, avec un seul commit (SuiviKcal v$version)." -ForegroundColor Yellow
Write-Host "Le site TEST garde la même adresse. Le dépôt suivikcal (PROD) n'est pas touché."
$ans = Read-Host "Tape OUI pour continuer"
if ($ans -cne 'OUI') { Fail "Annulé." }

Write-Host "`n1/4 Autorisation de supprimer un dépôt (une page GitHub peut s'ouvrir : valide-la)..."
gh auth refresh -h github.com -s delete_repo
if ($LASTEXITCODE -ne 0) { Fail "Autorisation refusée." }

Write-Host "2/4 Historique local remplacé par un seul commit..."
git checkout -q --orphan propre
git add -A
git commit -q -m "SuiviKcal v$version"
if ($LASTEXITCODE -ne 0) { Fail "Commit impossible." }
git branch -D main 2>$null | Out-Null
git branch -m main
git reflog expire --expire=now --all 2>$null
git gc --prune=now -q 2>$null
Ok "Historique local propre"

Write-Host "3/4 Suppression et recréation du dépôt suivikcal-test..."
gh repo delete "$user/suivikcal-test" --yes
gh repo create "$user/suivikcal-test" --public --description "SuiviKcal - suivi des calories (test)" | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "Création du dépôt impossible." }
Start-Sleep -Seconds 3

Write-Host "4/4 Envoi et activation du site..."
git push -q -u test main
if ($LASTEXITCODE -ne 0) { Fail "Envoi impossible." }
gh api -X POST "repos/$user/suivikcal-test/pages" -f "source[branch]=main" -f "source[path]=/" 2>$null | Out-Null
Ok "Dépôt suivikcal-test propre, SuiviKcal v$version envoyée"
Write-Host "  En ligne d'ici quelques minutes : https://$user.github.io/suivikcal-test/"
