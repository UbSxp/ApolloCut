/* ============================================================
   APOLLOCUT — Overlay Manager
   ============================================================ */

export class OverlayManager {
  constructor() {
    this.lastFocus = null;
  }
  
  /**
   * Open an overlay
   * @param {HTMLElement} el - Overlay element
   */
  open(el) {
    if (!el) return;
    this.lastFocus = document.activeElement;
    el.hidden = false;
    document.body.classList.add('modal-open');
    el.setAttribute('aria-hidden', 'false');
    
    // Focus first focusable element
    requestAnimationFrame(() => {
      const first = this.getFocusable(el)[0];
      if (first) first.focus({ preventScroll: true });
    });
  }
  
  /**
   * Close an overlay
   * @param {HTMLElement} el - Overlay element
   */
  close(el) {
    if (!el) return;
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
    
    // Check if any other overlay is open
    if (!document.querySelector('.overlay:not([hidden])')) {
      document.body.classList.remove('modal-open');
    }
    
    // Restore focus
    const target = this.lastFocus;
    this.lastFocus = null;
    if (target && target.isConnected && typeof target.focus === 'function') {
      target.focus({ preventScroll: true });
    }
  }
  
  /**
   * Close all overlays
   */
  closeAll() {
    const overlays = document.querySelectorAll('.overlay:not([hidden])');
    overlays.forEach(el => this.close(el));
  }
  
  /**
   * Get focusable elements within an element
   */
  getFocusable(el) {
    if (!el) return [];
    return [...el.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter(node => node.getClientRects().length > 0);
  }
  
  /**
   * Trap focus within an element
   * @param {HTMLElement} el - Element to trap focus in
   */
  trapFocus(el) {
    const focusable = this.getFocusable(el);
    if (!focusable.length) return;
    
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    
    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus({ preventScroll: true });
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus({ preventScroll: true });
        }
      }
    };
    
    el.addEventListener('keydown', handleTab);
    
    // Return cleanup function
    return () => el.removeEventListener('keydown', handleTab);
  }
}