/* ============================================================
   APOLLOCUT — Tema (dia / noite / automático)
   Fonte única de verdade: `state.settings.theme`.
   ============================================================ */

const META_COLORS = { light: '#f6efe3', dark: '#0c1420' };

export function resolveTheme(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Aplica o tema no documento inteiro: atributo, meta theme-color,
 * ícones e aria-pressed dos controles.
 */
export function applyTheme(pref) {
  const resolved = resolveTheme(pref);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePref = pref;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', META_COLORS[resolved]);

  // Botão do cabeçalho: alterna, então mostra o destino.
  document.querySelectorAll('.js-theme').forEach((btn) => {
    const dark = resolved === 'dark';
    btn.setAttribute('aria-pressed', String(dark));
    btn.setAttribute('aria-label', dark ? 'Ativar tema claro' : 'Ativar tema escuro');
    btn.setAttribute('title', dark ? 'Ativar tema claro' : 'Ativar tema escuro');
    const use = btn.querySelector('use');
    if (use) use.setAttribute('href', dark ? '#i-sun' : '#i-moon');
  });

  // Botões Dia / Noite / Automático.
  document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
    const active = btn.dataset.themeChoice === pref;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });

  return resolved;
}

export class ThemeController {
  constructor(state, toast) {
    this.state = state;
    this.toast = toast;
    this.media = window.matchMedia('(prefers-color-scheme: dark)');
    this.wire();
    applyTheme(state.settings.theme);
  }

  wire() {
    document.querySelectorAll('.js-theme').forEach((btn) => {
      btn.addEventListener('click', () => this.toggle());
    });

    document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
      btn.addEventListener('click', () => this.set(btn.dataset.themeChoice));
    });

    // "auto" precisa reagir à mudança do sistema operacional.
    const onChange = () => {
      if (this.state.settings.theme === 'auto') applyTheme('auto');
    };
    if (this.media.addEventListener) this.media.addEventListener('change', onChange);
    else if (this.media.addListener) this.media.addListener(onChange);
  }

  set(pref) {
    if (!['light', 'dark', 'auto'].includes(pref)) return;
    this.state.updateSettings({ theme: pref });
    applyTheme(pref);
  }

  toggle() {
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    this.set(current === 'dark' ? 'light' : 'dark');
  }
}
