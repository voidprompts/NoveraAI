(() => {
  const data = window.NOVERA_DATA;
  const siteConfig = window.NOVERA_SITE_CONFIG || { siteName: 'Novera', siteUrl: '', adsense: { publisherId: '', slots: {} } };
  const categories = data.categories;
  const tools = data.tools;
  const posts = window.NOVERA_POSTS || [];
  const bySlug = (slug) => categories.find(c => c.slug === slug);
  const toolBySlug = (slug) => tools.find(t => t.slug === slug);
  const page = document.body.dataset.page || 'home';

  const icons = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-5L5 20"/>',
    play: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3Z"/>',
    wave: '<path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"/>',
    code: '<path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/>',
    spark: '<path d="m12 3-1.3 4.1a5 5 0 0 1-3.3 3.3L3 12l4.3 1.5a5 5 0 0 1 3.2 3.2L12 21l1.5-4.3a5 5 0 0 1 3.2-3.2L21 12l-4.3-1.5a5 5 0 0 1-3.2-3.2Z"/>',
    megaphone: '<path d="m3 11 16-6v14L3 13Z"/><path d="M11.6 16 13 21H8l-1.4-6.5M19 9a3 3 0 0 1 0 6"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    chat: '<path d="M20 15a4 4 0 0 1-4 4H8l-5 3V8a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4Z"/><path d="M8 10h8M8 14h5"/>',
    book: '<path d="M4 5a3 3 0 0 1 3-1h5v16H7a3 3 0 0 0-3 1ZM20 5a3 3 0 0 0-3-1h-5v16h5a3 3 0 0 1 3 1Z"/>',
    arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
    chevron: '<path d="m8 10 4 4 4-4"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    shield: '<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'
  };

  function icon(name, small = false) {
    return `<svg class="icon${small ? ' icon-sm' : ''}" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.spark}</svg>`;
  }

  function initials(name) {
    const cleaned = name.replace(/AI|·|\./g, ' ').trim().split(/\s+/);
    if (cleaned.length === 1) return cleaned[0].slice(0, 2).toUpperCase();
    return cleaned.slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  function logoColor(categorySlug) {
    return bySlug(categorySlug)?.color || '#E8EFE8';
  }

  function arrow() { return `<span class="arrow">${icon('arrow', true)}</span>`; }
  function brand() {
    return `<a class="brand" href="/" aria-label="Novera home">
      <span class="brand-mark" aria-hidden="true"><span class="brand-dot"></span></span>
      <span class="brand-copy"><span class="brand-name">Novera</span><span class="brand-meta">AI DIRECTORY</span></span>
    </a>`;
  }

  function renderHeader() {
    const header = document.getElementById('site-header');
    if (!header) return;
    const items = categories.map(c => `
      <a class="dropdown-item" href="/categories/${c.slug}/">
        <span class="dropdown-icon" style="background:${c.color}">${icon(c.icon, true)}</span>${c.name}
      </a>`).join('');
    header.className = 'site-header';
    header.innerHTML = `<a class="skip-link" href="#main">Skip to content</a>
      <div class="container nav-shell">
        ${brand()}
        <span class="nav-spacer"></span>
        <form class="nav-search js-search-form" role="search">
          ${icon('search', true).replace('class="icon icon-sm"', 'class="icon icon-sm search-ico"')}
          <input name="q" type="search" placeholder="Search AI tools" aria-label="Search AI tools" autocomplete="off">
          <span class="key">/</span>
        </form>
        <nav class="nav-actions" aria-label="Primary navigation">
          <details class="category-menu">
            <summary><span>Categories</span>${icon('chevron', true).replace('class="icon icon-sm"', 'class="icon icon-sm chev"')}</summary>
            <div class="dropdown-panel">${items}<a class="dropdown-item dropdown-all" href="/categories/">View every category ${arrow()}</a></div>
          </details>
          <a class="btn btn-primary nav-browse" href="/categories/">Browse Categories</a>
        </nav>
      </div>`;
  }

  function renderFooter() {
    const footer = document.getElementById('site-footer');
    if (!footer) return;
    const columns = [categories.slice(0,4), categories.slice(4,8), categories.slice(8,12)];
    footer.className = 'site-footer';
    footer.innerHTML = `<div class="container">
      <div class="footer-top">
        <div class="footer-brand">${brand()}<p>A calm, carefully organized place to discover the right AI tool for the work in front of you.</p></div>
        <div class="footer-links">
          ${columns.map((col, i) => `<div class="footer-column"><h3>${i === 0 ? 'Create' : i === 1 ? 'Work' : 'Explore'}</h3>${col.map(c => `<a href="/categories/${c.slug}/">${c.name}</a>`).join('')}</div>`).join('')}
          <div class="footer-column"><h3>Directory</h3><a href="/all-tools/">All tools</a><a href="/new/">New this week</a><a href="/guides/">Guides & comparisons</a><a href="/categories/">Categories</a><a href="/submit/">Submit a tool</a></div>
        </div>
      </div>
      <div class="footer-bottom"><span>© 2026 Novera. Designed for clear decisions.</span><span class="footer-legal"><a href="/about/">About</a><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><a href="/contact/">Contact</a></span><span class="footer-status"><i class="status-dot"></i>Directory refreshed daily</span></div>
    </div>`;
  }

  function categoryCard(c) {
    return `<a class="category-card" href="/categories/${c.slug}/">
      <span class="category-icon" style="background:${c.color}">${icon(c.icon)}</span>
      <h3>${c.name}</h3><p>${c.description}</p>
      <span class="category-card-foot"><span>${c.count} tools</span>${arrow()}</span>
    </a>`;
  }

  function toolCard(t) {
    const c = bySlug(t.category);
    return `<a class="tool-card" href="/tools/${t.slug}/" data-pricing="${t.pricing}" data-category="${t.category}" data-rating="${t.rating}" data-name="${t.name.toLowerCase()}">
      <span class="tool-card-top"><span class="tool-logo" style="--logo-bg:${logoColor(t.category)}">${initials(t.name)}</span><span class="pricing-badge" data-price="${t.pricing}">${t.pricing}</span></span>
      <h3>${t.name}</h3><p class="tagline">${t.tagline}</p>
      <span class="tool-card-bottom"><span class="tool-cat">${c.name}</span><span class="visit-link">View tool ${arrow()}</span></span>
    </a>`;
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
  }

  function postCard(post) {
    const relatedTools = (post.toolSlugs || []).map(toolBySlug).filter(Boolean);
    return `<a class="post-card" href="/guides/${post.slug}/"><span class="post-card-art"><span class="post-art-orbit"></span><span class="post-art-count">${relatedTools.length}</span><span class="post-art-label">AI TOOLS</span></span><span class="post-card-body"><span class="post-meta">${post.type || 'Weekly roundup'} · ${formatDate(post.date)}</span><h3>${post.title}</h3><p>${post.description}</p><span class="post-card-foot"><span>${post.readingTime || 5} min read</span><span class="text-link">Read guide ${arrow()}</span></span></span></a>`;
  }

  function adUnit(placement) {
    const publisher = siteConfig.adsense?.publisherId || '';
    const slot = siteConfig.adsense?.slots?.[placement] || '';
    if (!/^ca-pub-\d+$/.test(publisher) || !/^\d+$/.test(slot)) return '';
    return `<aside class="ad-unit" aria-label="Advertisement"><span class="ad-label">Advertisement</span><ins class="adsbygoogle" style="display:block" data-ad-client="${publisher}" data-ad-slot="${slot}" data-ad-format="auto" data-full-width-responsive="true"></ins></aside>`;
  }

  function initAdsense() {
    const publisher = siteConfig.adsense?.publisherId || '';
    if (!/^ca-pub-\d+$/.test(publisher) || !document.querySelector('.adsbygoogle')) return;
    if (!document.querySelector('script[data-novera-adsense]')) {
      const script = document.createElement('script');
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset.noveraAdsense = 'true';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisher}`;
      document.head.appendChild(script);
    }
    document.querySelectorAll('.adsbygoogle:not([data-requested])').forEach(unit => {
      unit.dataset.requested = 'true';
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (_) { /* blocked ads stay unobtrusive */ }
    });
  }

  function breadcrumbs(parts) {
    return `<div class="breadcrumbs"><a href="/">Home</a>${parts.map((p, i) => `${icon('chevron', true)}${p.href && i < parts.length - 1 ? `<a href="${p.href}">${p.label}</a>` : `<span>${p.label}</span>`}`).join('')}</div>`;
  }

  function renderHome() {
    const main = document.getElementById('main');
    const featured = tools.filter(t => t.featured).slice(0,6);
    main.innerHTML = `<section class="hero">
      <span class="orbit" aria-hidden="true"></span>
      <div class="container"><div class="hero-inner reveal">
        <span class="eyebrow">Curated for useful work</span>
        <h1>All the AI tools.<br><span class="accent">Organized.</span></h1>
        <p class="hero-copy">Discover thoughtfully selected AI tools, clearly categorized so you can spend less time searching and more time creating.</p>
        <form class="hero-search js-search-form" role="search">
          ${icon('search').replace('class="icon"', 'class="icon search-ico"')}
          <input name="q" type="search" placeholder="What do you want to do?" aria-label="Search all AI tools" autocomplete="off">
          <button type="submit">Search tools</button>
        </form>
        <a class="btn btn-primary hero-cta" href="/categories/">Browse Categories ${arrow()}</a>
        <div class="hero-proof"><span><i class="proof-dot"></i>1,239 tools indexed</span><span>12 clear categories</span><span>Quality-checked daily</span></div>
      </div></div>
    </section>
    <section class="section"><div class="container">
      <div class="section-heading"><div><span class="eyebrow">A place for every task</span><h2>Find your way in</h2><p>Start with the kind of work you want to do. Everything stays clear, focused, and easy to compare.</p></div><a class="text-link" href="/categories/">All categories ${arrow()}</a></div>
      <div class="category-grid">${categories.map(categoryCard).join('')}</div>
    </div></section>
    ${adUnit('home') ? `<div class="container">${adUnit('home')}</div>` : ''}
    <section class="section section-tint"><div class="container">
      <div class="section-heading"><div><span class="eyebrow">Quietly capable</span><h2>Tools worth knowing</h2><p>A small selection of trusted, useful tools across the directory.</p></div><a class="text-link" href="/all-tools/">Browse all tools ${arrow()}</a></div>
      <div class="tool-grid">${featured.map(toolCard).join('')}</div>
    </div></section>
    ${posts.length ? `<section class="section"><div class="container"><div class="section-heading"><div><span class="eyebrow">Editorially reviewed</span><h2>Latest guides</h2><p>Useful roundups prepared from the directory and approved before publication.</p></div><a class="text-link" href="/guides/">All guides ${arrow()}</a></div><div class="post-grid">${posts.slice(0,3).map(postCard).join('')}</div></div></section>` : ''}`;
  }

  function renderCategories() {
    const main = document.getElementById('main');
    main.innerHTML = `<section class="page-hero"><div class="container">
      ${breadcrumbs([{label:'Categories'}])}
      <div class="page-heading-wrap reveal"><span class="eyebrow">Explore the directory</span><h1>One clear place for every kind of AI.</h1><p class="lede">Browse 12 thoughtfully structured categories—from writing and design to research, data, and automation.</p></div>
    </div></section>
    <section class="discovery-area"><div class="container"><div class="category-grid">${categories.map(categoryCard).join('')}</div></div></section>`;
  }

  function renderCategory() {
    const slug = document.body.dataset.category;
    const c = bySlug(slug) || categories[0];
    const categoryTools = tools.filter(t => t.category === c.slug);
    document.title = `${c.name} AI Tools — Novera`;
    const main = document.getElementById('main');
    main.innerHTML = `<section class="page-hero compact"><div class="container">
      ${breadcrumbs([{label:'Categories',href:'/categories/'},{label:c.name}])}
      <div class="page-heading-wrap reveal">
        <div class="page-heading-row"><span class="category-icon" style="background:${c.color}">${icon(c.icon)}</span><div><span class="eyebrow">Curated category</span><h1>${c.name}</h1></div></div>
        <p class="lede">${c.description} Explore a clear, considered selection for individuals and teams.</p>
        <div class="page-stats"><span class="soft-chip"><i class="dot"></i>${c.count} tools indexed</span><span class="soft-chip">Updated this week</span><span class="soft-chip">${categoryTools.length} editor picks shown</span></div>
      </div>
    </div></section>
    <section class="discovery-area"><div class="container">
      <div class="toolbar"><div class="filter-pills" role="group" aria-label="Filter by pricing"><button class="pill active" data-filter="All">All tools</button><button class="pill" data-filter="Free">Free</button><button class="pill" data-filter="Freemium">Freemium</button><button class="pill" data-filter="Paid">Paid</button></div><select class="sort-select" aria-label="Sort tools"><option value="featured">Sort: Featured</option><option value="rating">Highest rated</option><option value="name">Name A–Z</option></select></div>
      ${adUnit('listing')}
      <p class="results-meta">Showing <strong id="visible-count">${categoryTools.length}</strong> curated tools</p>
      <div class="tool-grid" id="category-tool-grid">${categoryTools.map(toolCard).join('')}</div>
    </div></section>`;
    initCategoryFilters(categoryTools);
  }

  function initCategoryFilters(source) {
    const grid = document.getElementById('category-tool-grid');
    if (!grid) return;
    let filter = 'All';
    let sort = 'featured';
    const render = () => {
      let result = [...source].filter(t => filter === 'All' || t.pricing === filter || (filter === 'Free' && t.pricing === 'Freemium'));
      if (sort === 'rating') result.sort((a,b) => b.rating - a.rating);
      if (sort === 'name') result.sort((a,b) => a.name.localeCompare(b.name));
      grid.innerHTML = result.length ? result.map(toolCard).join('') : emptyState('No tools match this filter', 'Try a different pricing option.');
      document.getElementById('visible-count').textContent = result.length;
    };
    document.querySelectorAll('.pill[data-filter]').forEach(button => button.addEventListener('click', () => {
      document.querySelectorAll('.pill[data-filter]').forEach(p => p.classList.remove('active'));
      button.classList.add('active'); filter = button.dataset.filter; render();
    }));
    document.querySelector('.sort-select')?.addEventListener('change', (e) => { sort = e.target.value; render(); });
  }

  function emptyState(title, copy) {
    return `<div class="empty-state"><span class="empty-icon">${icon('search')}</span><h3>${title}</h3><p>${copy}</p></div>`;
  }

  function renderAllTools() {
    const params = new URLSearchParams(location.search);
    const query = (params.get('q') || '').trim();
    const main = document.getElementById('main');
    main.innerHTML = `<section class="page-hero compact"><div class="container">
      ${breadcrumbs([{label:'All tools'}])}
      <div class="page-heading-wrap reveal"><span class="eyebrow">The complete directory</span><h1 id="results-heading">${query ? `Results for “${escapeHTML(query)}”` : 'Find the right tool, calmly.'}</h1><p class="lede">Search, filter, and compare our curated collection of useful AI products.</p>
      <form class="search-banner js-all-search">${icon('search').replace('class="icon"','class="icon search-ico"')}<input type="search" value="${escapeHTML(query)}" placeholder="Search by tool name, task, or tag" aria-label="Search the directory"><button type="submit">Search</button></form></div>
    </div></section>
    ${adUnit('listing') ? `<div class="container">${adUnit('listing')}</div>` : ''}
    <section class="discovery-area"><div class="container"><div class="all-tools-layout">
      <aside class="filter-sidebar"><h3>Refine results</h3><div class="filter-group"><label class="filter-label" for="category-filter">Category</label><select class="filter-select" id="category-filter"><option value="All">All categories</option>${categories.map(c => `<option value="${c.slug}">${c.name}</option>`).join('')}</select></div><div class="filter-group"><span class="filter-label">Pricing</span><div class="price-options">${['All','Free','Freemium','Paid','Enterprise'].map((p,i) => `<label class="radio-row"><input type="radio" name="price" value="${p}" ${i===0?'checked':''}>${p === 'All' ? 'Any price' : p}</label>`).join('')}</div></div></aside>
      <div><div class="mobile-filters"><select class="filter-select" id="mobile-category"><option value="All">All categories</option>${categories.map(c => `<option value="${c.slug}">${c.name}</option>`).join('')}</select><select class="filter-select" id="mobile-price">${['All','Free','Freemium','Paid','Enterprise'].map(p => `<option value="${p}">${p === 'All' ? 'Any price' : p}</option>`).join('')}</select></div>
      <div class="toolbar"><span class="results-meta" style="margin:0"><strong id="all-count">0</strong> tools found</span><select id="all-sort" class="sort-select"><option value="featured">Sort: Featured</option><option value="rating">Highest rated</option><option value="name">Name A–Z</option></select></div><div class="tool-grid" id="all-tool-grid"></div></div>
    </div></div></section>`;
    initAllTools(query);
  }

  function initAllTools(initialQuery) {
    let state = { query: initialQuery.toLowerCase(), category:'All', price:'All', sort:'featured' };
    const grid = document.getElementById('all-tool-grid');
    const update = () => {
      let result = tools.filter(t => {
        const c = bySlug(t.category);
        const haystack = `${t.name} ${t.tagline} ${t.description} ${t.tags.join(' ')} ${c.name}`.toLowerCase();
        const queryMatch = !state.query || haystack.includes(state.query);
        const categoryMatch = state.category === 'All' || t.category === state.category;
        const priceMatch = state.price === 'All' || t.pricing === state.price || (state.price === 'Free' && t.pricing === 'Freemium');
        return queryMatch && categoryMatch && priceMatch;
      });
      if (state.sort === 'featured') result.sort((a,b) => Number(b.featured)-Number(a.featured) || b.rating-a.rating);
      if (state.sort === 'rating') result.sort((a,b) => b.rating-a.rating);
      if (state.sort === 'name') result.sort((a,b) => a.name.localeCompare(b.name));
      document.getElementById('all-count').textContent = result.length;
      grid.innerHTML = result.length ? result.map(toolCard).join('') : emptyState('Nothing surfaced yet', 'Try a broader phrase or clear one of the filters.');
    };
    update();
    document.querySelector('.js-all-search')?.addEventListener('submit', e => {
      e.preventDefault();
      const value = e.currentTarget.querySelector('input').value.trim();
      state.query = value.toLowerCase();
      const url = new URL(location.href);
      value ? url.searchParams.set('q', value) : url.searchParams.delete('q');
      history.replaceState({},'',url);
      document.getElementById('results-heading').textContent = value ? `Results for “${value}”` : 'Find the right tool, calmly.';
      update();
    });
    document.getElementById('category-filter')?.addEventListener('change', e => { state.category=e.target.value; document.getElementById('mobile-category').value=state.category; update(); });
    document.getElementById('mobile-category')?.addEventListener('change', e => { state.category=e.target.value; document.getElementById('category-filter').value=state.category; update(); });
    document.querySelectorAll('input[name="price"]').forEach(r => r.addEventListener('change', e => { state.price=e.target.value; document.getElementById('mobile-price').value=state.price; update(); }));
    document.getElementById('mobile-price')?.addEventListener('change', e => { state.price=e.target.value; const radio=document.querySelector(`input[name="price"][value="${state.price}"]`); if(radio) radio.checked=true; update(); });
    document.getElementById('all-sort')?.addEventListener('change', e => { state.sort=e.target.value; update(); });
  }

  function renderTool() {
    const slug = document.body.dataset.tool;
    const t = toolBySlug(slug) || tools[0];
    const c = bySlug(t.category);
    const related = tools.filter(x => x.category === t.category && x.slug !== t.slug).slice(0,3);
    document.title = `${t.name}: Features, Pricing & Alternatives — ${siteConfig.siteName || 'Novera'}`;
    document.getElementById('main').innerHTML = `<section class="tool-detail-hero"><div class="container">
      ${breadcrumbs([{label:c.name,href:`/categories/${c.slug}/`},{label:t.name}])}
      <div class="detail-hero-row reveal"><div class="detail-identity"><span class="tool-logo large" style="--logo-bg:${c.color}">${initials(t.name)}</span><div><h1 class="detail-title">${t.name}</h1><p class="detail-tagline">${t.tagline}</p></div></div><div class="detail-actions"><a class="btn btn-primary" href="${t.website}" target="_blank" rel="noopener">Official website ${icon('external',true).replace('class="icon icon-sm"','class="icon icon-sm external-mark"')}</a></div></div>
    </div></section>
    ${adUnit('detail') ? `<div class="container">${adUnit('detail')}</div>` : ''}
    <section class="detail-main"><div class="container"><div class="detail-layout">
      <article class="detail-content"><section><span class="eyebrow">Overview</span><h2>What ${t.name} does</h2><p class="description">${t.description}</p></section><section><span class="eyebrow">Capabilities</span><h2>Key features</h2><div class="features-grid">${t.features.map(f => `<div class="feature-item"><span class="feature-check">${icon('check',true)}</span><span>${f}</span></div>`).join('')}</div></section><section><span class="eyebrow">Use cases</span><h2>Explore the tags</h2><div class="tags">${t.tags.map(tag => `<a class="tag" href="/all-tools/?q=${encodeURIComponent(tag)}">${tag}</a>`).join('')}<a class="tag" href="/categories/${c.slug}/">${c.name}</a></div></section></article>
      <aside class="detail-aside"><span class="aside-label">Pricing model</span><div class="price-line">${t.pricing}</div><p class="aside-copy">Plans and availability can change. Check the official website for current details.</p><hr class="aside-sep"><div class="meta-row"><span>Category</span><strong>${c.name}</strong></div><div class="meta-row"><span>${t.reviewStatus ? 'Directory status' : 'Directory score'}</span><strong>${t.reviewStatus ? 'New arrival' : `${t.rating} / 5`}</strong></div><div class="meta-row"><span>Last reviewed</span><strong>August 2026</strong></div><a class="btn btn-secondary aside-button" href="${t.website}" target="_blank" rel="noopener">Visit ${t.name} ${icon('external',true)}</a></aside>
    </div></div></section>
    <section class="related-section"><div class="container"><div class="section-heading"><div><span class="eyebrow">Keep exploring</span><h2>Related tools</h2><p>More carefully selected options in ${c.name}.</p></div><a class="text-link" href="/categories/${c.slug}/">View category ${arrow()}</a></div><div class="tool-grid">${related.map(toolCard).join('')}</div></div></section>`;
  }

  function renderGuides() {
    document.title = `AI Tool Guides & Weekly Roundups — ${siteConfig.siteName || 'Novera'}`;
    document.getElementById('main').innerHTML = `<section class="page-hero compact"><div class="container">${breadcrumbs([{label:'Guides'}])}<div class="page-heading-wrap reveal"><span class="eyebrow">Human-approved publishing</span><h1>Useful context for choosing AI tools.</h1><p class="lede">Weekly roundups created from qualified directory additions, then reviewed before they become part of Novera.</p></div></div></section><section class="discovery-area"><div class="container">${posts.length ? `<div class="post-grid">${posts.map(postCard).join('')}</div>` : emptyState('The first roundup is being prepared', 'Novera will create a review draft after enough qualified tools are discovered this week.')}</div></section>`;
  }

  function renderPost() {
    const slug = document.body.dataset.post;
    const post = posts.find(item => item.slug === slug);
    if (!post) {
      document.title = `Guide not found — ${siteConfig.siteName || 'Novera'}`;
      document.getElementById('main').innerHTML = `<section class="page-hero"><div class="container">${emptyState('Guide not found', 'This guide may still be awaiting editorial approval.')}</div></section>`;
      return;
    }
    const roundupTools = (post.toolSlugs || []).map(toolBySlug).filter(Boolean);
    document.title = `${post.title} — ${siteConfig.siteName || 'Novera'}`;
    document.getElementById('main').innerHTML = `<article class="guide-article"><header class="guide-hero"><div class="container">${breadcrumbs([{label:'Guides',href:'/guides/'},{label:post.title}])}<div class="guide-heading reveal"><span class="eyebrow">${post.type || 'Weekly roundup'}</span><h1>${post.title}</h1><p class="lede">${post.description}</p><div class="guide-byline"><span>By ${post.author || 'Novera Editorial'}</span><span>${formatDate(post.date)}</span><span>${post.readingTime || 5} min read</span><span>Reviewed before publication</span></div></div></div></header><div class="guide-layout container"><main class="guide-content"><section class="guide-intro">${(post.intro || []).map(paragraph => `<p>${paragraph}</p>`).join('')}</section>${adUnit('detail')}${roundupTools.map((tool,index) => { const category=bySlug(tool.category); return `<section class="guide-tool" id="${tool.slug}"><div class="guide-tool-heading"><span class="guide-number">${String(index+1).padStart(2,'0')}</span><span class="tool-logo" style="--logo-bg:${category.color}">${initials(tool.name)}</span><div><span class="tool-cat">${category.name}</span><h2>${tool.name}</h2></div></div><p class="guide-tool-tagline">${tool.tagline}</p><p>${tool.description}</p><h3>What to know</h3><ul class="guide-feature-list">${tool.features.slice(0,3).map(feature=>`<li><span class="feature-check">${icon('check',true)}</span>${feature}</li>`).join('')}</ul><div class="guide-tool-actions"><span class="pricing-badge" data-price="${tool.pricing}">${tool.pricing}</span><a class="btn btn-secondary" href="/tools/${tool.slug}/">View ${tool.name} ${arrow()}</a></div></section>`; }).join('')}<section class="guide-method"><h2>How this roundup was prepared</h2><p>${post.methodology || 'Tools were selected from qualified additions to the Novera directory. Automated checks handled URL validation, duplicate detection, and initial categorization. The resulting draft was reviewed before publication. Inclusion is not a paid endorsement.'}</p></section></main><aside class="guide-aside"><span class="aside-label">In this guide</span><ol>${roundupTools.map(tool=>`<li><a href="#${tool.slug}">${tool.name}</a></li>`).join('')}</ol><hr class="aside-sep"><p class="aside-copy">Product information changes frequently. Confirm current features and pricing on each official website.</p></aside></div></article>`;
  }

  function renderNew() {
    const discovered = tools.filter(tool => tool.discoveredAt).sort((a, b) => String(b.discoveredAt).localeCompare(String(a.discoveredAt)));
    const fallback = tools.filter(tool => tool.featured).slice(0, 8);
    const shown = discovered.length ? discovered : fallback;
    const isLiveFeed = discovered.length > 0;
    document.title = `New AI Tools — ${siteConfig.siteName || 'Novera'}`;
    document.getElementById('main').innerHTML = `<section class="page-hero compact"><div class="container">${breadcrumbs([{label:'New this week'}])}<div class="page-heading-wrap reveal"><span class="eyebrow">Freshly discovered</span><h1>New tools, thoughtfully placed.</h1><p class="lede">${isLiveFeed ? 'New AI products discovered by Novera’s monitored sources and automatically organized into the right category.' : 'Our latest reviewed highlights. Automated discoveries will appear here as soon as the first scheduled refresh finds a qualified tool.'}</p><div class="page-stats"><span class="soft-chip"><i class="dot"></i>Daily discovery scan</span><span class="soft-chip">Automatic categorization</span><span class="soft-chip">Duplicate protection</span></div></div></div></section><section class="discovery-area"><div class="container"><div class="section-heading"><div><span class="eyebrow">${isLiveFeed ? 'Latest arrivals' : 'Recently reviewed'}</span><h2>${isLiveFeed ? `${discovered.length} new additions` : 'Current highlights'}</h2></div><a class="text-link" href="/all-tools/">Browse all tools ${arrow()}</a></div><div class="tool-grid">${shown.map(toolCard).join('')}</div></div></section>`;
  }

  function renderInfo() {
    const key = document.body.dataset.info || 'about';
    const pages = {
      about: {
        eyebrow: 'How Novera works', title: 'Useful discovery, without the noise.', lede: 'Novera is an independent directory designed to make AI products easier to find, understand, and compare.',
        sections: [
          ['Our approach', 'We organize tools around the work people are trying to do. Every listing has one primary category, a concise original description, transparent pricing language, and links to related options.'],
          ['Discovery and review', 'Our automated discovery system monitors approved public sources, checks for duplicates, validates product URLs, and assigns categories using transparent rules. Automated entries are labeled in the data and can be reviewed, corrected, or removed.'],
          ['Editorial independence', 'Listings are not endorsements. Paid advertising never changes category placement, directory scores, or whether a tool is included. Official websites remain the source of truth for product availability and pricing.']
        ]
      },
      privacy: {
        eyebrow: 'Your privacy', title: 'A clear, practical privacy policy.', lede: 'This policy explains the limited information Novera may process when you browse the directory or submit a tool.',
        sections: [
          ['Information we receive', 'Standard hosting logs may contain an IP address, browser details, requested pages, and timestamps. Tool submissions may include a name, email address, product URL, and description. We use this information to operate, secure, and improve the directory.'],
          ['Advertising and cookies', 'When advertising is enabled, Google AdSense and its partners may use cookies or similar technologies to deliver, measure, and limit ads. Depending on your location, a consent message may be shown before personalized advertising or storage is enabled. You can manage ad personalization through Google’s advertising settings.'],
          ['Retention and choices', 'Submission details are retained only as long as needed for review and directory maintenance. You may ask to access, correct, or delete information you submitted by using the contact page. We do not sell submitted contact information.'],
          ['External websites', 'Novera links to independent product websites. Their privacy practices, content, pricing, and security are governed by their own policies.']
        ]
      },
      terms: {
        eyebrow: 'Using the directory', title: 'Simple terms for a useful resource.', lede: 'By using Novera, you agree to use the directory lawfully and understand the limits of the information provided.',
        sections: [
          ['Directory information', 'Descriptions, pricing labels, categories, and scores are provided for general discovery purposes. Products change frequently, so verify important details on the official website before purchasing or relying on a tool.'],
          ['Trademarks and ownership', 'Product names and trademarks belong to their respective owners. Novera does not claim affiliation with listed products unless explicitly stated. Original directory copy and site design may not be republished in bulk without permission.'],
          ['Submissions and automated discovery', 'By submitting a tool, you confirm that the information is accurate and that you are permitted to share it. Novera may edit, categorize, decline, update, or remove listings to preserve quality and safety.'],
          ['No warranty', 'The directory is provided as available without warranties. Novera is not responsible for decisions, losses, service interruptions, or external content arising from use of a listed product.']
        ]
      },
      contact: {
        eyebrow: 'Get in touch', title: 'Questions, corrections, or feedback?', lede: 'Tell us about an outdated listing, a privacy request, a partnership question, or an idea that would make Novera more useful.',
        sections: [
          ['Listing corrections', 'Include the tool name, official URL, and the specific information that should be updated. Verified correction requests are prioritized.'],
          ['Privacy and policy', 'Use the contact channel provided by the site owner for privacy requests and policy questions. Add the production support email in site.config.json before launch.'],
          ['Submit a new tool', 'For new products, use the structured submission form so the directory has the information needed to categorize and review it.']
        ]
      }
    };
    const info = pages[key] || pages.about;
    document.title = `${info.title} — ${siteConfig.siteName || 'Novera'}`;
    document.getElementById('main').innerHTML = `<section class="page-hero compact"><div class="container">${breadcrumbs([{label:key[0].toUpperCase()+key.slice(1)}])}<div class="page-heading-wrap reveal"><span class="eyebrow">${info.eyebrow}</span><h1>${info.title}</h1><p class="lede">${info.lede}</p></div></div></section><section class="legal-content"><div class="container"><article class="legal-card">${info.sections.map(section => `<section><h2>${section[0]}</h2><p>${section[1]}</p></section>`).join('')}${key === 'contact' ? `<a class="btn btn-primary" href="/submit/">Submit a tool ${arrow()}</a>` : ''}<p class="policy-date">Last updated: August 29, 2026</p></article></div></section>`;
  }

  function renderSubmit() {
    document.getElementById('main').innerHTML = `<section class="page-hero compact"><div class="container">${breadcrumbs([{label:'Submit a tool'}])}<div class="page-heading-wrap reveal"><span class="eyebrow">Help the directory grow</span><h1>Know a tool worth sharing?</h1><p class="lede">Tell us what makes it useful. Every submission is checked for quality, duplicates, and category fit before publication.</p></div></div></section>
    <section class="discovery-area"><div class="container"><div class="submit-layout"><form class="form-card" id="submit-form"><div class="field-row"><div class="field"><label for="tool-name">Tool name</label><input id="tool-name" required placeholder="e.g. Paperwise"></div><div class="field"><label for="tool-url">Official website</label><input id="tool-url" type="url" required placeholder="https://"></div></div><div class="field"><label for="tool-category">Best-fit category</label><select id="tool-category" required><option value="">Select a category</option>${categories.map(c=>`<option>${c.name}</option>`).join('')}</select></div><div class="field"><label for="tool-description">Why is it useful?</label><textarea id="tool-description" required placeholder="A short, clear description of what it helps people do."></textarea></div><div class="field"><label for="submitter-email">Your email</label><input id="submitter-email" type="email" required placeholder="you@company.com"></div><button class="btn btn-primary form-submit" type="submit">Send for review ${arrow()}</button><div class="form-message" role="status">Thank you. Your tool has been added to our review queue.</div></form><aside class="submit-note"><h3>A careful quality gate</h3><p>Automated checks look for tools that solve a real problem, explain themselves clearly, and have a valid official website.</p><ul class="submit-points"><li><span class="feature-check">${icon('check',true)}</span>Duplicate and URL checks</li><li><span class="feature-check">${icon('check',true)}</span>One clear category per listing</li><li><span class="feature-check">${icon('clock',true)}</span>Daily publishing refresh</li><li><span class="feature-check">${icon('shield',true)}</span>No payment for placement</li></ul></aside></div></div></section>`;
    document.getElementById('submit-form')?.addEventListener('submit', e => { e.preventDefault(); e.currentTarget.querySelector('.form-message').classList.add('show'); e.currentTarget.querySelector('button').disabled = true; e.currentTarget.querySelector('button').textContent = 'Submitted'; });
  }

  function escapeHTML(value) {
    return value.replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function initGlobalInteractions() {
    document.querySelectorAll('.js-search-form').forEach(form => form.addEventListener('submit', e => {
      e.preventDefault();
      const q = new FormData(form).get('q')?.toString().trim() || '';
      location.href = `/all-tools/${q ? `?q=${encodeURIComponent(q)}` : ''}`;
    }));
    document.addEventListener('keydown', e => {
      if (e.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        document.querySelector('.nav-search input')?.focus();
      }
      if (e.key === 'Escape') document.querySelectorAll('.category-menu[open]').forEach(d => d.removeAttribute('open'));
    });
    document.addEventListener('click', e => {
      document.querySelectorAll('.category-menu[open]').forEach(d => { if (!d.contains(e.target)) d.removeAttribute('open'); });
    });
  }

  renderHeader();
  renderFooter();
  if (page === 'home') renderHome();
  if (page === 'categories') renderCategories();
  if (page === 'category') renderCategory();
  if (page === 'all-tools') renderAllTools();
  if (page === 'tool') renderTool();
  if (page === 'new') renderNew();
  if (page === 'guides') renderGuides();
  if (page === 'post') renderPost();
  if (page === 'info') renderInfo();
  if (page === 'submit') renderSubmit();
  initGlobalInteractions();
  initAdsense();
})();
