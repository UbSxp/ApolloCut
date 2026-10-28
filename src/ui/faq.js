/* ============================================================
   APOLLOCUT - FAQ da landing
   Filtro por texto, categorias e expandir/recolher. Os botoes
   existiam no HTML sem nenhum handler.
   ============================================================ */

export function setupFaq() {
  const list = document.querySelector('.faq-list');
  const input = document.getElementById('faqSearch');
  if (!list || !input) return;

  const items = [...list.querySelectorAll('details')];
  const clear = document.querySelector('.faq-search-clear');
  const expand = document.getElementById('faqExpandAll');
  const collapse = document.getElementById('faqCollapseAll');
  const categories = document.querySelector('.faq-categories');

  let category = 'todas';

  // Aviso de busca sem resultado.
  const empty = document.createElement('p');
  empty.className = 'fine-print';
  empty.textContent = 'Nenhuma pergunta encontrada. Tente outra palavra.';
  empty.hidden = true;
  list.appendChild(empty);

  const label = (value) => ({ exportacao: 'Exportação' }[value] || value.charAt(0).toUpperCase() + value.slice(1));

  const apply = () => {
    const query = input.value.trim().toLowerCase();
    let visible = 0;

    items.forEach((item) => {
      const text = item.textContent.toLowerCase();
      const inCategory = category === 'todas' || item.dataset.category === category;
      const match = !query || text.includes(query);
      item.hidden = !(inCategory && match);
      if (!item.hidden) visible++;
    });

    if (clear) clear.hidden = !query;
    if (empty) empty.hidden = visible > 0;
  };

  if (categories) {
    const names = ['todas', ...new Set(items.map((item) => item.dataset.category).filter(Boolean))];
    categories.innerHTML = '';
    names.forEach((name, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn btn-line btn-sm${index === 0 ? ' active' : ''}`;
      btn.dataset.category = name;
      btn.textContent = name === 'todas' ? 'Todas' : label(name);
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(index === 0));
      btn.addEventListener('click', () => {
        category = name;
        categories.querySelectorAll('[data-category]').forEach((other) => {
          const active = other === btn;
          other.classList.toggle('active', active);
          other.setAttribute('aria-selected', String(active));
        });
        apply();
      });
      categories.appendChild(btn);
    });
  }

  input.addEventListener('input', apply);
  clear?.addEventListener('click', () => {
    input.value = '';
    input.focus();
    apply();
  });
  expand?.addEventListener('click', () => {
    items.filter((item) => !item.hidden).forEach((item) => { item.open = true; });
  });
  collapse?.addEventListener('click', () => {
    items.forEach((item) => { item.open = false; });
  });

  apply();
}
