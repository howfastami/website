(() => {
  const pickers = [...document.querySelectorAll('.language-picker')];
  if (!pickers.length) return;
  const preferenceKey = 'hfai-language';
  const current = pickers[0].querySelector('[aria-current]').dataset.locale;
  const links = [...pickers[0].querySelectorAll('[data-locale]')];
  const supported = new Set(links.map(link => link.dataset.locale));

  function matchLocale(language) {
    const tag = language.toLowerCase();
    const [base] = tag.split('-');
    if (base === 'zh') return /(?:^|-)(hant|tw|hk|mo)(?:-|$)/.test(tag) ? 'zh-hant' : 'zh-hans';
    if (base === 'pt') return 'pt-br';
    return supported.has(base) ? base : null;
  }

  let saved;
  try {
    saved = localStorage.getItem(preferenceKey);
  } catch {
    // The ordinary locale links work when storage is unavailable.
  }

  const preferred = supported.has(saved) ? saved :
    (navigator.languages || [navigator.language]).filter(Boolean).map(matchLocale).find(Boolean);
  const suggestion = document.querySelector('[data-language-suggestion]');
  const suggestedLink = links.find(link => link.dataset.locale === preferred);
  if (suggestion && suggestedLink && current === 'en' && preferred !== current) {
    suggestion.querySelector('[data-suggestion-link]').replaceWith(suggestedLink.cloneNode(true));
    suggestion.hidden = false;
    suggestion.querySelector('button').addEventListener('click', () => {
      suggestion.hidden = true;
      try {
        localStorage.setItem(preferenceKey, current);
      } catch {
        // Dismissal still works for the current page.
      }
    });
  }

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    pickers.forEach(picker => {
      if (picker.open && !picker.contains(event.target)) picker.open = false;
    });
    const link = event.target.closest('a[data-locale]');
    if (!link || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    try {
      localStorage.setItem(preferenceKey, link.dataset.locale);
      sessionStorage.setItem('hfai-stay-on-site', 'true');
    } catch {
      // Switching languages also works without a saved preference.
    }
    if (link.getAttribute('aria-current') === 'page') {
      event.preventDefault();
      if (suggestion) suggestion.hidden = true;
      const picker = link.closest('details');
      picker.open = false;
      picker.querySelector('summary').focus();
      return;
    }
    const target = new URL(link.href);
    target.search = location.search;
    target.hash = location.hash;
    event.preventDefault();
    location.assign(target.href);
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const open = pickers.find(picker => picker.open);
    if (open) {
      open.open = false;
      open.querySelector('summary').focus();
    }
  });
})();
