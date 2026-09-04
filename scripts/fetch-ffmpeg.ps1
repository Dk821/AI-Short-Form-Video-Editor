<#
.SYNOPSIS
    Puts ffmpeg.exe and ffprobe.exe into resources\ffmpeg\ so the installer
    can bundle them.

.DESCRIPTION
    The app must not require users to install FFmpeg, so the two binaries
    ship inside the package. This script gets them one of three ways, in
    order of preference:

      1. -From <dir>   an explicit folder you point it at
      2. whatever `ffmpeg` resolves to on PATH (a developer machine
         already has the exact build the renderer was tested against)
      3. a download of the gyan.dev release build

    It then verifies the copy actually has the filters the renderer needs.
    That check matters: plenty of FFmpeg builds ship without drawtext
    (it gained a hard libharfbuzz dependency in 7.0), and the failure mode
    without this check is a baffling "No such filter: 'drawtext'" on the
    user's first export rather than an error at build time.

.EXAMPLE
    npm run fetch:ffmpeg
    powershell -File scripts\fetch-ffmpeg.ps1 -From "C:\ffmpeg\bin" -Force
#>
[CmdletBinding()]
param(
    [string] $From,
    [switch] $Force
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Target   = Join-Path $RepoRoot 'resources\ffmpeg'
$Required = @('drawtext', 'geq', 'alphamerge', 'overlay')

function Write-Step($msg) { Write-Host "  $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  $msg" -ForegroundColor Green }
function Write-Warn2($msg){ Write-Host "  $msg" -ForegroundColor Yellow }

New-Item -ItemType Directory -Force -Path $Target | Out-Null

$ffmpegOut = Join-Path $Target 'ffmpeg.exe'
$ffprobeOut = Join-Path $Target 'ffprobe.exe'

if ((Test-Path $ffmpegOut) -and (Test-Path $ffprobeOut) -and -not $Force) {
    Write-Ok "ffmpeg and ffprobe are already in resources\ffmpeg (use -Force to replace)."
    exit 0
}

function Copy-Pair([string] $dir) {
    $src1 = Join-Path $dir 'ffmpeg.exe'
    $src2 = Join-Path $dir 'ffprobe.exe'
    if (-not (Test-Path $src1)) { return $false }
    if (-not (Test-Path $src2)) {
        Write-Warn2 "Found ffmpeg.exe in $dir but no ffprobe.exe beside it."
        return $false
    }
    Copy-Item $src1 $ffmpegOut -Force
    Copy-Item $src2 $ffprobeOut -Force
    # Some full builds are dynamically linked against DLLs in the same
    # folder; copy those too or the bundled exe will not start on a machine
    # without them.
    Get-ChildItem -Path $dir -Filter '*.dll' -ErrorAction SilentlyContinue |
        ForEach-Object { Copy-Item $_.FullName $Target -Force }
    return $true
}

$copied = $false

# ---- 1. explicit folder -----------------------------------------------
if ($From) {
    Write-Step "Copying from $From ..."
    $copied = Copy-Pair $From
    if (-not $copied) { throw "No ffmpeg.exe + ffprobe.exe pair found in '$From'." }
    Write-Ok "Copied from $From."
}

# ---- 2. PATH ----------------------------------------------------------
if (-not $copied) {
    $onPath = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if ($onPath) {
        $dir = Split-Path -Parent $onPath.Source
        Write-Step "Found ffmpeg on PATH at $dir - copying ..."
        $copied = Copy-Pair $dir
        if ($copied) { Write-Ok "Copied the build already installed on this machine." }
    }
}

# ---- 3. download ------------------------------------------------------
if (-not $copied) {
    $url = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("ffmpeg-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    $zip = Join-Path $tmp 'ffmpeg.zip'
    Write-Step "No local ffmpeg found. Downloading $url (about 90 MB) ..."
    try {
        $ProgressPreference = 'SilentlyContinue'   # ~10x faster Invoke-WebRequest
        Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
        Expand-Archive -Path $zip -DestinationPath $tmp -Force
        $bin = Get-ChildItem -Path $tmp -Recurse -Filter 'ffmpeg.exe' |
               Select-Object -First 1 | Split-Path -Parent
        if (-not $bin) { throw 'ffmpeg.exe was not found inside the downloaded archive.' }
        $copied = Copy-Pair $bin
        Write-Ok 'Downloaded and extracted.'
    }
    finally {
        Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if (-not $copied) { throw 'Could not obtain ffmpeg.exe and ffprobe.exe.' }

# ---- verify -----------------------------------------------------------
Write-Step 'Verifying the bundled build ...'
$version = (& $ffmpegOut -hide_banner -version 2>&1 | Select-Object -First 1)
$filters = (& $ffmpegOut -hide_banner -filters 2>&1) -join "`n"
$missing = @()
foreach ($f in $Required) {
    if ($filters -notmatch "\s$([regex]::Escape($f))\s") { $missing += $f }
}
if ($missing.Count -gt 0) {
    throw ("This ffmpeg build is missing required filter(s): " + ($missing -join ', ') +
           ". drawtext in particular needs a build made with libharfbuzz. " +
           "Get a full build from https://www.gyan.dev/ffmpeg/builds/ and re-run with -From.")
}

& $ffprobeOut -hide_banner -version | Out-Null

Write-Ok $version
Write-Ok "All required filters present: $($Required -join ', ')"
Write-Ok "Ready: $Target"
