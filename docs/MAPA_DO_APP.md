# Mapa do ApolloCut

Documento de referência da auditoria "app 100% funcional". Tudo aqui foi lido no
código ativo (`index.html` + `src/ui/*.js`). `app.js` é legado e **não** é carregado
pelo `index.html`; não faz parte do app.

## 1. Telas

| Tela | Elemento raiz | O que faz |
|---|---|---|
| Abertura | `#opening` | Cena de entrada. `#openingSkip` ("Continuar") esconde e revela `#landing`. |
| Landing | `#landing` | Página de apresentação. `#openStudioBtn` abre o ateliê vazio; `.js-pick` abre o seletor de arquivo. |
| Ateliê | `#studioScreen` | Tela de trabalho. Contém o teatro (prévia), as três abas e a grade de cortes. |
| Aba I · Cena | `#tabScene` | Ler o filme, ajustar duração/quantidade/formato, ver resumo e o corte em tela. |
| Aba II · Legendas | `#tabCaptions` | Importar SRT/VTT, transcrever, editar blocos, escolher estilo, baixar SRT/ASS. |
| Aba III · Publicar | `#tabPublish` | Capa, ficha de publicação e exportação do corte. |
| Dúvidas | `#duvidas` | FAQ da landing (busca, expandir/recolher). Fora do ateliê. |
| Overlays | `#analysisOverlay`, `#whisperOverlay`, `#coverOverlay`, `#exportOverlay`, `#kitOverlay`, `#settingsOverlay`, `#diagnosticsOverlay` | Modais com `hidden` + `OverlayManager`. |

## 2. Elementos interativos (seletor → handler → resultado)

### Abertura / landing
| Seletor | Handler | Resultado |
|---|---|---|
| `#openingSkip` | `showOpening` (ui/main.js) | esconde a abertura, mostra a landing |
| `.js-pick`, `#openStudioBtn` | `setupGlobalListeners` (dom.js) | abre seletor / abre o ateliê |
| `#fileInput` (change) | `handleFileSelect` (dom.js) | valida, cria object URL, carrega no player, abre o ateliê |
| `#dropzone` (drop/paste) | `setupDropzone` | entrega o arquivo ao `#fileInput` |
| `#faqSearch`, `.faq-categories`, `#faqExpandAll`, `#faqCollapseAll` | `setupFaq` (`src/ui/faq.js`) | filtra por texto e categoria, expande/recolhe |

### Teatro (prévia)
| Seletor | Handler | Resultado |
|---|---|---|
| `#playBtn` | `PlayerController.togglePlay` | toca/pausa; respeita `state.playRange` |
| `#seekRange` (input/change) | `onSeekInput` / `onSeekChange` | move o vídeo, atualiza tempo |
| `#previewVideo` (timeupdate/seeked) | player + captions | tempo, marcadores e legenda sincronizada |
| `#focusRange` | `EditorController` | `--focus` do enquadramento |
| `#quickCaptionsBtn` | `setTab(state, "captions")` (dom.js) | abre a aba II |
| `#quickCoverBtn` | `CoverController.openCover` (dom.js) | abre a capa no quadro atual |
| `#markInBtn` / `#markOutBtn` | `EditorController` | marca início/fim (`I` / `O`) |
| `#addClipBtn` | `EditorController.addClip` | cria corte manual |
| `#splitClipBtn` | `EditorController.split` | divide o corte ativo (`S`) |
| `#deleteClipBtn` | `EditorController.deleteActive` | apaga o corte ativo (`Delete`) |
| `#undoBtn` / `#redoBtn` | `EditorController` | desfaz/refaz (`Ctrl+Z`, `Ctrl+Shift+Z`) |
| `#newFilmBtn` | `resetToLanding` (dom.js) | volta para a landing e limpa o estado |
| `#studioBack` | `leaveStudio` (dom.js) | volta para a landing sem perder o filme |
| `#diagnosticsBtn` / `Ctrl+Shift+D` | `DiagnosticsController` | abre o relatório |

### Aba I · Cena
| Seletor | Handler | Resultado |
|---|---|---|
| `.console-tab[data-tab]` | `setTab` em `src/ui/tabs.js` | troca painel, `aria-selected` e `tabIndex`; setas ←/→ |
| `#lenRange` | `SettingsController` | `settings.length`, rótulo `#lenLabel` |
| `#countRange` | `SettingsController` | `settings.count`, rótulo `#countLabel` |
| `#ratioGrid [data-ratio]` | `EditorController` + `SettingsController` | classe `r916/r11/r169`, `#previewFormat` |
| `#analyzeBtn` | `AnalysisController` | lê o filme, gera cortes, abre `#analysisOverlay` |
| `#analysisCancel` / `#analysisCancelBtn` | `AnalysisController.cancel` | cancela a leitura |
| `#clipGrid` (delegação) | `ClipController` | selecionar, tocar trecho, mover, apagar |

