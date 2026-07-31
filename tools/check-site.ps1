param(
  [switch]$Remote
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

$Failures = New-Object System.Collections.Generic.List[string]
$Warnings = New-Object System.Collections.Generic.List[string]

function Add-Failure([string]$Message) {
  $Failures.Add($Message) | Out-Null
  Write-Host "FAIL $Message" -ForegroundColor Red
}

function Add-Warning([string]$Message) {
  $Warnings.Add($Message) | Out-Null
  Write-Host "WARN $Message" -ForegroundColor Yellow
}

function Test-RequiredFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Add-Failure "Missing required file: $Path"
  }
}

function Test-RequiredDirectory([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    Add-Failure "Missing required directory: $Path"
  }
}

function Normalize-LocalPath([string]$Path) {
  $NoHash = ($Path -split "#")[0]
  $NoQuery = ($NoHash -split "\?")[0]
  return [Uri]::UnescapeDataString($NoQuery)
}

function Test-LocalHtmlLinks {
  $Html = Get-Content -LiteralPath "index.html" -Raw -Encoding UTF8
  $Matches = [regex]::Matches($Html, '(?:src|href|poster)="([^"]+)"')

  foreach ($Match in $Matches) {
    $RawPath = $Match.Groups[1].Value
    if (-not $RawPath -or $RawPath -match '^(https?:|mailto:|tel:|#)') {
      continue
    }

    $CleanPath = Normalize-LocalPath $RawPath
    if (-not (Test-Path -LiteralPath $CleanPath)) {
      Add-Failure "Broken local index.html path: $RawPath"
    }
  }

  $SrcsetMatches = [regex]::Matches($Html, 'srcset="([^"]+)"')
  foreach ($Match in $SrcsetMatches) {
    $Entries = $Match.Groups[1].Value -split ","
    foreach ($Entry in $Entries) {
      $RawPath = ($Entry.Trim() -split "\s+")[0]
      if (-not $RawPath -or $RawPath -match '^(https?:|data:)') {
        continue
      }

      $CleanPath = Normalize-LocalPath $RawPath
      if (-not (Test-Path -LiteralPath $CleanPath)) {
        Add-Failure "Broken local index.html srcset path: $RawPath"
      }
    }
  }
}

function Test-LocalCssUrls {
  $CssPath = "source/style.css"
  $CssDir = Split-Path -Parent $CssPath
  $Css = Get-Content -LiteralPath $CssPath -Raw -Encoding UTF8
  $Matches = [regex]::Matches($Css, 'url\((["'']?)([^)"'']+)\1\)')

  foreach ($Match in $Matches) {
    $RawPath = $Match.Groups[2].Value.Trim()
    if (-not $RawPath -or $RawPath -match '^(https?:|data:)') {
      continue
    }

    $CleanPath = Normalize-LocalPath $RawPath
    $ResolvedPath = Join-Path $CssDir $CleanPath
    if (-not (Test-Path -LiteralPath $ResolvedPath)) {
      Add-Failure "Broken CSS url() path in ${CssPath}: $RawPath"
    }
  }
}

function Test-StaleRootReferences {
  $Html = Get-Content -LiteralPath "index.html" -Raw -Encoding UTF8
  $Patterns = @(
    'href="style\.css',
    'src="script\.js',
    'src="APM_logo\.png"',
    'src="expocentr_logo\.svg"',
    'src="imperia-forum_logo\.svg"',
    'src="IMG_5091\.MP4"',
    'href="cookie\.html"'
  )

  foreach ($Pattern in $Patterns) {
    if ($Html -match $Pattern) {
      Add-Failure "Found stale root reference matching: $Pattern"
    }
  }
}

