Add-Type -AssemblyName System.Speech
$ffprobe = 'C:\Users\DUARDIN\ApolloCut\node_modules\ffprobe-static\bin\win32\x64\ffprobe.exe'
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voz = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'pt-BR' } | Select-Object -First 1
$synth.SelectVoice($voz.VoiceInfo.Name)

function Testar($nome, $ssml, $rate) {
  $global:palavras = New-Object System.Collections.ArrayList
  $synth.Rate = $rate
  $synth.add_SpeakProgress({
    param($sender, $e)
    $null = $global:palavras.Add([pscustomobject]@{ text = $e.Text; ms = [math]::Round($e.AudioPosition.TotalMilliseconds) })
  })
  $wav = Join-Path $env:TEMP ("sapi-" + $nome + ".wav")
  $fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  $synth.SetOutputToWaveFile($wav, $fmt)
  $synth.SpeakSsml($ssml)
  $synth.SetOutputToNull()
  $dur = & $ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 $wav
  Write-Output ("--- {0} rate={1} dur={2}" -f $nome, $rate, $dur)
  $global:palavras | ForEach-Object { Write-Output ("   {0,6}  {1}" -f $_.ms, $_.text) }
}

$s1 = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='pt-BR'>Almocei ontem e fui ao mercado. Comprei pao e leite.</speak>"
$s2 = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='pt-BR'>Almocei ontem e fui ao mercado.<break time='700ms'/>Comprei pao e leite.</speak>"

Testar 'a' $s1 0
Testar 'b' $s1 3
Testar 'c' $s2 3
$synth.Dispose()
