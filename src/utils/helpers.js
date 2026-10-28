/* ============================================================
   APOLLOCUT — Utilitários puros (sem DOM)
   ============================================================ */

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const pad2 = (n) => String(n).padStart(2, '0');

export function fmtTime(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

export function fmtBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2).replace('.', ',')} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function baseName(name) {
  return String(name || 'filme').replace(/\.[^.]+$/, '');
}

export function fileExt(name) {
  const match = String(name || '').match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toUpperCase() : 'VÍDEO';
}

export function focusableIn(el) {
  if (!el) return [];
  return [...el.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((node) => node.getClientRects().length > 0);
}