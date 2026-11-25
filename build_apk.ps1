param(
    [string]$OriginalApk = "$env:USERPROFILE\Desktop\绘本智能伴读-v1.0.apk",
    [string]$OutputApk = "$env:USERPROFILE\Desktop\绘本智能伴读_中期汇报交付\APK\绘本智能伴读-v1.1-翻页音频修复.apk",
    [string]$Keystore = "$env:USERPROFILE\.android\debug.keystore",
    [string]$KeyAlias = "androiddebugkey"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression

$sourceWeb = Join-Path $PSScriptRoot "web"
$buildTools = Join-Path $env:LOCALAPPDATA "Android\Sdk\build-tools\35.0.0"
$zipalign = Join-Path $buildTools "zipalign.exe"
$apksigner = Join-Path $buildTools "apksigner.bat"

foreach ($required in @($OriginalApk, (Join-Path $sourceWeb "index.html"), $zipalign, $apksigner, $Keystore)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "缺少构建所需文件：$required"
    }
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("picbook_build_" + [guid]::NewGuid().ToString("N"))
$stage = Join-Path $tempRoot "stage"
$originalZip = Join-Path $tempRoot "original.zip"
$unsigned = Join-Path $tempRoot "unsigned.apk"
$aligned = Join-Path $tempRoot "aligned.apk"
$signed = Join-Path $tempRoot "signed.apk"

New-Item -ItemType Directory -Path $stage -Force | Out-Null
Copy-Item -LiteralPath $OriginalApk -Destination $originalZip
tar -xf $originalZip -C $stage

$public = Join-Path $stage "assets\public"
Copy-Item -Path (Join-Path $sourceWeb "*") -Destination $public -Recurse -Force

# 旧签名在改动资源后一定失效，apksigner 会生成新的 v2/v3 签名。
foreach ($name in @("ANDROIDD.SF", "ANDROIDD.RSA", "MANIFEST.MF")) {
    $oldSignature = Join-Path $stage "META-INF\$name"
    $insideStage = $oldSignature.StartsWith($stage, [System.StringComparison]::OrdinalIgnoreCase)
    if ($insideStage -and (Test-Path -LiteralPath $oldSignature)) {
        Remove-Item -LiteralPath $oldSignature -Force
    }
}

$zipStream = [System.IO.File]::Open(
    $unsigned,
    [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write
)
try {
    $archive = New-Object System.IO.Compression.ZipArchive(
        $zipStream,
        [System.IO.Compression.ZipArchiveMode]::Create,
        $true
    )
    try {
        Get-ChildItem -LiteralPath $stage -Recurse -File | ForEach-Object {
            $relative = $_.FullName.Substring($stage.Length).TrimStart("\").Replace("\", "/")
            # Android 11+ 要求 resources.arsc 必须以未压缩方式存放。
            $level = if ($relative -eq "resources.arsc") {
                [System.IO.Compression.CompressionLevel]::NoCompression
            } else {
                [System.IO.Compression.CompressionLevel]::Optimal
            }
            $entry = $archive.CreateEntry($relative, $level)
            $input = [System.IO.File]::OpenRead($_.FullName)
            try {
                $output = $entry.Open()
                try { $input.CopyTo($output) } finally { $output.Dispose() }
            } finally {
                $input.Dispose()
            }
        }
    } finally {
        $archive.Dispose()
    }
} finally {
    $zipStream.Dispose()
}

& $zipalign -f -p 4 $unsigned $aligned
if ($LASTEXITCODE -ne 0) { throw "zipalign 失败" }

$env:JAVA_TOOL_OPTIONS = "-Dfile.encoding=UTF-8"
& $apksigner sign `
    --ks $Keystore `
    --ks-pass pass:android `
    --ks-key-alias $KeyAlias `
    --key-pass pass:android `
    --out $signed `
    $aligned
if ($LASTEXITCODE -ne 0) { throw "APK 签名失败" }

$outputDir = Split-Path -Parent $OutputApk
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
Copy-Item -LiteralPath $signed -Destination $OutputApk -Force

& $apksigner verify --verbose $OutputApk
if ($LASTEXITCODE -ne 0) { throw "APK 签名验证失败" }

Write-Output "构建完成：$OutputApk"