function Test-AssetSizes {
  $Limits = @{
    "assets1/IMG_5091.web.mp4" = 3MB
    "assets1/IMG_5091.MP4" = 8MB
  }

  foreach ($Entry in $Limits.GetEnumerator()) {
    if (Test-Path -LiteralPath $Entry.Key) {
      $Length = (Get-Item -LiteralPath $Entry.Key).Length
      if ($Length -gt $Entry.Value) {
        Add-Warning ("Heavy asset: {0} is {1:n1} MB, target <= {2:n1} MB" -f $Entry.Key, ($Length / 1MB), ($Entry.Value / 1MB))
      }
    }
  }

  $HallImage = Get-ChildItem -LiteralPath "assets1" -Filter "*.jpg" | Select-Object -First 1
  if ($HallImage -and $HallImage.Length -gt 700KB) {
    Add-Warning ("Heavy poster image: {0} is {1:n1} MB, target <= 0.7 MB" -f $HallImage.FullName.Replace($Root.Path + "\", ""), ($HallImage.Length / 1MB))
  }

  Get-ChildItem -LiteralPath "assets1/webp" -Filter "*.webp" | ForEach-Object {
    if ($_.Length -gt 2MB) {
      Add-Warning ("Heavy gallery image: {0} is {1:n1} MB, target <= 2.0 MB" -f $_.FullName.Replace($Root.Path + "\", ""), ($_.Length / 1MB))
    }
  }
}

function Test-RemoteUrl([string]$Url) {
  try {
    $Response = Invoke-WebRequest -Uri $Url -Method Get -MaximumRedirection 5 -TimeoutSec 30 -UseBasicParsing
    if ($Response.StatusCode -lt 200 -or $Response.StatusCode -ge 400) {
      Add-Failure "Remote URL returned $($Response.StatusCode): $Url"
    } else {
      Write-Host "OK remote $Url"
    }
  } catch {
    Add-Failure "Remote URL failed: $Url ($($_.Exception.Message))"
  }
}

Write-Host "Checking required project files..."
Test-RequiredFile "index.html"
Test-RequiredFile "CNAME"
Test-RequiredFile ".gitignore"
Test-RequiredFile "robots.txt"
Test-RequiredFile "sitemap.xml"
Test-RequiredFile "source/style.css"
Test-RequiredFile "source/style.min.css"
Test-RequiredFile "source/script.js"
Test-RequiredFile "source/script.min.js"
Test-RequiredFile "source/CNAME"
Test-RequiredFile "source/.gitignore"
Test-RequiredFile "assets1/fav.ico"
Test-RequiredFile "assets1/hero-poster.webp"
Test-RequiredFile "assets1/IMG_5091.web.mp4"
Test-RequiredFile "assets1/IMG_5091.MP4"
Test-RequiredFile "assets1/logo/APM_logo.png"
Test-RequiredFile "assets1/logo/expocentr_logo.svg"
Test-RequiredFile "assets1/logo/imperia-forum_logo.svg"
Test-RequiredFile "docs/cookie.html"
Test-RequiredDirectory "assets1/webp"

if (-not (Get-ChildItem -LiteralPath "assets1" -Filter "*.jpg")) {
  Add-Failure "Missing required JPG in assets1/"
}

if (-not (Get-ChildItem -LiteralPath "docs" -Filter "*.pdf")) {
  Add-Failure "Missing required PDF in docs/"
}

Write-Host "Checking local HTML/CSS paths..."
Test-LocalHtmlLinks
Test-LocalCssUrls
Test-StaleRootReferences
Test-AssetSizes

if ($Remote) {
  Write-Host "Checking production URLs..."
  $RemoteUrls = @(
    "https://apk-forum.ru/",
    "https://apk-forum.ru/source/style.min.css",
    "https://apk-forum.ru/source/script.min.js",
    "https://apk-forum.ru/robots.txt",
    "https://apk-forum.ru/sitemap.xml",
    "https://apk-forum.ru/assets1/IMG_5091.web.mp4",
    "https://apk-forum.ru/assets1/IMG_5091.MP4",
    "https://apk-forum.ru/assets1/hero-poster.webp",
    "https://apk-forum.ru/assets1/logo/APM_logo.png",
    "https://apk-forum.ru/docs/cookie.html",
    "https://martensblack-lead-proxy.endykartrait1488.workers.dev/health"
  )

  foreach ($Url in $RemoteUrls) {
    Test-RemoteUrl $Url
  }
}

if ($Warnings.Count -gt 0) {
  Write-Host "`nWarnings: $($Warnings.Count)" -ForegroundColor Yellow
}

if ($Failures.Count -gt 0) {
  Write-Host "`nSite check failed: $($Failures.Count) issue(s)." -ForegroundColor Red
  exit 1
}

Write-Host "`nSite check passed." -ForegroundColor Green
