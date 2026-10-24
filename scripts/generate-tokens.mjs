// scripts/generate-tokens.mjs
// Gera os arquivos CSS de tokens a partir do spec (versão 3).

import fs from 'fs';
import path from 'path';

const outDir = path.resolve('tokens');
fs.mkdirSync(outDir, { recursive: true });

// 1. theme.css
const themeCss = `:root {
  /* Posição do sol (normalizada -1 a 1) */
  --luz-x: 0.5;
  --luz-y: -0.5;

  /* Fase do tema: 0=aurora, 0.33=dia, 0.66=entardecer, 1=noite */
  --tema-fase: 0;

  /* Cores das 4 fases (OKLCH L C H) */
  --phase-aurora: 0.90 0.06 45;
  --phase-day: 0.96 0.02 60;
  --phase-dusk: 0.85 0.10 30;
  --phase-night: 0.18 0.04 240;

  /* Transição suave entre fases */
  --theme-transition: background-color 700ms cubic-bezier(0.25,0.46,0.45,0.94),
                      color 700ms cubic-bezier(0.25,0.46,0.45,0.94);
}

/* Classe utilitária para desligar transição quando prefers-reduced-motion */
@media (prefers-reduced-motion: reduce) {
  :root {
    --theme-transition: none;
  }
}
`;
fs.writeFileSync(path.join(outDir, 'theme.css'), themeCss);
console.log('✓ tokens/theme.css escrito');

// 2. spacing.css
const spacingCss = `:root {
  /* Módulo base (M) = 8px */
  --M: 8px;

  /* Espaçamento semântico – múltiplos limpos de M */
  --space-inset-xs: calc(0.25 * var(--M));   /* 2px  */
  --space-inset-sm: calc(0.5  * var(--M));   /* 4px  */
  --space-inset-md: calc(1    * var(--M));   /* 8px  */
  --space-inset-lg: calc(2    * var(--M));   /* 16px */

  --space-stack-xs: calc(0.5  * var(--M));
  --space-stack-sm: calc(1    * var(--M));
  --space-stack-md: calc(2    * var(--M));
  --space-stack-lg: calc(3    * var(--M));   /* 24px */

  --space-inline-xs: calc(0.5  * var(--M));
  --space-inline-sm: calc(1    * var(--M));
  --space-inline-md: calc(2    * var(--M));   /* 16px */
  --space-inline-lg: calc(3    * var(--M));   /* 24px */
}
`;
fs.writeFileSync(path.join(outDir, 'spacing.css'), spacingCss);
console.log('✓ tokens/spacing.css escrito');

// 3. typography.css
const typographyCss = `@font-face {
  font-family: 'Marcellus';
  src: url('../fonts/Marcellus-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Figtree';
  src: url('../fonts/Figtree-VariableFont_wght.woff2') format('woff2-variations');
  font-weight: 400 600;
  font-style: normal;
  font-display: swap;
}

:root {
  --font-heading: 'Marcellus', Georgia, serif;
  --font-body: 'Figtree', system-ui, sans-serif;

  /* Escala tipográfica fluida (clamp) */
  --text-display: clamp(2.5rem, 5vw, 4rem) / 1.1 var(--font-heading);
  --text-h1:      clamp(2rem,   4vw, 3rem)   / 1.2 var(--font-heading);
  --text-h2:      clamp(1.5rem, 3vw, 2.25rem) / 1.3 var(--font-heading);
  --text-h3:      clamp(1.25rem, 2.5vw, 1.75rem) / 1.35 var(--font-heading);
  --text-body-lg: 1.125rem / 1.6 var(--font-body);
  --text-body:    1rem     / 1.6 var(--font-body);
  --text-body-sm: 0.875rem / 1.5 var(--font-body);
  --text-caption: 0.75rem  / 1.5 var(--font-body);
}
`;
fs.writeFileSync(path.join(outDir, 'typography.css'), typographyCss);
console.log('✓ tokens/typography.css escrito');

// 4. colors.css
const colorsCss = `:root {
  /* Paleta de materiais (OKLCH L C H) + hex fallback */
  --stone-pentelic:      0.96 0.006 85;   /* #F2F0EB */
  --marble-parian:       0.98 0.003 90;   /* #FAFAF8 */
  --surface-hover:       0.94 0.005 80;   /* #E8E4DC */
  --border-default:      0.88 0.008 70;   /* #D0C8BD */
  --border-focus:        0.78 0.12  85;   /* #C9A84C (gold-leaf) */
  --aegean-deep:         0.38 0.12  240;  /* #1A3A6E */
  --aurora-blue:         0.55 0.10  210;  /* #4A8FC2 */
  --gold-leaf:           0.78 0.12  85;   /* #C9A84C */
  --amphora-terracotta:  0.48 0.14  25;   /* #C04020 */
  --black-figure:        0.10 0.00  0;    /* #101010 */
  --laurel-muted:        0.45 0.06  130;  /* #5A7A5A */
  --error-bg:            0.95 0.03  20;   /* #FDEAE6 */
  --success-bg:          0.94 0.03  130;  /* #E6F4EA */
}

/* Helpers de cor para uso direto em componentes */
:root {
  --color-bg-primary: var(--stone-pentelic);
  --color-bg-elevated: var(--marble-parian);
  --color-bg-hover: var(--surface-hover);
  --color-border: var(--border-default);
  --color-border-focus: var(--border-focus);
  --color-text-primary: var(--aegean-deep);
  --color-accent-blue: var(--aurora-blue);
  --color-gold: var(--gold-leaf);
  --color-error: var(--amphora-terracotta);
  --color-text-on-light: var(--black-figure);
  --color-success-muted: var(--laurel-muted);
  --color-bg-error: var(--error-bg);
  --color-bg-success: var(--success-bg);
}
`;
fs.writeFileSync(path.join(outDir, 'colors.css'), colorsCss);
console.log('✓ tokens/colors.css escrito');

console.log('\n✅ Todos os tokens CSS gerados em', outDir);