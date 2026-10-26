param([string]$SampleDirectory, [int]$BuildProcessId)
$ErrorActionPreference = 'SilentlyContinue'
$output = Join-Path $SampleDirectory 'os-memory.ndjson'
while ($true) {
    $samples = @()
    $buildAlive = $false
    foreach ($file in Get-ChildItem -LiteralPath $SampleDirectory -Filter 'process-*.ndjson') {
        $sampleProcessId = [int]($file.BaseName -replace '^process-', '')
        try {
            $sampleProcess = [System.Diagnostics.Process]::GetProcessById($sampleProcessId)
            if ($sampleProcess.HasExited) { continue }
            $sampleProcess.Refresh()
            if ($sampleProcessId -eq $BuildProcessId) { $buildAlive = $true }
            $samples += @{ pid = $sampleProcessId; rss = $sampleProcess.WorkingSet64; peakRss = $sampleProcess.PeakWorkingSet64; privateBytes = $sampleProcess.PrivateMemorySize64 }
        } catch { }
    }
    @{ t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); processes = $samples } | ConvertTo-Json -Compress -Depth 4 | Add-Content -LiteralPath $output
    if (-not $buildAlive) { break }
    Start-Sleep -Milliseconds 500
}
