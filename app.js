(() => {
  'use strict';

  const config = window.HFAI_CONFIG || {};
  const query = new URLSearchParams(window.location.search);
  const isHome = document.querySelector('[data-home]') !== null;
  const userAgent = navigator.userAgent || navigator.vendor || '';
  const isAndroid = /android/i.test(userAgent);
  const isIOS =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const platform = isIOS ? 'ios' : isAndroid ? 'android' : 'desktop';
  const storeUrl = platform === 'ios' ? config.iosUrl : platform === 'android' ? config.androidUrl : '';

  document.documentElement.dataset.platform = platform;
  document.querySelectorAll('[data-year]').forEach((node) => {
    node.textContent = new Date().getFullYear();
  });

  document.querySelectorAll('[data-store]').forEach((link) => {
    const target = link.dataset.store === 'ios' ? config.iosUrl : config.androidUrl;
    if (target) {
      link.href = target;
      link.removeAttribute('aria-disabled');
      link.classList.remove('is-disabled');
    } else {
      link.href = '#availability';
      link.setAttribute('aria-disabled', 'true');
      link.classList.add('is-disabled');
      const label = link.querySelector('[data-store-label]');
      if (label && link.dataset.storeUnavailable) label.textContent = link.dataset.storeUnavailable;
      if (link.dataset.storeUnavailable) link.setAttribute('aria-label', link.dataset.storeUnavailable);
    }
  });

  document.querySelectorAll('[data-email="support"]').forEach((link) => {
    if (!config.supportEmail) return;
    link.href = `mailto:${config.supportEmail}`;
    if (link.dataset.showAddress !== undefined) link.textContent = config.supportEmail;
  });
  document.querySelectorAll('[data-email="privacy"]').forEach((link) => {
    if (!config.privacyEmail) return;
    if (link.hasAttribute('href')) {
      const mailOptions = link.getAttribute('href').match(/\?.*$/)?.[0] ?? '';
      link.href = `mailto:${config.privacyEmail}${mailOptions}`;
    }
    if (link.dataset.showAddress !== undefined) link.textContent = config.privacyEmail;
  });

  const navToggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
      const open = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!open));
      nav.dataset.open = String(!open);
    });
    nav.querySelectorAll('a').forEach((link) =>
      link.addEventListener('click', () => {
        navToggle.setAttribute('aria-expanded', 'false');
        nav.dataset.open = 'false';
      }),
    );
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('[data-phone-preview]').forEach((preview) => {
    const previewSlides = [...preview.children];
    if (previewSlides.length < 2) return;
    let activeSlide = 0;
    let timer;

    const schedulePreview = () => {
      window.clearInterval(timer);
      if (document.hidden || reducedMotion.matches) return;
      timer = window.setInterval(() => {
        const nextSlide = (activeSlide + 1) % previewSlides.length;
        const nextFrame = previewSlides[nextSlide];
        if (nextFrame instanceof HTMLImageElement &&
            (!nextFrame.complete || !nextFrame.naturalWidth)) return;

        previewSlides[activeSlide].hidden = true;
        previewSlides[activeSlide].setAttribute('aria-hidden', 'true');
        nextFrame.hidden = false;
        nextFrame.removeAttribute('aria-hidden');
        activeSlide = nextSlide;
      }, 6000);
    };

    reducedMotion.addEventListener('change', schedulePreview);
    document.addEventListener('visibilitychange', schedulePreview);
    schedulePreview();
  });

  const revealNodes = document.querySelectorAll('[data-reveal]');
  const resultAnimations = document.querySelectorAll('[data-result-animation]');
  if (resultAnimations.length && 'IntersectionObserver' in window) {
    const resultObserver = new IntersectionObserver((entries, observer) => {
      for (const { intersectionRatio, target: video } of entries) {
        if (intersectionRatio < .55 || reducedMotion.matches) continue;
        observer.unobserve(video);
        video.play().catch(() => {
          // The static result remains visible if autoplay is blocked.
        });
      }
    }, { threshold: .55 });

    resultAnimations.forEach((video) => {
      video.addEventListener('playing', () => {
        if (!reducedMotion.matches) video.setAttribute('data-playing', '');
      }, { once: true });
      resultObserver.observe(video);
    });
    reducedMotion.addEventListener('change', () => {
      if (!reducedMotion.matches) return;
      resultAnimations.forEach((video) => {
        video.pause();
        video.removeAttribute('data-playing');
      });
    });
  }
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.dataset.visible = 'true';
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    revealNodes.forEach((node) => observer.observe(node));
  } else {
    revealNodes.forEach((node) => (node.dataset.visible = 'true'));
  }

  const redirectPanel = document.querySelector('[data-redirect-panel]');
  const redirectCount = document.querySelector('[data-redirect-count]');
  const redirectLink = document.querySelector('[data-redirect-link]');
  const redirectCancel = document.querySelector('[data-redirect-cancel]');
  const redirectSuppressed =
    query.has('stay') ||
    query.has('no_redirect') ||
    window.sessionStorage.getItem('hfai-stay-on-site') === 'true';

  if (redirectLink && storeUrl) redirectLink.href = storeUrl;

  if (isHome && storeUrl && platform !== 'desktop' && !redirectSuppressed && redirectPanel) {
    redirectPanel.hidden = false;
    const delay = Math.max(Number(config.redirectDelayMs) || 1600, 800);
    const started = performance.now();
    let cancelled = false;
    let frame;

    const update = (now) => {
      const remaining = Math.max(0, delay - (now - started));
      if (redirectCount) redirectCount.textContent = (remaining / 1000).toFixed(1);
      if (remaining <= 0 && !cancelled) {
        window.location.assign(storeUrl);
        return;
      }
      frame = window.requestAnimationFrame(update);
    };

    redirectCancel?.addEventListener('click', () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.sessionStorage.setItem('hfai-stay-on-site', 'true');
      redirectPanel.hidden = true;
    });
    frame = window.requestAnimationFrame(update);
  }
})();
