#!/usr/bin/env node
/*
 * Generates crawlable page shells, structured data, sitemap, feed, robots,
 * AdSense configuration, and routes from the directory data.
 * Uses Node's standard library only.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'));
// Deployment environments can keep monetization IDs and the production domain
// outside source control by providing these optional variables.
config.siteUrl = process.env.SITE_URL || config.siteUrl;
config.adsense = config.adsense || {publisherId:'',slots:{}};
config.adsense.publisherId = process.env.ADSENSE_PUBLISHER_ID || config.adsense.publisherId;
config.adsense.consentReady = /^true$/i.test(process.env.ADSENSE_CONSENT_READY || '') || config.adsense.consentReady === true;
config.adsense.slots = config.adsense.slots || {};
config.adsense.slots.home = process.env.ADSENSE_HOME_SLOT || config.adsense.slots.home || '';
config.adsense.slots.listing = process.env.ADSENSE_LISTING_SLOT || config.adsense.slots.listing || '';
config.adsense.slots.detail = process.env.ADSENSE_DETAIL_SLOT || config.adsense.slots.detail || '';
config.analytics = config.analytics || {};
config.analytics.cloudflareWebAnalyticsToken = process.env.CLOUDFLARE_WEB_ANALYTICS_TOKEN || config.analytics.cloudflareWebAnalyticsToken || '';
config.forms = config.forms || {};
config.forms.formspreeEndpoint = process.env.FORMSPREE_ENDPOINT || config.forms.formspreeEndpoint || '';
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/data.js'), 'utf8'), sandbox);
const data = sandbox.window.NOVERA_DATA;
const categories = data.categories;
const postsPath = path.join(root, 'data/posts.json');
const allPosts = fs.existsSync(postsPath) ? JSON.parse(fs.readFileSync(postsPath, 'utf8')) : [];
const posts = allPosts.filter(post => post.publicationStatus === 'published');
const reviewPosts = allPosts.filter(post => post.publicationStatus === 'editorial-review');
const autoToolsPath = path.join(root, 'data/auto-tools.json');
const autoToolRecords = fs.existsSync(autoToolsPath) ? JSON.parse(fs.readFileSync(autoToolsPath, 'utf8')) : [];
const publicStatuses = new Set(config.discovery?.publicationStatuses || ['editorially-corrected', 'directory-only']);
const autoTools = autoToolRecords.filter(tool => publicStatuses.has(tool.reviewStatus));
const pendingTools = autoToolRecords.filter(tool => !publicStatuses.has(tool.reviewStatus) && tool.reviewStatus !== 'rejected');
const rejectedTools = autoToolRecords.filter(tool => tool.reviewStatus === 'rejected');
const tools = [...data.tools, ...autoTools];
// Counts are derived from the actual public records so category labels can
// never include tools that are still awaiting editorial review.
categories.forEach(category => {
  category.count = tools.filter(tool => tool.category === category.slug).length;
});
const byCategory = slug => categories.find(c => c.slug === slug);
const toolBySlug = slug => tools.find(t => t.slug === slug);
const auditToolBySlug = slug => autoToolRecords.find(t => t.slug === slug) || toolBySlug(slug);
const hasDomain = /^https:\/\/[^/]+/i.test(config.siteUrl || '') && !/your-domain|example\.com/i.test(config.siteUrl);
const siteUrl = hasDomain ? config.siteUrl.replace(/\/$/, '') : '';
const launchDate = config.contentDates?.siteLaunch || '2026-08-29';
const staticPagesDate = config.contentDates?.staticPages || launchDate;
const publicationGateDate = config.contentDates?.publicationGate || staticPagesDate;
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
const maxDate = values => values.map(validDate).filter(Boolean).sort().at(-1) || launchDate;
const postDateByTool = new Map();
for (const post of posts) {
  const date = maxDate([post.updated, post.date]);
  for (const slug of post.toolSlugs || []) {
    postDateByTool.set(slug, maxDate([postDateByTool.get(slug), date]));
  }
}
const toolLastmod = tool => maxDate([tool.updatedAt, tool.discoveredAt, postDateByTool.get(tool.slug), launchDate]);
const directoryLastmod = maxDate([...tools.map(toolLastmod), ...posts.map(post => post.updated || post.date), publicationGateDate, launchDate]);
const categoryLastmod = slug => maxDate([
  ...tools.filter(tool => tool.category === slug).map(toolLastmod),
  ...(pendingTools.some(tool => tool.category === slug) ? [publicationGateDate] : []),
  launchDate
]);
const editorialPolicyDate = '2026-09-27';

const categoryDecisionCriteria = {
  'text-writing': [
    'Check factual accuracy and citation support before relying on generated text.',
    'Review how prompts, uploads, and confidential text are stored or used.',
    'Test whether tone, style, and export controls fit the intended workflow.'
  ],
  'image-generation': [
    'Confirm commercial-use rights, attribution rules, and restrictions for generated images.',
    'Compare prompt adherence, editing control, output resolution, and watermark policies.',
    'Review how uploaded reference images and personal data are handled.'
  ],
  'video-generation': [
    'Check output length, resolution, watermark, render-time, and export limits on the intended plan.',
    'Confirm commercial-use rights for generated footage, voices, music, and uploaded assets.',
    'Test motion consistency and editing control with a representative project before committing.'
  ],
  'audio-music': [
    'Confirm voice-consent, licensing, attribution, and commercial-use requirements.',
    'Compare export formats, audio quality, language support, and generation limits.',
    'Review the provider’s rules for uploaded recordings and cloned or synthetic voices.'
  ],
  'coding-development': [
    'Check supported languages, editors, repositories, and deployment environments.',
    'Review source-code retention, model-training, access-control, and security policies.',
    'Treat generated code as untrusted until it passes tests, dependency review, and security checks.'
  ],
  'productivity-automation': [
    'Confirm required integrations, permissions, usage limits, and supported data sources.',
    'Test failure handling, approval controls, logs, and recovery before automating important work.',
    'Review how workspace data is stored, shared, and removed.'
  ],
  'marketing-sales': [
    'Check brand controls, approval workflows, platform integrations, and export options.',
    'Review contact-data handling and applicable consent, privacy, and outreach requirements.',
    'Validate generated claims and campaign recommendations before publication.'
  ],
  'research-knowledge': [
    'Inspect source coverage, citation quality, freshness, and the ability to open original evidence.',
    'Verify important claims independently; confident language does not guarantee accuracy.',
    'Review upload privacy, retention, team access, and export controls.'
  ],
  'design-ux': [
    'Check editability, export formats, collaboration features, and handoff compatibility.',
    'Confirm commercial-use rights for generated assets and uploaded references.',
    'Test output quality and accessibility with a representative design task.'
  ],
  'data-analytics': [
    'Confirm supported data connections, refresh behavior, export formats, and scale limits.',
    'Review access controls, data retention, residency, and model-training policies.',
    'Validate calculations and generated explanations against the underlying data.'
  ],
  'customer-support': [
    'Test escalation, citation, fallback, and hallucination controls before customer-facing use.',
    'Review conversation retention, personal-data handling, access controls, and data residency.',
    'Confirm channel integrations, language coverage, analytics, and human handoff behavior.'
  ],
  'education-learning': [
    'Review learner privacy, age requirements, accessibility, and educator or guardian controls.',
    'Check curriculum fit, feedback quality, progress tracking, and export options.',
    'Verify instructional explanations and generated learning materials before classroom use.'
  ]
};

const lowerLead = value => {
  const text = String(value || '').replace(/[.!]+$/, '').trim();
  return text ? text[0].toLowerCase() + text.slice(1) : 'evaluate the product for a specific workflow';
};
const bestFitCopy = tool => `${tool.name} is most relevant to people who want to ${lowerLead(tool.features?.[0])}. It is positioned in ${byCategory(tool.category)?.name || 'its category'}; the official product should be checked against the exact workflow, data, and output requirements before adoption.`;
const pricingConsideration = tool => ({
  Free: 'Confirm the current license, included usage, hosting requirements, and whether paid services are needed for production use.',
  Freemium: 'Check the current free-tier allowance, feature restrictions, watermark or export limits, and the cost of the expected paid usage.',
  Paid: 'Confirm the current price, billing unit, trial or refund terms, usage limits, and any extra platform charges.',
  Enterprise: 'Ask the provider about current contracts, minimum commitments, security terms, support, and deployment requirements.'
}[tool.pricing] || 'Confirm current access, pricing, plan limits, and availability on the official website.');
const reviewDetails = tool => {
  const date = validDate(tool.reviewedAt) || validDate(tool.updatedAt) || validDate(postDateByTool.get(tool.slug)) || validDate(tool.discoveredAt) || launchDate;
  if (tool.reviewStatus === 'automatically-reviewed') return {
    label:'Automatic official-evidence review',
    explanation:'This record passed Novera’s strict deterministic gate using the official product site and same-domain documentation. The gate requires explicit AI relevance, active-product evidence, category agreement, product-specific capabilities, and pricing or licensing evidence.',
    dateLabel:'Evidence reviewed', date
  };
  if (tool.reviewStatus === 'editorially-corrected') return {
    label:'Editorially reviewed',
    explanation:'Novera Editorial checked official product information and corrected the description, category, capabilities, and pricing label before publication.',
    dateLabel:'Listing updated', date
  };
  if (tool.reviewStatus === 'directory-only') return {
    label:'Curated directory listing',
    explanation:'This record was selected for the public directory after a source review. It is provided for product discovery and is not a hands-on review or endorsement.',
    dateLabel:'Listing updated', date
  };
  return {
    label:'Curated directory listing',
    explanation:'Novera Editorial maintains this summary from publicly available product information. It is a discovery entry, not a hands-on review, ranking, or endorsement.',
    dateLabel:'Directory record', date
  };
};
const verificationPoints = tool => [pricingConsideration(tool), ...(categoryDecisionCriteria[tool.category] || [])];

const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const xml = value => e(value);
const jsonLd = obj => JSON.stringify(obj).replace(/</g, '\\u003c');
const urlFor = route => siteUrl ? `${siteUrl}${route}` : route;

function validPublisher() {
  return /^ca-pub-\d+$/.test(config.adsense?.publisherId || '');
}

function adsEnabled() {
  return validPublisher() && config.adsense?.consentReady === true;
}

function formspreeEndpoint() {
  const endpoint = config.forms?.formspreeEndpoint || '';
  return /^https:\/\/formspree\.io\/f\/[a-z0-9]+$/i.test(endpoint) ? endpoint : '';
}

function cloudflareAnalytics() {
  const token = config.analytics?.cloudflareWebAnalyticsToken || '';
  if (!/^[a-f0-9]{32}$/i.test(token)) return '';
  const beaconConfig = e(JSON.stringify({token}));
  return `  <!-- Cloudflare Web Analytics -->\n  <script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon="${beaconConfig}"></script>\n  <!-- End Cloudflare Web Analytics -->\n`;
}

function schemaBase(type, extra = {}) {
  return {'@context':'https://schema.org','@type':type, ...extra};
}

function websiteSchema() {
  const schema = schemaBase('WebSite', {
    name: config.siteName,
    description: config.defaultDescription,
    inLanguage: 'en'
  });
  if (siteUrl) {
    schema.url = siteUrl;
    schema.potentialAction = {
      '@type':'SearchAction',
      target: `${siteUrl}/all-tools/?q={search_term_string}`,
      'query-input':'required name=search_term_string'
    };
  }
  return schema;
}

function breadcrumbSchema(items) {
  return schemaBase('BreadcrumbList', {
    itemListElement: items.map((item, index) => {
      const entry = {'@type':'ListItem', position:index+1, name:item.name};
      if (item.route) entry.item = urlFor(item.route);
      return entry;
    })
  });
}

function head({title, description, route, type='website', schema=[], robots='index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'}) {
  const canonical = siteUrl ? `${siteUrl}${route}` : '';
  const adMeta = validPublisher() ? `<meta name="google-adsense-account" content="${e(config.adsense.publisherId)}">` : '';
  const socialImage = siteUrl ? `${siteUrl}/assets/social-card.png` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#F8F7F4">
  <meta name="description" content="${e(description)}">
  <meta name="robots" content="${e(robots)}">
  <meta name="author" content="${e(config.siteName)}">
  ${canonical ? `<link rel="canonical" href="${e(canonical)}">` : ''}
  <meta property="og:type" content="${type}">
  <meta property="og:site_name" content="${e(config.siteName)}">
  <meta property="og:locale" content="${e(config.locale || 'en_US')}">
  <meta property="og:title" content="${e(title)}">
  <meta property="og:description" content="${e(description)}">
  ${canonical ? `<meta property="og:url" content="${e(canonical)}">` : ''}
  ${socialImage ? `<meta property="og:image" content="${e(socialImage)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${e(title)}">
  <meta name="twitter:description" content="${e(description)}">
  ${adMeta}
  <title>${e(title)}</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='10' fill='%23202723'/%3E%3Ccircle cx='16' cy='16' r='3' fill='%23A7A7FF'/%3E%3Cellipse cx='16' cy='16' rx='10' ry='4.5' fill='none' stroke='white' stroke-width='1.5' transform='rotate(42 16 16)'/%3E%3C/svg%3E">
  <link rel="alternate" type="application/rss+xml" title="${e(config.siteName)} new AI tools" href="/feed.xml">
  <link rel="stylesheet" href="/assets/styles.css">
  ${schema.map(item => `<script type="application/ld+json">${jsonLd(item)}</script>`).join('\n  ')}
  <script src="/assets/site-config.js" defer></script>
  <script src="/assets/data.js" defer></script>
  <script src="/assets/auto-data.js" defer></script>
  <script src="/assets/posts-data.js" defer></script>
  <script src="/assets/app.js" defer></script>
</head>`;
}

function staticCategoryLinks(list = categories) {
  return `<div class="category-grid">${list.map(c => `<a class="category-card" href="/categories/${e(c.slug)}/"><h3>${e(c.name)}</h3><p>${e(c.description)}</p><span class="category-card-foot"><span>${e(c.count)} tools</span></span></a>`).join('')}</div>`;
}

function staticToolLinks(list) {
  return `<div class="tool-grid">${list.map(t => `<a class="tool-card" href="/tools/${e(t.slug)}/"><h3>${e(t.name)}</h3><p class="tagline">${e(t.tagline)}</p><span class="pricing-badge" data-price="${e(t.pricing)}">${e(t.pricing)}</span></a>`).join('')}</div>`;
}

function staticPostLinks(list) {
  return `<div class="post-grid">${list.map(post => `<a class="post-card" href="/guides/${e(post.slug)}/"><span class="post-card-body"><span class="post-meta">${e(post.type || 'New tools roundup')} · ${e(post.date)}</span><h3>${e(post.title)}</h3><p>${e(post.description)}</p><span class="post-card-foot"><span>${e(post.readingTime || 5)} min read</span></span></span></a>`).join('')}</div>`;
}

function staticPostContent(post) {
  // Review drafts can render staged records without adding those records to
  // public browse data, feeds, schemas, counts, or the sitemap.
  const roundupTools = (post.toolSlugs || []).map(auditToolBySlug).filter(Boolean);
  const updated = post.updated || post.date;
  const summary = `<section class="guide-at-glance"><h2>At a glance</h2><div class="guide-summary-grid">${roundupTools.map(tool => {
    const category = byCategory(tool.category);
    return `<article class="guide-summary-card"><span class="tool-cat">${e(category?.name || tool.category)}</span><h3><a href="#${e(tool.slug)}">${e(tool.name)}</a></h3><p>${e(bestFitCopy(tool))}</p><span class="pricing-badge" data-price="${e(tool.pricing)}">${e(tool.pricing)}</span></article>`;
  }).join('')}</div></section>`;
  const sections = roundupTools.map((tool,index) => {
    const category = byCategory(tool.category);
    const checks = verificationPoints(tool);
    return `<section class="guide-tool" id="${e(tool.slug)}"><span class="tool-cat">${e(category?.name || tool.category)}</span><h2>${index+1}. ${e(tool.name)}</h2><p class="guide-tool-tagline">${e(tool.tagline)}</p><p>${e(tool.description)}</p><h3>Best fit</h3><p>${e(bestFitCopy(tool))}</p><h3>What to know</h3><ul>${tool.features.slice(0,3).map(feature=>`<li>${e(feature)}</li>`).join('')}</ul><h3>What to verify</h3><ul><li>${e(checks[0])}</li><li>${e(checks[1])}</li></ul><div class="guide-tool-actions"><span class="pricing-badge" data-price="${e(tool.pricing)}">${e(tool.pricing)}</span><a href="${e(tool.website)}" rel="noopener">Official ${e(tool.name)} website</a><a href="/tools/${e(tool.slug)}/">Read the Novera listing</a></div></section>`;
  }).join('');
  const sources = `<section class="guide-sources"><h2>Official sources</h2><p>Product facts in this roundup were checked against these first-party pages. Links lead to external provider sites.</p><ul>${roundupTools.map(tool=>`<li><a href="${e(tool.website)}" rel="noopener">${e(tool.name)} official website</a></li>`).join('')}</ul></section>`;
  return `<article class="guide-article"><header class="guide-hero"><div class="container"><div class="guide-heading"><h1>${e(post.title)}</h1><p class="lede">${e(post.description)}</p><div class="guide-byline"><span>By <a href="/authors/novera-editorial/">${e(post.author || 'Novera Editorial')}</a></span><span>Published ${e(post.date)}</span><span>Updated ${e(updated)}</span><span>${e(post.readingTime || 5)} min read</span></div><p class="guide-disclosure">Official-source review · Not a hands-on product test · No paid placement</p></div></div></header><div class="guide-layout container"><main class="guide-content"><section class="guide-intro">${(post.intro || []).map(paragraph=>`<p>${e(paragraph)}</p>`).join('')}</section>${summary}${sections}<section class="guide-method"><h2>How this roundup was prepared</h2><p>${e(post.methodology)}</p><p>Read the <a href="/editorial-policy/">Novera editorial and corrections policy</a> for the evidence standard, automation boundaries, and update process.</p></section>${sources}</main></div></article>`;
}

function honeypotField() {
  return `<div class="hp-field" aria-hidden="true"><label>Leave this field empty<input name="_gotcha" tabindex="-1" autocomplete="off"></label></div>`;
}

function staticSubmitContent() {
  const endpoint = formspreeEndpoint();
  const form = endpoint ? `<form class="form-card" id="submit-form" action="${e(endpoint)}" method="POST">
    <input type="hidden" name="submission_type" value="Tool submission"><input type="hidden" name="_subject" value="New Novera tool submission">${honeypotField()}
    <div class="field-row"><div class="field"><label for="tool-name">Tool name</label><input id="tool-name" name="tool_name" required></div><div class="field"><label for="tool-url">Official website</label><input id="tool-url" name="official_website" type="url" required placeholder="https://"></div></div>
    <div class="field"><label for="tool-category">Best-fit category</label><select id="tool-category" name="category" required><option value="">Select a category</option>${categories.map(c=>`<option value="${e(c.slug)}">${e(c.name)}</option>`).join('')}</select></div>
    <div class="field"><label for="tool-description">Why is it useful?</label><textarea id="tool-description" name="message" required></textarea></div>
    <div class="field"><label for="submitter-email">Your email</label><input id="submitter-email" name="email" type="email" required></div>
    <button class="btn btn-primary form-submit" type="submit">Send for review</button><div class="form-message" role="status" aria-live="polite"></div>
  </form>` : `<div class="form-card"><p>Tool submissions are temporarily unavailable. Please try again later.</p></div>`;
  return `<section class="page-hero"><div class="container"><h1>Know a tool worth sharing?</h1><p class="lede">Tell us what makes it useful. Every submission is checked for quality, duplicates, and category fit before publication.</p></div></section><section class="discovery-area"><div class="container">${form}</div></section>`;
}

function staticContactContent() {
  const endpoint = formspreeEndpoint();
  const form = endpoint ? `<form class="form-card" id="contact-form" action="${e(endpoint)}" method="POST">
    <input type="hidden" name="submission_type" value="Contact message"><input type="hidden" name="_subject" value="New Novera contact message">${honeypotField()}
    <div class="field-row"><div class="field"><label for="contact-name">Your name</label><input id="contact-name" name="name" required></div><div class="field"><label for="contact-email">Your email</label><input id="contact-email" name="email" type="email" required></div></div>
    <div class="field"><label for="contact-topic">Topic</label><select id="contact-topic" name="topic" required><option value="">Choose a topic</option><option>Listing correction</option><option>Privacy request</option><option>Partnership</option><option>General feedback</option></select></div>
    <div class="field"><label for="contact-message">Message</label><textarea id="contact-message" name="message" required></textarea></div>
    <button class="btn btn-primary form-submit" type="submit">Send message</button><div class="form-message" role="status" aria-live="polite"></div>
  </form>` : `<div class="form-card"><p>Contact messages are temporarily unavailable. Please try again later.</p></div>`;
  return `<section class="page-hero"><div class="container"><h1>Questions, corrections, or feedback?</h1><p class="lede">Send a listing correction, privacy request, partnership question, or general message.</p></div></section><section class="legal-content"><div class="container">${form}</div></section>`;
}

function page({title, description, route, pageName, bodyClass, dataAttr='', content, schema=[], robots}) {
  return `${head({title,description,route,schema,robots})}
<body class="${e(bodyClass)}" data-page="${e(pageName)}"${dataAttr}>
  <header id="site-header"></header>
  <main id="main">${content}</main>
  <footer id="site-footer"></footer>
  <noscript><p class="container">JavaScript adds filters and interactions; all directory links remain available above.</p></noscript>
${cloudflareAnalytics()}</body>
</html>\n`;
}

function writeRoute(route, html) {
  const relative = route === '/' ? 'index.html' : `${route.replace(/^\//,'').replace(/\/$/,'')}/index.html`;
  const destination = path.join(root, relative);
  fs.mkdirSync(path.dirname(destination), {recursive:true});
  fs.writeFileSync(destination, html);
}

function homeContent() {
  const featured = tools.filter(t => t.featured).slice(0,6);
  return `<section class="hero"><div class="container"><div class="hero-inner"><span class="eyebrow">Curated for useful work</span><h1>All the AI tools.<br><span class="accent">Organized.</span></h1><p class="hero-copy">Discover thoughtfully selected AI tools, clearly categorized so you can spend less time searching and more time creating.</p></div></div></section><section class="section"><div class="container"><h2>Explore AI tools by category</h2>${staticCategoryLinks()}</div></section><section class="section"><div class="container"><h2>Featured AI tools</h2>${staticToolLinks(featured)}</div></section>${posts.length ? `<section class="section"><div class="container"><h2>Latest AI tool guides</h2>${staticPostLinks(posts.slice(0,3))}</div></section>` : ''}`;
}

function categoryPageContent(category) {
  const list = tools.filter(t => t.category === category.slug);
  return `<section class="page-hero"><div class="container"><h1>${e(category.name)} AI tools</h1><p class="lede">${e(category.description)}</p></div></section><section class="discovery-area"><div class="container"><h2>Explore ${e(category.name)}</h2>${staticToolLinks(list)}</div></section>`;
}

function toolPageContent(tool) {
  const category = byCategory(tool.category);
  const related = tools.filter(t => t.category === tool.category && t.slug !== tool.slug).slice(0,3);
  const review = reviewDetails(tool);
  const checks = verificationPoints(tool);
  return `<article><section class="tool-detail-hero"><div class="container"><h1 class="detail-title">${e(tool.name)}</h1><p class="detail-tagline">${e(tool.tagline)}</p><a class="btn btn-primary" href="${e(tool.website)}" rel="noopener">Official website</a></div></section><section class="detail-main"><div class="container"><div class="detail-layout"><article class="detail-content"><section><span class="eyebrow">Overview</span><h2>What ${e(tool.name)} does</h2><p>${e(tool.description)}</p></section><section><span class="eyebrow">Decision context</span><h2>Best fit</h2><p>${e(bestFitCopy(tool))}</p></section><section><span class="eyebrow">Capabilities</span><h2>Key features</h2><ul>${tool.features.map(f=>`<li>${e(f)}</li>`).join('')}</ul></section><section><span class="eyebrow">Evaluation checklist</span><h2>Before you choose</h2><ul>${checks.map(item=>`<li>${e(item)}</li>`).join('')}</ul></section><section class="review-card"><span class="eyebrow">Transparency</span><h2>How this listing was reviewed</h2><p><strong>${e(review.label)}.</strong> ${e(review.explanation)}</p><dl><div><dt>${e(review.dateLabel)}</dt><dd>${e(review.date)}</dd></div><div><dt>Testing disclosure</dt><dd>No hands-on testing claimed</dd></div><div><dt>Primary source</dt><dd><a href="${e(tool.website)}" rel="noopener">Official ${e(tool.name)} website</a></dd></div></dl><p>See Novera’s <a href="/editorial-policy/">editorial and corrections policy</a> or <a href="/contact/">report an outdated detail</a>.</p></section><section><span class="eyebrow">Topics</span><h2>Tags</h2><p>${tool.tags.map(tag=>`<a href="/all-tools/?q=${encodeURIComponent(tag)}">${e(tag)}</a>`).join(', ')}</p></section></article><aside class="detail-aside"><span class="aside-label">Pricing model</span><div class="price-line">${e(tool.pricing)}</div><p class="aside-copy">Plans and availability can change. Check the official website for current details.</p><hr class="aside-sep"><div class="meta-row"><span>Category</span><strong>${e(category.name)}</strong></div><div class="meta-row"><span>Review type</span><strong>${e(review.label)}</strong></div><div class="meta-row"><span>${e(review.dateLabel)}</span><strong>${e(review.date)}</strong></div><a class="btn btn-secondary aside-button" href="${e(tool.website)}" rel="noopener">Visit ${e(tool.name)}</a></aside></div><section class="related-section"><h2>Related ${e(category.name)} tools</h2>${staticToolLinks(related)}</section></div></section></article>`;
}


const infoPages = {
  about: {
    title:'About Novera', description:'Learn how Novera discovers, categorizes, reviews, and presents useful AI tools.', heading:'Useful discovery, without the noise.',
    copy:'Novera is an independent AI-tool directory maintained by the Novera Editorial team. It combines automated discovery with explicit publication gates so uncertain records stay outside the public directory.', updated:editorialPolicyDate,
    sections:[
      ['What Novera publishes','Novera organizes AI products around the work people are trying to do. Public listings include a primary category, a neutral summary, capabilities, pricing context, decision checks, and an official product link. Roundups explain newly qualified additions without pretending to rank products that were not tested side by side.'],
      ['Discovery and evidence review','Automated discovery monitors approved public sources, removes duplicates, validates URLs, and stages candidates privately. Publication requires official product evidence. Weak, ambiguous, or unreachable records remain pending rather than being guessed into the directory.'],
      ['Who is responsible','Novera Editorial is the organizational author responsible for review standards, corrections, and publication controls. Read the team profile and the full editorial policy for sourcing, testing disclosures, and automation boundaries.'],
      ['Independence','Listings are not endorsements. Advertising and future commercial relationships do not determine inclusion, category placement, wording, or review outcomes. Official product providers remain the source of truth for current features, availability, and prices.']
    ]
  },
  'editorial-policy': {
    title:'Editorial & Corrections Policy', description:'Read Novera’s sourcing, evidence-review, testing-disclosure, independence, automation, and corrections standards.', heading:'Evidence first. Uncertainty stays unpublished.',
    copy:'This policy explains who is responsible for Novera’s content, what “reviewed” means, how automation is limited, and how readers or providers can request a correction.', updated:editorialPolicyDate,
    sections:[
      ['Editorial responsibility','Novera Editorial is the organizational author and publisher. It maintains the directory taxonomy, evidence standards, automated safety checks, correction process, and final publication rules. Novera does not invent personal credentials or imply that a product was personally tested when it was not.'],
      ['Source hierarchy','Product claims must be supported by first-party evidence: an official product website, same-domain documentation, an official public repository, or provider-published pricing and licensing information. Discovery posts can identify candidates but are not treated as proof of capabilities, pricing, or product status.'],
      ['Review labels','“Automatic official-evidence review” means the record passed deterministic checks for AI relevance, active-product evidence, category fit, product-specific capabilities, and pricing or licensing evidence. “Editorially reviewed” means an editor checked and corrected the record against official information. “Curated directory listing” is a discovery summary and is not a hands-on review or endorsement.'],
      ['Evidence review is not hands-on testing','A source review evaluates documented claims. A hands-on test requires direct product use with a described task, environment, date, and limitations. Novera labels guides as official-source reviews unless that separate testing record exists; it does not convert marketing claims into personal experience.'],
      ['Selection and presentation','Listings are organized by practical category and are not pay-to-rank. Directory order, featured placement, and roundup inclusion do not guarantee quality or suitability. Readers should evaluate products against their own security, privacy, licensing, accessibility, integration, and cost requirements.'],
      ['Automation boundaries','Automation may discover candidates, fetch allowlisted official pages, apply deterministic evidence rules, build pages, run audits, and merge a verified subset. It must defer uncertainty, reject only decisive false positives, avoid private network addresses, prevent roundup reuse, and stop publication when validation, mergeability, or hosting checks fail.'],
      ['Corrections and updates','Product information changes. Correction requests should identify the listing, official URL, disputed detail, and supporting first-party evidence. Verified material errors are corrected through the same build and audit process. Readers can use the contact form; providers do not receive control over independent wording.'],
      ['Advertising, affiliates, and conflicts','Advertising is kept visually separate from publisher content and does not affect editorial decisions. Novera does not currently give products paid ranking. Any future affiliate or sponsored relationship must be disclosed near the affected content and may not bypass the evidence gate.']
    ]
  },
  'authors/novera-editorial': {
    title:'Novera Editorial Team', description:'Meet the organizational team responsible for Novera’s directory standards, official-source reviews, corrections, and automation safeguards.', heading:'The team behind Novera’s review standard.',
    copy:'Novera Editorial is the organizational byline for the people and publication systems responsible for maintaining this independent AI-tool directory.', updated:editorialPolicyDate,
    sections:[
      ['Scope of work','The team defines categories, reviews first-party product evidence, maintains publication rules, prepares source-based roundups, handles correction requests, and monitors automated checks. The byline identifies editorial responsibility without inventing an individual author or credential.'],
      ['Review approach','Novera separates discovery, official-source evidence review, and hands-on testing. Current guides are source reviews unless they explicitly describe a direct test. Important purchasing, security, legal, medical, educational, or financial decisions should be confirmed with the provider and an appropriate qualified professional.'],
      ['Quality controls','Every release is built and audited before publication. Pending and rejected records stay outside browse pages, feeds, structured data, and the sitemap. Automated editorial changes require an allowed-path check, successful site validation, clean mergeability, and a successful Cloudflare preview.'],
      ['Corrections and contact','Readers and product providers can report an outdated or inaccurate detail through the contact page. Include the official product URL and first-party evidence so the team can verify the request efficiently.']
    ]
  },
  privacy: {
    title:'Privacy Policy', description:'Read how Novera handles analytics, form submissions, hosting data, cookies, consent, and advertising privacy.', heading:'A clear, practical privacy policy.',
    copy:'Novera limits data collection, uses privacy-friendly aggregate analytics, and keeps advertising disabled until valid account configuration and required consent controls are in place.', updated:editorialPolicyDate,
    sections:[
      ['Information we receive','Standard hosting logs may contain an IP address, browser details, requested pages, and timestamps. Tool submissions may include a name, email address, product URL, and description. Novera uses this information to operate, secure, and improve the directory.'],
      ['Forms and service providers','Contact messages and tool submissions are processed by Formspree for delivery and spam screening. Do not submit passwords, payment details, health information, or other sensitive data. External product links are governed by each provider’s own terms and privacy policy.'],
      ['Analytics','Novera uses Cloudflare Web Analytics for aggregate page and performance measurements. It does not use cookies or local storage for this analytics service and is not used by Novera to follow individual visitors across unrelated sites.'],
      ['Advertising and consent','If Google AdSense is enabled, Google and its partners may use cookies or similar technologies to deliver, measure, and limit ads. Novera will configure the required Google-certified consent message for applicable visitors before activating advertising. Ad units remain disabled until a valid publisher ID, ad slots, and an explicit consent-readiness switch are configured.'],
      ['Retention and choices','Submission details are retained only as long as needed for review, communication, security, and directory maintenance. You may ask to access, correct, or delete information you submitted through the contact page. Novera does not sell submitted contact information.']
    ]
  },
  terms: {
    title:'Terms of Use', description:'Read the terms for using Novera and its independent AI tools directory.', heading:'Simple terms for a useful resource.',
    copy:'Directory content supports general product discovery. It is not professional advice, a product warranty, or a substitute for checking current provider information.', updated:editorialPolicyDate,
    sections:[
      ['Directory information','Descriptions, pricing labels, categories, decision checks, and guides are provided for general discovery. Products change frequently, so verify important details on the official website before purchasing or relying on a tool.'],
      ['Testing and endorsements','An official-source review is not a hands-on product test. A listing or roundup inclusion is not an endorsement, certification, security assessment, or guarantee that a product fits a particular use.'],
      ['Trademarks and ownership','Product names and trademarks belong to their respective owners. Novera does not claim affiliation with listed products unless explicitly stated. Original directory copy and site design may not be republished in bulk without permission.'],
      ['Submissions and corrections','By submitting information, you confirm that it is accurate and that you are permitted to share it. Novera may edit, categorize, defer, decline, update, or remove records to preserve quality and safety.'],
      ['No warranty','The directory is provided as available without warranties. Novera is not responsible for decisions, losses, service interruptions, or external content arising from use of a listed product.']
    ]
  },
  contact: {
    title:'Contact Novera', description:'Send Novera a listing correction, privacy request, partnership question, or directory feedback.', heading:'Questions, corrections, or feedback?',
    copy:'Use the form for an outdated-listing report, privacy request, partnership question, or practical suggestion. New products should use the separate submission form.', updated:editorialPolicyDate,
    sections:[
      ['Listing corrections','Include the tool name, official URL, the exact detail that appears wrong, and a first-party source supporting the correction. Verified material corrections are prioritized.'],
      ['Privacy requests','Choose “Privacy request” to ask about, access, correct, or delete information you submitted. Do not send passwords, payment details, or sensitive personal records.'],
      ['Editorial independence','Paid relationships do not determine directory inclusion, category placement, wording, or review outcomes. Product providers may supply evidence but do not control independent editorial conclusions.']
    ]
  }
};

function staticInfoContent(key, info) {
  const sections = `<article class="legal-card">${(info.sections || []).map(section=>`<section><h2>${e(section[0])}</h2><p>${e(section[1])}</p></section>`).join('')}<p class="policy-date">Last updated: ${e(info.updated || editorialPolicyDate)}</p></article>`;
  const links = key === 'about' ? `<div class="policy-links"><a class="btn btn-secondary" href="/authors/novera-editorial/">Meet Novera Editorial</a><a class="btn btn-secondary" href="/editorial-policy/">Read the editorial policy</a></div>` : '';
  const contact = key === 'contact' ? `<div class="contact-form-wrap">${staticContactContent()}</div>` : '';
  return `<section class="page-hero"><div class="container"><h1>${e(info.heading)}</h1><p class="lede">${e(info.copy)}</p>${links}</div></section><section class="legal-content"><div class="container">${sections}${contact}</div></section>`;
}

function infoSchema(key, info) {
  if (key === 'about') return schemaBase('AboutPage', {
    name:info.title, url:urlFor('/about/'),
    mainEntity:schemaBase('Organization', {name:config.siteName, url:urlFor('/about/'), publishingPrinciples:urlFor('/editorial-policy/')})
  });
  if (key === 'authors/novera-editorial') return schemaBase('ProfilePage', {
    name:info.title, url:urlFor('/authors/novera-editorial/'), dateModified:info.updated,
    mainEntity:schemaBase('Organization', {name:'Novera Editorial', url:urlFor('/authors/novera-editorial/'), parentOrganization:{'@type':'Organization',name:config.siteName,url:urlFor('/about/')}, publishingPrinciples:urlFor('/editorial-policy/')})
  });
  return schemaBase('WebPage', {name:info.title, url:urlFor(`/${key}/`), dateModified:info.updated});
}

function generatePages() {
  writeRoute('/', page({
    title:`${config.siteName} — All the AI tools. Organized.`,
    description:config.defaultDescription,
    route:'/', pageName:'home', bodyClass:'home-page', content:homeContent(), schema:[websiteSchema()]
  }));

  const categoriesSchema = schemaBase('ItemList', {name:'AI tool categories', itemListElement:categories.map((c,i)=>({'@type':'ListItem',position:i+1,name:c.name,url:urlFor(`/categories/${c.slug}/`)}))});
  writeRoute('/categories/', page({
    title:`AI Tool Categories — ${config.siteName}`,
    description:'Explore AI tools for writing, images, video, audio, coding, productivity, research, design, data, and more.',
    route:'/categories/', pageName:'categories', bodyClass:'categories-page',
    content:`<section class="page-hero"><div class="container"><h1>One clear place for every kind of AI.</h1><p class="lede">Browse 12 thoughtfully structured AI tool categories.</p></div></section><section class="discovery-area"><div class="container">${staticCategoryLinks()}</div></section>`,
    schema:[categoriesSchema,breadcrumbSchema([{name:'Home',route:'/'},{name:'Categories',route:'/categories/'}])]
  }));

  for (const category of categories) {
    const list = tools.filter(t=>t.category===category.slug);
    const itemSchema = schemaBase('ItemList',{name:`${category.name} AI tools`,numberOfItems:list.length,itemListElement:list.map((t,i)=>({'@type':'ListItem',position:i+1,name:t.name,url:urlFor(`/tools/${t.slug}/`)}))});
    writeRoute(`/categories/${category.slug}/`, page({
      title:`${category.name} AI Tools — ${config.siteName}`,
      description:`${category.description} Compare carefully selected ${category.name.toLowerCase()} AI tools, features, and pricing.`,
      route:`/categories/${category.slug}/`, pageName:'category', bodyClass:'category-page', dataAttr:` data-category="${e(category.slug)}"`, content:categoryPageContent(category),
      schema:[itemSchema,breadcrumbSchema([{name:'Home',route:'/'},{name:'Categories',route:'/categories/'},{name:category.name,route:`/categories/${category.slug}/`}])]
    }));
  }

  const allSchema = schemaBase('CollectionPage',{name:'All AI tools',description:'Search and compare the complete Novera AI tools directory'});
  writeRoute('/all-tools/', page({
    title:`Search All AI Tools — ${config.siteName}`,description:`Search, filter, and compare ${tools.length} carefully organized AI tools.`,route:'/all-tools/',pageName:'all-tools',bodyClass:'all-tools-page',
    content:`<section class="page-hero"><div class="container"><h1>Find the right AI tool, calmly.</h1><p class="lede">Search and compare the complete directory.</p></div></section><section class="discovery-area"><div class="container">${staticToolLinks(tools)}</div></section>`,schema:[allSchema,breadcrumbSchema([{name:'Home',route:'/'},{name:'All tools',route:'/all-tools/'}])]
  }));

  const discovered = tools.filter(t=>t.discoveredAt).sort((a,b)=>String(b.discoveredAt).localeCompare(String(a.discoveredAt)));
  const newList = discovered.length ? discovered : tools.filter(t=>t.featured).slice(0,8);
  writeRoute('/new/', page({
    title:`New AI Tools — ${config.siteName}`,description:'See recently reviewed AI tools, clearly organized into useful categories.',route:'/new/',pageName:'new',bodyClass:'new-page',
    content:`<section class="page-hero"><div class="container"><h1>New tools, thoughtfully placed.</h1><p class="lede">Fresh AI products discovered by Novera and published only after a strict official-evidence review.</p></div></section><section class="discovery-area"><div class="container">${staticToolLinks(newList)}</div></section>`,schema:[breadcrumbSchema([{name:'Home',route:'/'},{name:'New AI tools',route:'/new/'}])]
  }));

  const blogSchema = schemaBase('Blog',{name:`${config.siteName} AI tool guides`,description:'Evidence-checked new AI tool roundups with transparent selection context',blogPost:posts.map(post=>({'@type':'BlogPosting',headline:post.title,url:urlFor(`/guides/${post.slug}/`),datePublished:post.date}))});
  writeRoute('/guides/', page({
    title:`AI Tool Guides & New Tool Roundups — ${config.siteName}`,description:'Explore evidence-checked new AI tool roundups with clear categories, practical context, and transparent selection notes.',route:'/guides/',pageName:'guides',bodyClass:'guides-page',
    content:`<section class="page-hero"><div class="container"><h1>Useful context for choosing AI tools.</h1><p class="lede">New-tool roundups can publish up to three times per week when enough additions pass the strict official-evidence gate; uncertain candidates remain unpublished.</p></div></section><section class="discovery-area"><div class="container">${posts.length ? staticPostLinks(posts) : '<p>The first roundup is being prepared.</p>'}</div></section>`,schema:[blogSchema,breadcrumbSchema([{name:'Home',route:'/'},{name:'Guides',route:'/guides/'}])]
  }));

  for (const post of posts) {
    const unavailableSlugs = (post.toolSlugs || []).filter(slug => !toolBySlug(slug));
    if (unavailableSlugs.length) {
      throw new Error(`Published guide ${post.slug} references non-public tools: ${unavailableSlugs.join(', ')}`);
    }
    const articleSchema = schemaBase('BlogPosting',{
      headline:post.title,description:post.description,datePublished:post.date,dateModified:post.updated || post.date,
      author:{'@type':'Organization',name:post.author || 'Novera Editorial',url:urlFor('/authors/novera-editorial/')},
      editor:{'@type':'Organization',name:'Novera Editorial',url:urlFor('/authors/novera-editorial/')},
      publisher:{'@type':'Organization',name:config.siteName,url:urlFor('/about/')},
      mainEntityOfPage:urlFor(`/guides/${post.slug}/`),
      about:(post.toolSlugs || []).map(slug=>toolBySlug(slug)?.name).filter(Boolean),
      citation:(post.toolSlugs || []).map(slug=>toolBySlug(slug)?.website).filter(Boolean)
    });
    writeRoute(`/guides/${post.slug}/`, page({
      title:`${post.title} — ${config.siteName}`,description:post.description,route:`/guides/${post.slug}/`,pageName:'post',bodyClass:'post-page',dataAttr:` data-post="${e(post.slug)}"`,content:staticPostContent(post),
      schema:[articleSchema,breadcrumbSchema([{name:'Home',route:'/'},{name:'Guides',route:'/guides/'},{name:post.title,route:`/guides/${post.slug}/`}])]
    }));
  }

  for (const post of reviewPosts) {
    writeRoute(`/guides/${post.slug}/`, page({
      title:`Editorial review draft: ${post.title} — ${config.siteName}`,
      description:'This draft is awaiting editorial review and is not part of Novera’s published guide collection.',
      route:`/guides/${post.slug}/`,pageName:'review-post',bodyClass:'post-page',dataAttr:` data-post="${e(post.slug)}"`,robots:'noindex,follow',
      content:`<section class="page-hero compact"><div class="container"><span class="eyebrow">Editorial review draft</span><p class="lede">This page is excluded from search, feeds, guide listings, and public structured data until an editor approves every included tool.</p></div></section>${staticPostContent(post)}`
    }));
  }

  writeRoute('/submit/', page({
    title:`Submit an AI Tool — ${config.siteName}`,description:'Submit a useful AI product for inclusion in the Novera directory.',route:'/submit/',pageName:'submit',bodyClass:'submit-page',
    content:staticSubmitContent(),schema:[breadcrumbSchema([{name:'Home',route:'/'},{name:'Submit a tool',route:'/submit/'}])]
  }));

  for (const [key, info] of Object.entries(infoPages)) {
    const route = `/${key}/`;
    writeRoute(route, page({
      title:`${info.title} — ${config.siteName}`,description:info.description,route,pageName:'info',bodyClass:'info-page',dataAttr:` data-info="${key}"`,
      content:staticInfoContent(key, info),schema:[infoSchema(key, info),breadcrumbSchema([{name:'Home',route:'/'},{name:info.title,route}])]
    }));
  }

  // Staged records remain in the audit queue and roundup-review workflow. Any
  // route that was public in an earlier build is overwritten with a noindex
  // notice while the record awaits editorial review.
  for (const tool of pendingTools) {
    const notice = page({
      title:`Listing under editorial review — ${config.siteName}`,
      description:'This discovery is being checked before it can join the public Novera directory.',
      route:`/tools/${tool.slug}/`,pageName:'pending-tool',bodyClass:'info-page',robots:'noindex,follow',
      content:`<section class="page-hero"><div class="container"><span class="eyebrow">Editorial review</span><h1>Listing under editorial review.</h1><p class="lede">Novera discovered this product automatically. Its official evidence is incomplete or still being checked, so it remains outside the public directory.</p><a class="btn btn-primary" href="/all-tools/">Browse reviewed AI tools</a></div></section>`
    });
    writeRoute(`/tools/${tool.slug}/`, notice);
  }

  // Rejected records stay in the audit data to prevent rediscovery. Their
  // former routes become noindex notices and are excluded from browse pages,
  // feeds, counts, structured tool data, and the sitemap.
  for (const tool of rejectedTools) {
    const notice = page({
      title:`Listing unavailable — ${config.siteName}`,
      description:'This listing is not part of the Novera AI tools directory.',
      route:`/tools/${tool.slug}/`,pageName:'removed-tool',bodyClass:'info-page',robots:'noindex,follow',
      content:`<section class="page-hero"><div class="container"><h1>Listing unavailable.</h1><p class="lede">After a strict evidence review, this record did not meet Novera’s AI-product scope.</p><a class="btn btn-primary" href="/all-tools/">Browse verified AI tools</a></div></section>`
    });
    writeRoute(`/tools/${tool.slug}/`, notice);
  }

  for (const tool of tools) {
    const category = byCategory(tool.category);
    const software = schemaBase('SoftwareApplication',{
      name:tool.name, description:tool.description, applicationCategory:category.name, operatingSystem:'Web', url:tool.website,
      offers:{'@type':'Offer',price:tool.pricing === 'Free' ? '0' : undefined,priceCurrency:'USD',description:`${tool.pricing} pricing model`}
    });
    if (software.offers.price === undefined) delete software.offers.price;
    writeRoute(`/tools/${tool.slug}/`, page({
      title:`${tool.name}: Features, Pricing & Alternatives — ${config.siteName}`,
      description:`${tool.tagline} Review key features, ${tool.pricing.toLowerCase()} pricing, tags, and related ${category.name.toLowerCase()} tools.`,
      route:`/tools/${tool.slug}/`,pageName:'tool',bodyClass:'tool-page',dataAttr:` data-tool="${e(tool.slug)}"`,content:toolPageContent(tool),
      schema:[software,breadcrumbSchema([{name:'Home',route:'/'},{name:category.name,route:`/categories/${category.slug}/`},{name:tool.name,route:`/tools/${tool.slug}/`}])]
    }));
  }
}

function generateMachineFiles() {
  const runtimeConfig = {
    siteName:config.siteName,
    siteUrl:siteUrl,
    analytics:config.analytics || {},
    forms:{formspreeEndpoint:formspreeEndpoint()},
    adsense:config.adsense || {publisherId:'',slots:{}}
  };
  fs.writeFileSync(path.join(root,'assets/site-config.js'),`// Generated from site.config.json.\nwindow.NOVERA_SITE_CONFIG = ${JSON.stringify(runtimeConfig,null,2)};\n`);
  fs.writeFileSync(path.join(root,'assets/posts-data.js'),`// Generated from published records in data/posts.json.\nwindow.NOVERA_POSTS = ${JSON.stringify(posts,null,2)};\n`);
  const autoPayload = JSON.stringify(autoTools, null, 2);
  fs.writeFileSync(path.join(root,'assets/auto-data.js'),
    `// Generated from editorially approved records in data/auto-tools.json.\nwindow.NOVERA_AUTO_TOOLS = ${autoPayload};\n` +
    `if (window.NOVERA_DATA) {\n` +
    `  const existing = new Set(window.NOVERA_DATA.tools.map(tool => tool.slug));\n` +
    `  window.NOVERA_AUTO_TOOLS.forEach(tool => { if (!existing.has(tool.slug)) window.NOVERA_DATA.tools.push(tool); });\n` +
    `  window.NOVERA_DATA.categories.forEach(category => { category.count = window.NOVERA_DATA.tools.filter(tool => tool.category === category.slug).length; });\n` +
    `}\n`);

  const routes = [
    {route:'/', lastmod:directoryLastmod},
    {route:'/categories/', lastmod:directoryLastmod},
    ...categories.map(category => ({route:`/categories/${category.slug}/`, lastmod:categoryLastmod(category.slug)})),
    {route:'/all-tools/', lastmod:directoryLastmod},
    {route:'/new/', lastmod:directoryLastmod},
    {route:'/guides/', lastmod:maxDate(posts.map(post => post.updated || post.date).concat(launchDate))},
    ...posts.map(post => ({route:`/guides/${post.slug}/`, lastmod:maxDate([post.updated, post.date])})),
    {route:'/submit/', lastmod:staticPagesDate},
    ...Object.keys(infoPages).map(key => ({route:`/${key}/`, lastmod:infoPages[key].updated || (key === 'about' ? publicationGateDate : staticPagesDate)})),
    ...tools.map(tool => ({route:`/tools/${tool.slug}/`, lastmod:toolLastmod(tool)}))
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map(({route,lastmod})=>`  <url><loc>${xml(urlFor(route))}</loc><lastmod>${lastmod}</lastmod><changefreq>${route==='/new/'?'daily':route.startsWith('/categories/')?'weekly':'monthly'}</changefreq><priority>${route==='/'?'1.0':route.startsWith('/tools/')?'0.7':'0.8'}</priority></url>`).join('\n')}\n</urlset>\n`;
  fs.writeFileSync(path.join(root,'sitemap.xml'),sitemap);
  fs.writeFileSync(path.join(root,'robots.txt'),`User-agent: *\nAllow: /\nDisallow: /data/\nDisallow: /scripts/\n${siteUrl ? `Sitemap: ${siteUrl}/sitemap.xml\n` : ''}`);

  const recent = tools.filter(t=>t.discoveredAt).sort((a,b)=>String(b.discoveredAt).localeCompare(String(a.discoveredAt))).slice(0,30);
  const postFeedItems = posts.slice(0,20).map(post=>`<item><title>${xml(post.title)}</title><link>${xml(urlFor(`/guides/${post.slug}/`))}</link><guid>${xml(urlFor(`/guides/${post.slug}/`))}</guid><pubDate>${new Date(`${post.date}T12:00:00Z`).toUTCString()}</pubDate><description>${xml(post.description)}</description></item>`).join('');
  const toolFeedItems = recent.map(t=>`<item><title>${xml(t.name)}</title><link>${xml(urlFor(`/tools/${t.slug}/`))}</link><guid>${xml(urlFor(`/tools/${t.slug}/`))}</guid><pubDate>${new Date(`${t.discoveredAt}T12:00:00Z`).toUTCString()}</pubDate><description>${xml(t.description)}</description></item>`).join('');
  fs.writeFileSync(path.join(root,'feed.xml'),`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(config.siteName)} AI tool guides and updates</title><link>${xml(siteUrl || '/')}</link><description>${xml(config.defaultDescription)}</description>${postFeedItems}${toolFeedItems}</channel></rss>\n`);

  const adsText = validPublisher() ? `google.com, ${config.adsense.publisherId.replace('ca-','')}, DIRECT, f08c47fec0942fa0\n` : '# Add a valid AdSense publisherId in site.config.json, then run npm run build.\n';
  fs.writeFileSync(path.join(root,'ads.txt'),adsText);
}

generateMachineFiles();
generatePages();
console.log(`Built ${tools.length} tool pages, ${categories.length} category pages, sitemap, feed, and SEO metadata.`);
