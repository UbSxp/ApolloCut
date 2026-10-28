# Gera o banco de clipes pt-BR para medir a qualidade das legendas.
# TTS local (SAPI / Microsoft Maria) + ffmpeg. Nada de rede, nada de chave.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$dir = Join-Path $root 'tests\legendas'
$out = Join-Path $dir 'clipes'
$tmp = Join-Path $env:TEMP 'apollocut-legendas'
$ffmpeg = Join-Path $root 'node_modules\ffmpeg-static\ffmpeg.exe'
$ffprobe = Join-Path $root 'node_modules\ffprobe-static\bin\win32\x64\ffprobe.exe'
$inv = [Globalization.CultureInfo]::InvariantCulture

New-Item -ItemType Directory -Force -Path $out | Out-Null
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

function Esc([string]$s) {
  return $s.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;').Replace('"', '&quot;').Replace("'", '&apos;')
}
function Seg([double]$s) { return $s.ToString('0.###', $inv) }
function Dur([string]$file) {
  $v = & $ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 $file
  return [double]::Parse(($v -join '').Trim(), $inv)
}
function RmsDb([string]$file) {
  $antes = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $log = & $ffmpeg -hide_banner -nostats -i $file -af volumedetect -f null NUL 2>&1
  $ErrorActionPreference = $antes
  $line = $log | Where-Object { $_ -match 'mean_volume:\s*(-?[0-9.]+) dB' } | Select-Object -First 1
  if (-not $line) { return -20.0 }
  $null = $line -match 'mean_volume:\s*(-?[0-9.]+) dB'
  return [double]::Parse($matches[1], $inv)
}

