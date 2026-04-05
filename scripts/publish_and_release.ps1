<#
Helper PowerShell script to create a GitHub repo (optional), push current repo,
set essential secrets via `gh`, and create a version tag to trigger the release workflow.

Requires: Git, GitHub CLI (`gh`). Run in the repository root.
Usage: .\scripts\publish_and_release.ps1 -Repo 'owner/repo' -Tag 'v0.1.0'
#>

param(
    [string]$Repo = 'jakeersfdc/bullforce-signals',
    [string]$Tag = '',
    [switch]$SkipSecrets
)

Set-StrictMode -Version Latest
Function ExitIfNoGH {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        Write-Error "gh CLI not found. Install from https://cli.github.com/"
        exit 1
    }
}

if (-not $SkipSecrets) {
    ExitIfNoGH
}

if ($Repo) {
    $exists = gh repo view $Repo 2>$null
    if (-not $?) {
        Write-Host "Creating GitHub repo $Repo..."
        gh repo create $Repo --public --source=. --remote=origin --push
    } else {
        Write-Host "Repo $Repo exists; ensuring 'origin' remote is set."
        git remote remove origin 2>$null
        # prefer HTTPS remote to avoid SSH key issues on developer machines
        git remote add origin "https://github.com/$Repo.git" 2>$null
    }
}

Write-Host "Staging and committing changes..."
git add -A
try { git commit -m "chore: add admin, billing, mobile transfer, migrations, release workflow" } catch {
    Write-Host "No changes to commit or commit failed. Continuing..."
}

Write-Host "Pushing to origin/main..."
try { git push -u origin main } catch { git push origin HEAD:main }

if ($Tag) {
    Write-Host "Creating and pushing tag $Tag..."
    git tag $Tag -m "Release $Tag" 2>$null
    git push origin $Tag
}

$secrets = @(
    'CLERK_SECRET_KEY',
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    'DATABASE_URL',
    'JWT_SECRET',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'NEXT_PUBLIC_STRIPE_PRICE_ID',
    'ADMIN_USERS',
    'NEXT_PUBLIC_APP_ORIGIN',
    'NEXT_PUBLIC_MOBILE_SCHEME',
    'SENTRY_DSN',
    'GCLOUD_PROJECT',
    'GCLOUD_SERVICE_KEY'
)

Write-Host "Setting recommended GitHub secrets from environment variables or .publish_secrets.env"

# Load .publish_secrets.env if present
$envFile = Join-Path (Get-Location) '.publish_secrets.env'
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^[^#]') {
            $parts = $_ -split '=', 2
            if ($parts.Count -eq 2) { [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim()) }
        }
    }
    Write-Host "Loaded .publish_secrets.env"
}

# Normalize common alternative secret names so users can use slightly different keys
# e.g., allow CLERK_PUBLISHABLE_KEY -> NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
if (-not [Environment]::GetEnvironmentVariable('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY')) {
    $alt = [Environment]::GetEnvironmentVariable('CLERK_PUBLISHABLE_KEY')
    if ($alt) { [Environment]::SetEnvironmentVariable('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', $alt) }
}
if (-not [Environment]::GetEnvironmentVariable('STRIPE_SECRET_KEY')) {
    $alt = [Environment]::GetEnvironmentVariable('STRIPE_SECRET')
    if ($alt) { [Environment]::SetEnvironmentVariable('STRIPE_SECRET_KEY', $alt) }
}
if (-not [Environment]::GetEnvironmentVariable('GCLOUD_SERVICE_KEY')) {
    $alt = [Environment]::GetEnvironmentVariable('GCLOUD_SA_KEY')
    if ($alt) { [Environment]::SetEnvironmentVariable('GCLOUD_SERVICE_KEY', $alt) }
}

if (-not $SkipSecrets) {
    foreach ($s in $secrets) {
        $val = [Environment]::GetEnvironmentVariable($s)
        if ([string]::IsNullOrEmpty($val)) {
            Write-Error "Required secret $s is not set. Aborting."
            exit 1
        }
        gh secret set $s --body $val
        Write-Host "Set secret $s"
    }
} else {
    Write-Host "Skipping secrets as requested (--SkipSecrets)"
}

Write-Host "Done. If you created a tag matching v*, the release workflow will run." 
Write-Host "Next: configure cloud provider secrets and run migrations on the deployed DB." 
