# scripts/deploy.ps1 — 规范化部署流程（根治"改动不生效"）
# 步骤：① 显式清理旧 dist → ② 构建 → ③ 强制 pm2 restart → ④ 冒烟检查
# 用法：pnpm deploy   （或 powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy.ps1）
# 说明：
#   - 旧 dist/client 静态 HTML 会优先于 SSR 路由（@astrojs/node serve-static 行为），必须全量清理；
#   - 路由 manifest 内联在 server bundle 中，构建后不重启 pm2 会继续跑旧 SSR，因此 restart 是强制的；
#   - 冒烟检查比对"构建时间"与线上 Last-Modified，并验证最新 /_astro 资源可达。
param(
    [switch]$SkipSmoke
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "`n=== [1/4] 清理旧构建产物 dist ===" -ForegroundColor Cyan
function Remove-DistWithRetry {
    for ($i = 1; $i -le 3; $i++) {
        try {
            Remove-Item dist -Recurse -Force -ErrorAction Stop
            return $true
        } catch {
            if ($i -lt 3) {
                Write-Host "    dist 被占用（第 $i 次），2 秒后重试..." -ForegroundColor Yellow
                Start-Sleep -Seconds 2
            }
        }
    }
    return $false
}
$stoppedForClean = $false
if (Test-Path dist) {
    if (-not (Remove-DistWithRetry)) {
        Write-Host "    dist 仍被进程占用，先停止 pm2 再清理" -ForegroundColor Yellow
        pm2 stop shijies-nook
        Start-Sleep -Seconds 2
        if (-not (Remove-DistWithRetry)) {
            pm2 start shijies-nook
            Write-Error "dist 仍无法删除，中止部署（服务已恢复）。若反复出现，请检查是否有残留的 astro dev/preview 进程（node ...astro.mjs dev/preview）并关闭"
            exit 1
        }
        $stoppedForClean = $true
        Write-Host "    已停止 pm2 并删除 dist" -ForegroundColor Green
    } else {
        Write-Host "    dist 已删除" -ForegroundColor Green
    }
} else {
    Write-Host "    dist 不存在，无需清理" -ForegroundColor DarkGray
}

Write-Host "`n=== [2/4] 构建（update-diff + astro build）===" -ForegroundColor Cyan
pnpm build
if ($LASTEXITCODE -ne 0) {
    Write-Error "构建失败（exit=$LASTEXITCODE），已中止，未重启服务"
    exit 1
}
Write-Host "    构建成功" -ForegroundColor Green

Write-Host "`n=== [3/4] 启动/重启 pm2: shijies-nook ===" -ForegroundColor Cyan
if ($stoppedForClean) {
    pm2 start shijies-nook
} else {
    pm2 restart shijies-nook
}
if ($LASTEXITCODE -ne 0) {
    Write-Error "pm2 操作失败（exit=$LASTEXITCODE）"
    exit 1
}
Write-Host "    pm2 已启动" -ForegroundColor Green

if ($SkipSmoke) {
    Write-Host "`n已跳过冒烟检查（-SkipSmoke）" -ForegroundColor DarkGray
    exit 0
}

Write-Host "`n=== [4/4] 冒烟检查 ===" -ForegroundColor Cyan
Start-Sleep -Seconds 2

# 构建时间（取 dist/client/index.html 的 mtime，用于比对 Last-Modified）
$builtFile = Get-Item "dist\client\index.html"
$builtTime = $builtFile.LastWriteTimeUtc
$builtHttpDate = $builtTime.ToString("ddd, dd MMM yyyy HH:mm:ss 'GMT'", [System.Globalization.CultureInfo]::InvariantCulture)

# 取一个最新哈希资源路径，用于可达性检查
$html = Get-Content "dist\client\index.html" -Raw -Encoding UTF8
$assetMatch = [regex]::Match($html, 'src="(/_astro/[^"]+\.js)"')
$asset = $assetMatch.Groups[1].Value
if (-not $asset) {
    $assetMatch = [regex]::Match($html, 'href="(/_astro/[^"]+\.css)"')
    $asset = $assetMatch.Groups[1].Value
}
if (-not $asset) {
    Write-Warning "未在 index.html 中找到 /_astro 资源引用，跳过资源可达性检查"
}

$failures = 0

# 1) 源站 HTML
$localHead = curl.exe -sI "http://localhost:4322/"
$localCode = [regex]::Match(($localHead -join "`n"), "HTTP/\S+ (\d+)").Groups[1].Value
Write-Host "    源站 /            => HTTP $localCode" -ForegroundColor $(if ($localCode -eq "200") { "Green" } else { "Red" })
if ($localCode -ne "200") { $failures++ }

# 2) 源站 HTML Last-Modified 与构建时间比对
$localLM = ($localHead | Where-Object { $_ -like "last-modified:*" }) -replace "last-modified:\s*", ""
if ($localLM -and $localLM.Trim() -eq $builtHttpDate) {
    Write-Host "    源站 Last-Modified 与构建时间一致 ($builtHttpDate)" -ForegroundColor Green
} else {
    Write-Warning "    源站 Last-Modified 不一致：期望 $builtHttpDate，实际 $localLM（若刚构建过请确认 pm2 已重启）"
    $failures++
}

# 3) 源站最新资源可达
if ($asset) {
    $assetCode = curl.exe -s -o NUL -w "%{http_code}" "http://localhost:4322$asset"
    Write-Host "    源站资源 $asset => HTTP $assetCode" -ForegroundColor $(if ($assetCode -eq "200") { "Green" } else { "Red" })
    if ($assetCode -ne "200") { $failures++ }
}

# 4) 公网 HTML（会经过 Cloudflare；DYNAMIC 表示未缓存 HTML，符合预期）
$pubHead = curl.exe -sI "https://miscoke.top/"
$pubCode = [regex]::Match(($pubHead -join "`n"), "HTTP/\S+ (\d+)").Groups[1].Value
$pubCf = ($pubHead | Where-Object { $_ -like "cf-cache-status:*" }) -replace "cf-cache-status:\s*", ""
Write-Host "    公网 /            => HTTP $pubCode (cf-cache-status: $pubCf)" -ForegroundColor $(if ($pubCode -eq "200") { "Green" } else { "Red" })
if ($pubCode -ne "200") { $failures++ }

# 5) 公网最新资源可达
if ($asset) {
    $pubAsset = curl.exe -s -o NUL -w "%{http_code}" "https://miscoke.top$asset"
    Write-Host "    公网资源 $asset => HTTP $pubAsset" -ForegroundColor $(if ($pubAsset -eq "200") { "Green" } else { "Red" })
    if ($pubAsset -ne "200") { $failures++ }
}

Write-Host ""
if ($failures -eq 0) {
    Write-Host "=== 冒烟检查全部通过 ===" -ForegroundColor Green
    exit 0
} else {
    Write-Error "=== 冒烟检查发现 $failures 个异常，请排查 ==="
    exit 1
}