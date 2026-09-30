/* Progressive enhancement: every paper and citation also works without JS. */
(() => {
  const tools = document.querySelector('.publication-tools');
  if (tools) {
    const papers = [...document.querySelectorAll('.publication-list .paper')];
    const groups = [...document.querySelectorAll('.year-group')];
    const filters = [...tools.querySelectorAll('[data-filter]')];
    const search = document.getElementById('publication-search');
    const year = document.getElementById('year-filter');
    const count = document.getElementById('publication-count');
    const empty = document.querySelector('.no-results');
    const reset = tools.querySelector('.reset-filters');
    const searchable = new Map(papers.map(paper => [paper, [
      paper.querySelector('.paper-title').textContent,
      paper.querySelector('.paper-authors').textContent,
      paper.querySelector('.paper-venue').textContent,
      paper.querySelector('.paper-kicker').textContent,
    ].join(' ').toLocaleLowerCase()]));
    let type = 'all';

    function applyFilters() {
      const words = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      let visible = 0;
      for (const paper of papers) {
        const matches = (type === 'all' || paper.dataset.type === type)
          && (year.value === 'all' || paper.dataset.year === year.value)
          && words.every(word => searchable.get(paper).includes(word));
        paper.hidden = !matches;
        visible += Number(matches);
      }
      for (const group of groups) group.hidden = !group.querySelector('.paper:not([hidden])');
      for (const button of filters) button.setAttribute('aria-pressed', String(button.dataset.filter === type));
      count.textContent = `${visible} of ${papers.length} publications`;
      empty.hidden = visible > 0;
      reset.hidden = type === 'all' && year.value === 'all' && !search.value;
    }
    filters.forEach(button => button.addEventListener('click', () => {
      type = button.dataset.filter;
      applyFilters();
    }));
    search.addEventListener('input', applyFilters);
    year.addEventListener('change', applyFilters);
    reset.addEventListener('click', () => {
      type = 'all';
      search.value = '';
      year.value = 'all';
      applyFilters();
      search.focus();
    });
    tools.hidden = false;
    applyFilters();
  }

  // Clipboard failure keeps the selectable citation visible for manual copying.
  if (navigator.clipboard?.writeText) {
    document.querySelectorAll('.copy-citation').forEach(button => {
      button.hidden = false;
      button.addEventListener('click', async () => {
        const code = button.closest('.citation-panel').querySelector('code').textContent;
        const status = document.getElementById('copy-status');
        try {
          await navigator.clipboard.writeText(code);
          button.textContent = 'Copied';
          if (status) status.textContent = 'BibTeX copied to clipboard.';
        } catch {
          button.textContent = 'Select text to copy';
          if (status) status.textContent = 'Clipboard unavailable. Select the citation text to copy it.';
        }
        window.setTimeout(() => { button.textContent = 'Copy BibTeX'; }, 2000);
      });
    });
  }
})();
