# Gera as fixtures de teste do ApolloCut (voz sintetizada pt-BR + ffmpeg)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'tests\fixtures'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$ffmpeg = Join-Path $root 'node_modules\ffmpeg-static\ffmpeg.exe'

$frase1 = 'Almocei ontem e fui ao mercado, comprei pão e leite.'
$frase2 = 'No caminho de volta encontrei meu vizinho e conversamos sobre o filme de ontem.'
$texto = "$frase1 $frase2"

$wav = Join-Path $env:TEMP 'apollocut-voz.wav'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voz = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'pt-BR' } | Select-Object -First 1
if (-not $voz) { throw 'Nenhuma voz pt-BR instalada no Windows.' }
$synth.SelectVoice($voz.VoiceInfo.Name)
$synth.Rate = -1
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(44100, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$synth.SetOutputToWaveFile($wav, $fmt)
$synth.Speak($texto)
$synth.Dispose()
Write-Host "voz gerada: $wav"

function Render($nome, $size, $dur, $args2, [switch]$Mudo) {
  $dest = Join-Path $out $nome
  if ($Mudo) {
    & $ffmpeg -y -loglevel error -f lavfi -i "testsrc2=s=$size`:d=$dur`:r=30" @args2 $dest
  } else {
    & $ffmpeg -y -loglevel error -f lavfi -i "testsrc2=s=$size`:d=$dur`:r=30" -i $wav -filter_complex "[1:a]apad=whole_dur=$dur,volume=1.0[a]" -map 0:v -map "[a]" @args2 $dest
  }
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg falhou em $nome" }
  Write-Host "ok: $nome"
}

Render 'fala-ptbr.mp4' '1280x720' 20 @('-c:v','libx264','-pix_fmt','yuv420p','-preset','veryfast','-crf','23','-c:a','aac','-b:a','128k','-movflags','+faststart','-t','20')
Render 'vertical-ptbr.mp4' '720x1280' 15 @('-c:v','libx264','-pix_fmt','yuv420p','-preset','veryfast','-crf','23','-c:a','aac','-b:a','128k','-movflags','+faststart','-t','15')
Render 'formato.mov' '1280x720' 12 @('-c:v','libx264','-pix_fmt','yuv420p','-preset','veryfast','-crf','23','-c:a','aac','-b:a','128k','-t','12')
Render 'mudo.mp4' '640x360' 8 @('-c:v','libx264','-pix_fmt','yuv420p','-preset','veryfast','-crf','23','-t','8') -Mudo

# arquivo corrompido de propósito
$bad = Join-Path $out 'corrompido.mp4'
[System.IO.File]::WriteAllBytes($bad, [byte[]](0..255))
Write-Host 'ok: corrompido.mp4'
