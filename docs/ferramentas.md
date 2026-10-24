# Ferramentas Instaladas

**Data**: 2026-10-23  
**Projeto**: ApolloCut – Redesign de Interface Autoral  
**Objetivo**: Instrumentar o OpenCode com as ferramentas necessárias para executar o redesign completo, preservando a funcionalidade e elevando a qualidade visual e de movimento.

## Instalação e Verificação

### 1. Superpowers (https://github.com/obra/superpowers)
**Instalação**: via npm global para o OpenCode (Windows)  
**Comando**: `npm install superpowers@git+https://github.com/obra/superpowers.git --prefix "$HOME\.config\opencode"`  
**Variável de ambiente**: `SUPERPOWERS_DISABLE_TELEMETRY=1`  
**Versão**: 7.0.1  
**Configuração**: plugin já presente em `opencode.json` (V2: `"plugins": ["superpowers@git+https://github.com/obra/superpowers.git"]`)  
**Verificação de skills**: confirmar com `opencode skill list` que as skills estão carregadas.  
**Status**: ✅ Instalado e disponível.

### 2. OpenCode
**Versão**: 2.1.4  
**Requisito do plugin RTK**: 1.18.29 ou superior (atendido)  
**Verificação**: `opencode --version`  
**Status**: ✅ Versão adequada.

### 3. RTK (https://github.com/rtk-ai/rtk)
**Instalação**: `winget install rtk-ai.rtk`  
**Versão**: 1.0.1  
**Comando de inicialização**: `rtk init -g --opencode`  
**Gancho registrado**: `rtk hook claude` (global)  
**Telemetria**: desativada  
**Verificação**: `rtk --version` → `rtk 1.0.1`; `rtk gain` exibe painel de economia.  
**Status**: ✅ Instalado e ativo.

### 4. Skills de Emil Kowalski (https://github.com/emilkowalski/skills)
**Instalação**: `npx skills@latest add emilkowalski/skills`  
**Skills instaladas**: 15  
**Lista**: animate, animate-expo, animation-performance, animation-vocabulary, apple-design, ask-sonner, break-ui, emil-design-eng, find-animation-opportunities, improve-animations, mobile-native, pick-ui-library, prototype, review-animations, write-swift  
**Verificação**: todas as skills listadas estão presentes na pasta `.agents/skills/`.  
**Status**: ✅ Instaladas e disponíveis.

### 5. agent-browser (Vercel Labs)
**Instalação**: `npm install -g agent-browser`  
**Versão**: 0.39.2  
**Comando de instalação do Chrome**: `agent-browser install` (já estava instalado, versão 156.0.8078.47)  
**Adição da skill**: `npx skills add vercel-labs/agent-browser`  
**Teste de funcionalidade**: abertura de página, captura de screenshot, fechamento — passou com sucesso.  
**Documentação de uso**: `agent-browser skills get core`  
**Status**: ✅ Instalado, configurado e testado.

## Observações Gerais
- Nenhuma ferramenta pagou ou requer assinatura foi utilizada.
- Todas as instalações foram feitas em ambiente local, sem telemetria (quando possível).
- As skills instaladas são recursos complementares ao fluxo de trabalho; suas instruções específicas serão invocadas conforme a necessidade de cada etapa do projeto.
- Para manter a integridade do projeto, todas as alterações futuras (se houver) deverão ser registradas neste documento, com versões e comandos executados.

## Próximos Passos
1. **Parte 2 – Modo Autônomo**: garantir que o projeto use git, criar branch `design/autoral` e worktrees conforme necessário.
2. **Parte 3 – Fluxo de Trabalho (Superpowers)**: iniciar com brainstorming estruturado e produção do spec de design.
3. **Parte 4 – Reconhecimento e Pesquisa de Referências**: mapear estado atual do app, capturar linha de base visual, auditar sinais de “design de IA”.
4. **Partes 5–10**: execução do redesign, validação com agent-browser, documentação e entrega final.

---
*Documento gerado automaticamente. Em caso de falha de instalação (após 3 tentativas), registrar motivo e alternativa no campo apropriado.*