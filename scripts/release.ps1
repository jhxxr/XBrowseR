param(
    [ValidateSet('patch', 'minor', 'major')]
    [string]$Bump = 'patch',
    [string]$Remote = 'origin'
)

$ErrorActionPreference = 'Stop'

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

Require-Command git
Require-Command npm

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot

$insideRepo = (git rev-parse --is-inside-work-tree).Trim()
if ($insideRepo -ne 'true') {
    throw 'Current directory is not a git repository.'
}

$branch = (git branch --show-current).Trim()
if (-not $branch) {
    throw 'Unable to detect current git branch.'
}

$remoteUrl = (git remote get-url $Remote).Trim()
if (-not $remoteUrl) {
    throw "Git remote '$Remote' not found."
}

Write-Host "Releasing from branch: $branch"
Write-Host "Remote: $Remote ($remoteUrl)"
Write-Host "Version bump: $Bump"

npm version $Bump --no-git-tag-version | Out-Null

$packageJson = Get-Content (Join-Path $repoRoot 'package.json') | ConvertFrom-Json
$version = [string]$packageJson.version
if (-not $version) {
    throw 'Failed to read version from package.json.'
}

$tag = "v$version"
$existingLocalTagOutput = git tag --list $tag
$existingLocalTag = if ($null -ne $existingLocalTagOutput) {
    [string]$existingLocalTagOutput | ForEach-Object { $_.Trim() }
} else {
    ''
}
if ($existingLocalTag -eq $tag) {
    throw "Local tag already exists: $tag"
}

Write-Host "New version: $version"
Write-Host "Creating tag: $tag"

git add -A
git commit -m "release: $tag"
git tag $tag
git push $Remote $branch
git push $Remote $tag

Write-Host ""
Write-Host "Release pushed successfully."
Write-Host "Branch: $branch"
Write-Host "Tag: $tag"
