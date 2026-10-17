[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ZipPath,

  [string]$PhpExe = 'php'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$Script:Failures = New-Object System.Collections.Generic.List[string]
$Script:Checks = New-Object System.Collections.Generic.List[pscustomobject]

function Test-AwikCheck {
  param([string]$Name, [bool]$Passed, [string]$Detail = '', [string]$Severity = 'Error')
  $Script:Checks.Add([pscustomobject]@{ Name = $Name; Passed = $Passed; Detail = $Detail; Severity = $Severity })
  if (-not $Passed) {
    $Script:Failures.Add("$Name : $Detail")
    if ($Severity -eq 'Error') { throw "Validation failed: $Name - $Detail" }
  }
  Write-Host (("{0}: {1}" -f $Name, $(if ($Passed) { 'PASS' } else { 'FAIL' }))) $Detail
}

function Test-AwikSkipped {
  param([string]$Name, [string]$Reason)
  $Script:Checks.Add([pscustomobject]@{ Name = $Name; Passed = $null; Detail = $Reason; Severity = 'Info' })
  Write-Host ("{0}: SKIP - {1}" -f $Name, $Reason)
}

if (-not (Test-Path -LiteralPath $ZipPath)) { throw "Package not found: $ZipPath" }
$zipFile = Get-Item -LiteralPath $ZipPath
$zipPathResolved = $zipFile.FullName

try {
  $archive = [System.IO.Compression.ZipFile]::OpenRead($zipPathResolved)
  try {
    $entries = @($archive.Entries)
    $entryNames = @()
    $duplicateCheck = New-Object System.Collections.Generic.HashSet[string]
    $totalUncompressed = 0
    $crcErrors = New-Object System.Collections.Generic.List[string]
    $backSlashEntries = New-Object System.Collections.Generic.List[string]
    $absoluteOrTraversal = New-Object System.Collections.Generic.List[string]

    foreach ($entry in $entries) {
      $name = $entry.FullName
      $totalUncompressed += $entry.Length

      # 3. Zero backslashes in archive entry names.
      if ($name -like '*\*') { $backSlashEntries.Add($name) }

      # 5. No absolute paths, no .. traversal, no duplicate normalized names.
      $normalized = $name.Replace('\', '/')
      if ($normalized -match '^[A-Za-z]:|^/|^\.\.|\/\.\.|\/\.$|^\.$') {
        $absoluteOrTraversal.Add($name)
      }
      if (-not $duplicateCheck.Add($normalized)) {
        $absoluteOrTraversal.Add("DUPLICATE: $name")
      }
      $entryNames += $normalized

      # 1. ZIP integrity and CRC - force full decompression of every entry.
      try {
        $stream = $entry.Open()
        $buffer = New-Object byte[] 65536
        $read = 0
        do {
          $read = $stream.Read($buffer, 0, $buffer.Length)
        } while ($read -gt 0)
        $stream.Close()
      } catch {
        $crcErrors.Add("$name : $($_.Exception.Message)")
      }
    }

    Test-AwikCheck -Name 'ZIP integrity and CRC' -Passed ($crcErrors.Count -eq 0) -Detail ($crcErrors -join '; ')
    Test-AwikCheck -Name 'Entry count' -Passed ($entries.Count -gt 0) -Detail ("{0} entries" -f $entries.Count)
    Test-AwikCheck -Name 'Total uncompressed size' -Passed ($totalUncompressed -gt 0) -Detail ("{0} bytes" -f $totalUncompressed)
    Test-AwikCheck -Name 'Zero backslash separators in entry names' -Passed ($backSlashEntries.Count -eq 0) -Detail (($backSlashEntries -join '; ') + ' (none)')
    Test-AwikCheck -Name 'No absolute paths or .. traversal' -Passed ($absoluteOrTraversal.Count -eq 0) -Detail (($absoluteOrTraversal -join '; ') + ' (none)')
  } finally {
    $archive.Dispose()
  }
} catch {
  Test-AwikCheck -Name 'ZIP integrity and CRC' -Passed $false -Detail $_.Exception.Message
  throw
}

# 4. All required files exist at exact expected paths.
$requiredPaths = @(
  'manifest.json',
  'README.md',
  'public_html/.htaccess',
  'public_html/api/index.php',
  'api/.htaccess',
  'api/public/index.php',
  'api/private/config.php',
  'api/private/bootstrap.php',
  'api/private/provision-admin.php',
  'api/private/backup.php',
  'api/private/restore-backup.php',
  'api/private/cron/cleanup-auth-state.php',
  'migrations/2026_10_11_auth_core.sql',
  'migrations/2026_10_12_login_attempts.sql',
  'migrations/2026_10_13_full_application.sql',
  'migrations/2026_10_14_password_recovery.sql'
)
$missing = New-Object System.Collections.Generic.List[string]
foreach ($required in $requiredPaths) {
  if ($entryNames -notcontains $required) { $missing.Add($required) }
}
Test-AwikCheck -Name 'Required files at exact paths' -Passed ($missing.Count -eq 0) -Detail (($missing -join '; ') + ' (none)')

# 6. No .env or secret-bearing configuration files.
$secretNamePatterns = @('.env', '.env.', 'credentials', 'secrets', '*.pem', '*.key', '*.p12', '*.pfx')
$secretEntries = $entryNames | Where-Object { $_ -match '(^|/)(\.env|credentials|secrets|private-key|private_key)(\.|/|$)' -or $_ -like '*.pem' -or $_ -like '*.key' -or $_ -like '*.p12' -or $_ -like '*.pfx' }
Test-AwikCheck -Name 'No .env or secret-bearing files' -Passed ($secretEntries.Count -eq 0) -Detail (($secretEntries -join '; ') + ' (none)')

# Read manifest for checks 8 and 9.
$manifestEntry = $entryNames | Where-Object { $_ -eq 'manifest.json' }
$manifestText = ''
if ($manifestEntry.Count -eq 1) {
  $archive = [System.IO.Compression.ZipFile]::OpenRead($zipPathResolved)
  try {
    $entry = $archive.GetEntry('manifest.json')
    $stream = $entry.Open()
    $reader = New-Object System.IO.StreamReader($stream)
    $manifestText = $reader.ReadToEnd()
    $reader.Close()
    $stream.Close()
  } finally {
    $archive.Dispose()
  }
}

# 8. Manifest parses and matches the built artifact.
$manifestParsed = $false
try {
  $manifest = $manifestText | ConvertFrom-Json -ErrorAction Stop
  $manifestParsed = $true
  Test-AwikCheck -Name 'Manifest parses as JSON' -Passed $true
  $status = $manifest.status
  Test-AwikCheck -Name 'Manifest status is NOT_READY' -Passed (($status -eq 'NOT_READY') -or ([string]$status -eq 'NOT_READY')) -Detail ("status=$status")
  $hostingerAcceptanceTop = if ($manifest.PSObject.Properties.Name -contains 'hostingerAcceptance') { $manifest.hostingerAcceptance } else { $null }
  $hostingerAcceptanceNested = $manifest.localValidation.hostingerAcceptance
  $hostingerAcceptanceEffective = if ($hostingerAcceptanceTop -ne $null) { $hostingerAcceptanceTop } else { $hostingerAcceptanceNested }
  Test-AwikCheck -Name 'Manifest hostingerAcceptance is false' -Passed ($hostingerAcceptanceEffective -eq $false) -Detail ("hostingerAcceptance=$hostingerAcceptanceEffective")
  Test-AwikCheck -Name 'Manifest release name consistent' -Passed ([string]$manifest.name -eq 'awiknet-hostinger-premium-package') -Detail ("name=$($manifest.name)")
  $manifestArtifact = if ($manifest.PSObject.Properties.Name -contains 'artifact') { [string]$manifest.artifact } else { '' }
  Test-AwikCheck -Name 'Manifest artifact name matches archive' -Passed ($manifestArtifact -eq $zipFile.Name) -Detail ("artifact=$manifestArtifact archive=$($zipFile.Name)")
} catch {
  $manifestParsed = $false
  Test-AwikCheck -Name 'Manifest parses as JSON' -Passed $false -Detail $_.Exception.Message
}

# 9. All required migrations are present.
$requiredMigrations = @(
  'migrations/2026_10_11_auth_core.sql',
  'migrations/2026_10_12_login_attempts.sql',
  'migrations/2026_10_13_full_application.sql',
  'migrations/2026_10_14_password_recovery.sql'
)
$missingMigrations = $requiredMigrations | Where-Object { $entryNames -notcontains $_ }
Test-AwikCheck -Name 'All required migrations present' -Passed ($missingMigrations.Count -eq 0) -Detail (($missingMigrations -join '; ') + ' (none)')

# 10. The public bridge references the intended staging-private layout.
$bridgeEntry = $entryNames | Where-Object { $_ -eq 'public_html/api/index.php' }
$bridgeText = ''
if ($bridgeEntry.Count -eq 1) {
  $archive = [System.IO.Compression.ZipFile]::OpenRead($zipPathResolved)
  try {
    $stream = $archive.GetEntry('public_html/api/index.php').Open()
    $reader = New-Object System.IO.StreamReader($stream)
    $bridgeText = $reader.ReadToEnd()
    $reader.Close()
    $stream.Close()
  } finally {
    $archive.Dispose()
  }
}
Test-AwikCheck -Name 'Bridge resolves staging-private directory first' -Passed ($bridgeText -like "*staging-api*") -Detail ('staging-api reference found in bridge')
Test-AwikCheck -Name 'Bridge keeps production fallback' -Passed ($bridgeText -like "*dirname(__DIR__, 2)*") -Detail ('production fallback reference found in bridge')
Test-AwikCheck -Name 'Bridge fails closed generically' -Passed ($bridgeText -like "*Application unavailable*") -Detail ('generic fail-closed message found in bridge')

# 7. No production database identifiers or secret values embedded in packaged text.
$productionIdentifiers = @('u605093332_awiknet_db', 'u605093332_awiknet')
$textExtensions = @('.php', '.sql', '.html', '.md', '.json', '.txt', '.htaccess', '.xml', '')
$embedded = New-Object System.Collections.Generic.List[string]
$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPathResolved)
try {
  foreach ($entry in $archive.Entries) {
    $ext = [System.IO.Path]::GetExtension($entry.Name)
    if ($textExtensions -notcontains $ext) { continue }
    $stream = $entry.Open()
    $reader = New-Object System.IO.StreamReader($stream)
    $content = $reader.ReadToEnd()
    $reader.Close()
    $stream.Close()
    foreach ($identifier in $productionIdentifiers) {
      if ($content -like "*$identifier*") { $embedded.Add("$($entry.FullName): contains $identifier") }
    }
  }
} finally {
  $archive.Dispose()
}
Test-AwikCheck -Name 'No production database identifiers embedded' -Passed ($embedded.Count -eq 0) -Detail (($embedded -join '; ') + ' (none)')

# 11. All PHP files pass php -l where the local PHP executable is available.
$phpAvailable = $false
if (Get-Command $PhpExe -ErrorAction SilentlyContinue) {
  $phpAvailable = $true
}
$phpEntries = $entryNames | Where-Object { $_ -like '*.php' }
$phpFailures = New-Object System.Collections.Generic.List[string]
if ($phpAvailable) {
  foreach ($phpName in $phpEntries) {
    # Extract to a temp file and lint it.
    $archive = [System.IO.Compression.ZipFile]::OpenRead($zipPathResolved)
    try {
      $tempPath = [System.IO.Path]::GetTempFileName()
      $stream = $archive.GetEntry($phpName).Open()
      $fileStream = [System.IO.File]::Create($tempPath)
      $stream.CopyTo($fileStream)
      $fileStream.Close()
      $stream.Close()
      $lint = & $PhpExe -l $tempPath 2>&1
      Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
      if ($LASTEXITCODE -ne 0) { $phpFailures.Add("$phpName : $lint") }
    } finally {
      $archive.Dispose()
    }
  }
} else {
  Test-AwikSkipped -Name 'PHP syntax (php -l)' -Reason "PHP executable '$PhpExe' not found locally"
}
if ($phpAvailable) {
  Test-AwikCheck -Name 'All packaged PHP files pass php -l' -Passed ($phpFailures.Count -eq 0) -Detail (($phpFailures -join '; ') + ' (none)')
}

# 13. SHA-256 calculated for the final artifact.
$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
  $stream = [System.IO.File]::OpenRead($zipPathResolved)
  $hashBytes = $sha256.ComputeHash($stream)
  $stream.Close()
  $hash = [BitConverter]::ToString($hashBytes).Replace('-', '')
} finally {
  $sha256.Dispose()
}
Test-AwikCheck -Name 'SHA-256 checksum calculated' -Passed $true -Detail ("$hash  $($zipFile.Name)  ({0} bytes)" -f $zipFile.Length)

