Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.GetInstalledVoices() | ForEach-Object {
  $v = $_.VoiceInfo
  Write-Output ("{0} | {1} | enabled={2}" -f $v.Name, $v.Culture.Name, $_.Enabled)
}
$synth.Dispose()
