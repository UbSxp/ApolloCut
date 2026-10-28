/* ============================================================
   APOLLOCUT - Abas do atelie
   Fonte unica de verdade para trocar de aba: estado, botoes e
   paineis andam juntos. Nenhum outro modulo mexe em `hidden`.
   ============================================================ */

export const TAB_NAMES = ['scene', 'captions', 'publish'];

const PANEL_ID = {
  scene: 'tabScene',
  captions: 'tabCaptions',
  publish: 'tabPublish',
};

export function setTab(state, tab) {
  if (!TAB_NAMES.includes(tab)) return;
  state.ui.tab = tab;

  document.querySelectorAll('.console-tab[data-tab]').forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
    btn.tabIndex = active ? 0 : -1;
    if (active) btn.setAttribute('aria-controls', PANEL_ID[tab]);
  });

  TAB_NAMES.forEach((name) => {
    const panel = document.getElementById(PANEL_ID[name]);
    if (panel) panel.hidden = name !== tab;
  });

  syncTabState(state);
  window.dispatchEvent(new CustomEvent('tab:changed', { detail: { tab } }));
}

/** Habilita/desabilita o que depende do estado e mostra as dicas. */
export function syncTabState(state) {
  const hasFile = Boolean(state.url);
  const hasClips = state.clips.length > 0;
  const hasCues = state.cues.length > 0;

  const captionsHint = document.getElementById('captionsHint');
  if (captionsHint) captionsHint.hidden = hasFile;

  const publishHint = document.getElementById('publishHint');
  if (publishHint) publishHint.hidden = hasClips;

  const coverBtn = document.getElementById('coverBtn');
  if (coverBtn) coverBtn.disabled = !hasFile;

  ['kitBtn', 'exportBtn'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !hasClips;
  });

  const exportSrtBtn = document.getElementById('exportSrtBtn');
  const exportAssBtn = document.getElementById('exportAssBtn');
  [exportSrtBtn, exportAssBtn].forEach((btn) => {
    if (btn) btn.disabled = !hasCues;
  });
}

/** Liga os botoes de aba e o teclado (setas) do tablist. */
export function setupTabs(state) {
  const buttons = [...document.querySelectorAll('.console-tab[data-tab]')];
  if (!buttons.length) return;

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => setTab(state, btn.dataset.tab));
  });

  const list = buttons[0].parentElement;
  if (list) {
    list.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      const current = buttons.findIndex((b) => b.dataset.tab === state.ui.tab);
      const next = (current + step + buttons.length) % buttons.length;
      setTab(state, buttons[next].dataset.tab);
      buttons[next].focus();
    });
  }

  setTab(state, state.ui.tab || 'scene');

  const goScene = document.getElementById('publishGoScene');
  if (goScene) goScene.addEventListener('click', () => setTab(state, 'scene'));
  const goCaptions = document.getElementById('captionsGoScene');
  if (goCaptions) goCaptions.addEventListener('click', () => setTab(state, 'scene'));
}