### Aba II · Legendas
| Seletor | Handler | Resultado |
|---|---|---|
| `#importSrtBtn` | `CaptionController` | abre `#srtInput` |
| `#srtInput` (change) | `CaptionController` | parse SRT/VTT → `state.cues` |
| `#whisperBtn` | `WhisperController` | abre `#whisperOverlay` |
| `#whisperStart` | `WhisperController` | extrai áudio, roda worker, grava `state.cues` |
| `#exportSrtBtn` / `#exportAssBtn` | `CaptionController` | baixa `.srt` / `.ass` |
| `#styleGrid [data-style]` | `CaptionController` + settings | estilo da legenda no frame |
| `#langSelect` | lido pelo Whisper | idioma |
| `#brandInput` | `SettingsController` | assinatura/marca |
| `#cueList` (input/click/change) | `CaptionController` | edita início/fim/texto, exclui e adiciona blocos |

### Aba III · Publicar
| Seletor | Handler | Resultado |
|---|---|---|
| `#coverBtn` | `CoverController` | abre capa, desenha quadro atual |
| `#coverTitle`, `#coverPreset` | `CoverController` | título e tratamento entram na capa |
| `#coverRandomBtn` | `CoverController` | sorteia quadro |
| `#coverDownload` | `CoverController` | baixa PNG |
| `#kitBtn` | `KitController` | abre ficha |
| `.js-copy` | `KitController.copy` | copia título/descrição/hashtags |
| `#kitDownloadCover` / `#kitDownloadTxt` | `KitController` | baixa capa / `.txt` |
| `#kitExport` | `KitController.exportVideo` | fecha a ficha e abre o modal de exportação |
| `#exportBtn` | `ExportController` | abre render |
| `#exportStart` | `ExportController` | canvas + MediaRecorder → MP4/H.264 (WebM se não houver suporte) |
| `#downloadLink` | link nativo | baixa o MP4 (ou WebM) |
| `#burnCaptions`, `#sampleExport`, `#brandWatermarkToggle` | lidos na exportação | opções do render |

### Ajustes
`#settingsClose`, `#settingsDone`, `#settingsReset`, `[data-theme-choice]`, `.js-theme`,
`#ambientToggle`, `#reducedMotionToggle`, `#soundToggle`, `#settingsLang` — todos com
handler em `SettingsController` / `ThemeController`.

## 3. Fluxo de estado do usuário

```
inicial → arquivo carregado → análise pronta (cortes) → corte escolhido
        → legendas (importadas ou transcritas) → capa/ficha → exportação → download
```

| Estado | Onde mora | Abas liberadas | Botões que exigem esse estado |
|---|---|---|---|
| `file` + `url` + `ready` | `StateManager` | I sempre; II e III abrem com estado vazio | `#analyzeBtn`, `#whisperBtn` |
| `clips.length > 0` | `state.clips` | I, II, III | `#coverBtn`, `#kitBtn`, `#exportBtn`, `#whisperBtn` (alvo = corte) |
| `activeId` | `state.activeId` | — | `#splitClipBtn`, `#deleteClipBtn` |
| `cues.length > 0` | `state.cues` | II | `#exportSrtBtn`, `#exportAssBtn`, queima de legenda |
| `exported` | `state.exported` | III | resultado do render |

Regra de ouro: **nenhuma aba fica morta**. Se faltar pré-requisito, a aba abre e
mostra uma dica com botão que leva ao passo que falta.

## 4. Estado central e máquina de estados

Estado único: `StateManager` (`src/ui/state.js`), exposto em
`window.__APOLLO_DEBUG__.state`. Quem lê: todos os controllers. Quem escreve:
`dom.js` (arquivo), `player.js` (duração/dimensões/ready), `analysis.js` (cortes),
`editor.js`/`clips.js` (cortes e ativo), `captions.js`/`whisper.js` (cues),
`export.js` (resultado), `settings.js` (preferências).

Transições explícitas:
`idle → loaded → analyzed → captioned → exported`
(`state.ui.tab` guarda a aba; `state.ui.step` guarda o passo).

Troca de aba: **uma única função**, `setTab(state, tab)` em `src/ui/tabs.js`.
Ela atualiza `state.ui.tab`, os botões (`active`, `aria-selected`), os painéis
(`hidden`), o `aria-controls`/`aria-labelledby` e dispara `tab:changed`.
Nenhum outro módulo mexe em `hidden` de painel.

## 5. Verificação

`tests/e2e/run-all.mjs` cobre upload, tema, processamento, edição/exportação,
transcrição e bordas. A auditoria acrescenta: abrir cada aba por clique real,
prévia do corte (miniatura + player no trecho), edição de legenda e ficha de
publicação preenchida.