$clipes = [System.IO.File]::ReadAllText((Join-Path $dir 'clipes.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voz = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'pt-BR' } | Select-Object -First 1
if (-not $voz) { throw 'Nenhuma voz pt-BR instalada no Windows.' }
$synth.SelectVoice($voz.VoiceInfo.Name)
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)

$global:captura = New-Object System.Collections.ArrayList
$synth.add_SpeakProgress({
  param($sender, $e)
  $null = $global:captura.Add([pscustomobject]@{ text = $e.Text; ms = [math]::Round($e.AudioPosition.TotalMilliseconds) })
})

foreach ($clipe in $clipes) {
  $id = $clipe.id
  Write-Output ("[{0}] {1} frases" -f $id, $clipe.sentences.Count)

  $synth.Rate = [int]$clipe.rate
  $partes = @()
  $palavras = @()
  $cursor = [double]$clipe.leadingMs

  for ($i = 0; $i -lt $clipe.sentences.Count; $i++) {
    $frase = $clipe.sentences[$i]
    $global:captura.Clear()
    $wav = Join-Path $tmp ("{0}-{1}.wav" -f $id, $i)
    $synth.SetOutputToWaveFile($wav, $fmt)
    $synth.SpeakSsml("<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='pt-BR'>" + (Esc $frase) + "</speak>")
    $synth.SetOutputToNull()
    $d = Dur $wav
    foreach ($p in $global:captura) {
      $palavras += [pscustomobject]@{ text = $p.text; startMs = [int][math]::Round($cursor + $p.ms) }
    }
    $partes += [pscustomobject]@{ wav = $wav; dur = $d }
    $cursor += $d * 1000
    if ($i -lt $clipe.sentences.Count - 1) { $cursor += [double]$clipe.breakMs }
  }

  # Concatena: silêncio inicial + frases separadas por pausa + silêncio final.
  $ff = @('-y', '-hide_banner', '-loglevel', 'error')
  $filtros = @()
  $idx = 0
  $n = 0
  $ff += @('-f', 'lavfi', '-t', (Seg ([double]$clipe.leadingMs / 1000)), '-i', 'anullsrc=r=16000:cl=mono')
  $filtros += "[${idx}:a]"; $idx++; $n++
  for ($k = 0; $k -lt $partes.Count; $k++) {
    $ff += @('-i', $partes[$k].wav)
    $filtros += "[${idx}:a]"; $idx++; $n++
    if ($k -lt $partes.Count - 1) {
      $ff += @('-f', 'lavfi', '-t', (Seg ([double]$clipe.breakMs / 1000)), '-i', 'anullsrc=r=16000:cl=mono')
      $filtros += "[${idx}:a]"; $idx++; $n++
    }
  }
  $ff += @('-f', 'lavfi', '-t', (Seg ([double]$clipe.trailingMs / 1000)), '-i', 'anullsrc=r=16000:cl=mono')
  $filtros += "[${idx}:a]"; $idx++; $n++

  $concat = ($filtros -join '') + ("concat=n={0}:v=0:a=1[out]" -f $n)
  $speech = Join-Path $tmp ("{0}-fala.wav" -f $id)
  $ff += @('-filter_complex', $concat, '-map', '[out]', '-ar', '16000', '-ac', '1', $speech)
  & $ffmpeg @ff
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg falhou no concat de $id" }

  $total = Dur $speech
  $final = $speech

  if ($clipe.noise) {
    $gain = [math]::Round((RmsDb $speech) - [double]$clipe.noise.dbBelowSpeech, 1)
    $noise = Join-Path $tmp ("{0}-ruido.wav" -f $id)
    if ($clipe.noise.kind -eq 'music') {
      & $ffmpeg -y -hide_banner -loglevel error -f lavfi -t (Seg $total) -i 'sine=frequency=196:sample_rate=16000' -f lavfi -t (Seg $total) -i 'sine=frequency=246.94:sample_rate=16000' -f lavfi -t (Seg $total) -i 'sine=frequency=293.66:sample_rate=16000' -filter_complex '[0:a][1:a][2:a]amix=inputs=3:normalize=0,tremolo=f=1.7:d=0.6[out]' -map '[out]' -ac 1 $noise
    } else {
      & $ffmpeg -y -hide_banner -loglevel error -f lavfi -t (Seg $total) -i 'anoisesrc=color=pink:sample_rate=16000:amplitude=1' -ac 1 $noise
    }
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg falhou no ruído de $id" }
    $mix = Join-Path $tmp ("{0}-mix.wav" -f $id)
    & $ffmpeg -y -hide_banner -loglevel error -i $speech -i $noise -filter_complex ("[1:a]volume={0}dB[ruido];[0:a][ruido]amix=inputs=2:duration=first:normalize=0[out]" -f (Seg $gain)) -map '[out]' -ar 16000 -ac 1 $mix
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg falhou no mix de $id" }
    $final = $mix
    Write-Output ("      ruído {0} a {1} dB" -f $clipe.noise.kind, $gain)
  }

  $mp4 = Join-Path $out ("{0}.mp4" -f $id)
  & $ffmpeg -y -hide_banner -loglevel error -f lavfi -i 'color=c=0x101820:s=640x360:r=30' -i $final -shortest -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart $mp4
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg falhou no mp4 de $id" }

  $durFinal = Dur $mp4

  $silencio = @()
  $silencio += [pscustomobject]@{ start = 0.0; end = [math]::Round([double]$clipe.leadingMs / 1000, 3) }
  $pos = [double]$clipe.leadingMs / 1000
  for ($k = 0; $k -lt $partes.Count; $k++) {
    $pos += $partes[$k].dur
    if ($k -lt $partes.Count - 1) {
      $ini = $pos
      $pos += [double]$clipe.breakMs / 1000
      if (($pos - $ini) -ge 0.5) { $silencio += [pscustomobject]@{ start = [math]::Round($ini, 3); end = [math]::Round($pos, 3) } }
    }
  }
  $silencio += [pscustomobject]@{ start = [math]::Round($pos, 3); end = [math]::Round($durFinal, 3) }

  $ref = [pscustomobject]@{
    id         = $id
    audio      = ("clipes/{0}.mp4" -f $id)
    durationMs = [int][math]::Round($durFinal * 1000)
    rate       = $clipe.rate
    noise      = $clipe.noise
    sentences  = $clipe.sentences
    display    = ($clipe.sentences -join ' ')
    words      = $palavras
    silence    = $silencio
  }
  $json = $ref | ConvertTo-Json -Depth 6
  [System.IO.File]::WriteAllText((Join-Path $out ("{0}.json" -f $id)), $json, (New-Object System.Text.UTF8Encoding($false)))
  Write-Output ("      ok {0:N1}s / {1} palavras" -f $durFinal, $palavras.Count)
}

$synth.Dispose()
Write-Output 'Pronto.'