# 13b. Checksum sidecar (when present) must match the archive and name the same file.
$sidecarPath = "$zipPathResolved.sha256"
if (Test-Path -LiteralPath $sidecarPath) {
  $sidecarText = (Get-Content -LiteralPath $sidecarPath -Raw).Trim()
  $sidecarParts = $sidecarText -split '\s+'
  $sidecarHash = $sidecarParts[0]
  $sidecarName = if ($sidecarParts.Count -gt 1) { $sidecarParts[1] } else { '' }
  Test-AwikCheck -Name 'Checksum sidecar hash matches archive' -Passed ($sidecarHash -eq $hash) -Detail ("sidecar=$sidecarHash archive=$hash")
  Test-AwikCheck -Name 'Checksum sidecar names same archive' -Passed ($sidecarName -eq $zipFile.Name) -Detail ("sidecar=$sidecarName archive=$($zipFile.Name)")
} else {
  Test-AwikSkipped -Name 'Checksum sidecar consistency' -Reason "No sidecar found at $sidecarPath"
}

# 12/14. Summary report.
Write-Host ''
Write-Host "========================================"
Write-Host "PACKAGE VALIDATION REPORT"
Write-Host "========================================"
Write-Host ("Package : {0}" -f $zipFile.Name)
Write-Host ("Path    : {0}" -f $zipPathResolved)
Write-Host ("Size    : {0} bytes" -f $zipFile.Length)
Write-Host ("SHA-256 : {0}" -f $hash)
Write-Host ("Entries : {0}" -f $entries.Count)
Write-Host ("Uncompressed size : {0} bytes" -f $totalUncompressed)
Write-Host ("Manifest parsed : $manifestParsed")
Write-Host ("PHP available   : $phpAvailable")
$passedCount = ($Script:Checks | Where-Object { $_.Passed -eq $true }).Count
$failedCount = ($Script:Checks | Where-Object { $_.Passed -eq $false }).Count
$skippedCount = ($Script:Checks | Where-Object { $_.Passed -eq $null }).Count
Write-Host ("Checks passed : {0}" -f $passedCount)
Write-Host ("Checks failed : {0}" -f $failedCount)
Write-Host ("Checks skipped: {0}" -f $skippedCount)
Write-Host "========================================"

if ($Script:Failures.Count -gt 0) {
  Write-Host 'VALIDATION FAILED'
  exit 1
}
Write-Host 'VALIDATION PASSED'
exit 0
