$ErrorActionPreference = 'Stop'
$modeProfilePath = $PROFILE.CurrentUserAllHosts
$modeProfileMarker = '# oj-helper: contest mode command'
$modeCommandPath = (Join-Path $PSScriptRoot 'mode.cmd').Replace("'", "''")
$modeFunction = @'
# oj-helper: contest mode command
function global:mode {
    if ($args.Count -gt 0 -and $args[0] -in @('contest', 'normal', 'status', '--help', '-h')) {
        & '__OJ_HELPER_MODE__' @args
    } else {
        & "$env:SystemRoot\System32\mode.com" @args
    }
}
'@
$modeFunction = $modeFunction.Replace('__OJ_HELPER_MODE__', $modeCommandPath)
if (!(Test-Path -LiteralPath $modeProfilePath) -or !(Select-String -LiteralPath $modeProfilePath -SimpleMatch $modeProfileMarker -Quiet)) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $modeProfilePath) -Force | Out-Null
    Add-Content -LiteralPath $modeProfilePath -Value ("`r`n" + $modeFunction)
}
. ([ScriptBlock]::Create($modeFunction))
Write-Output 'oj-helper: mode contest / mode normal / mode status are available in PowerShell.'
