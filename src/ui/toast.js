/* ============================================================
   APOLLOCUT — Toast Manager
   ============================================================ */

export class ToastManager {
  constructor() {
    this.container = document.getElementById('toasts') || this.createContainer();
  }
  
  createContainer() {
    const container = document.createElement('div');
    container.id = 'toasts';
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', 'Notificações');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
    return container;
  }
  
  /**
   * Show a toast message
   * @param {string} message - Message to show
   * @param {'ok'|'error'} type - Toast type
   * @param {number} ms - Duration in milliseconds
   */
  show(message, type = 'ok', ms = 4200) {
    const el = document.createElement('div');
    el.className = `toast${type === 'error' ? ' error' : ''}`;
    el.textContent = message;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.tabIndex = 0;
    
    this.container.append(el);
    
    let timer = 0;
    const dismiss = () => {
      clearTimeout(timer);
      el.classList.add('out');
      setTimeout(() => el.remove(), 220);
    };
    
    timer = setTimeout(dismiss, ms);
    el.addEventListener('click', dismiss);
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        dismiss();
      }
    });
  }
  
  /**
   * Show success toast
   */
  success(message, ms) {
    this.show(message, 'ok', ms);
  }
  
  /**
   * Show error toast
   */
  error(message, ms) {
    this.show(message, 'error', ms);
  }
}