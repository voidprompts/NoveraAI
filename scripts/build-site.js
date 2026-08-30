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
vm.runInContext(fs.readFileSync(path.join(root, 'assets/auto-data.js'), 'utf8'), sandbox);
const data = sandbox.window.NOVERA_DATA;
const categories = data.categories;
const tools = data.tools;
// Counts are derived from the actual records so category labels can never drift
// away from the number of tools visitors can browse.
categories.forEach(category => {
  category.count = tools.filter(tool => tool.category === category.slug).length;
});
const postsPath = path.join(root, 'data/posts.json');
const posts = fs.existsSync(postsPath) ? JSON.parse(fs.readFileSync(postsPath, 'utf8')) : [];
const byCategory = slug => categories.find(c => c.slug === slug);
const toolBySlug = slug => tools.find(t => t.slug === slug);
const hasDomain = /^https:\/\/[^/]+/i.test(config.siteUrl || '') && !/your-domain|example\.com/i.test(config.siteUrl);
const siteUrl = hasDomain ? config.siteUrl.replace(/\/$/, '') : '';
const today = new Date().toISOString().slice(0, 10);

const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const xml = value => e(value);
const jsonLd = obj => JSON.stringify(obj).replace(/</g, '\\u003c');
const urlFor = route => siteUrl ? `${siteUrl}${route}` : route;

function validPublisher() {
  return /^ca-pub-\d+$/.test(config.adsense?.publisherId || '');
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

function head({title, description, route, type='website', schema=[]}) {
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
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
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
  return `<div class="post-grid">${list.map(post => `<a class="post-card" href="/guides/${e(post.slug)}/"><span class="post-card-body"><span class="post-meta">${e(post.type || 'Weekly roundup')} · ${e(post.date)}</span><h3>${e(post.title)}</h3><p>${e(post.description)}</p><span class="post-card-foot"><span>${e(post.readingTime || 5)} min read</span></span></span></a>`).join('')}</div>`;
}

function staticPostContent(post) {
  const roundupTools = (post.toolSlugs || []).map(toolBySlug).filter(Boolean);
  return `<article class="guide-article"><header class="guide-hero"><div class="container"><div class="guide-heading"><h1>${e(post.title)}</h1><p class="lede">${e(post.description)}</p><div class="guide-byline"><span>By ${e(post.author || 'Novera Editorial')}</span><span>${e(post.date)}</span><span>${e(post.readingTime || 5)} min read</span></div></div></div></header><div class="guide-layout container"><main class="guide-content"><section class="guide-intro">${(post.intro || []).map(paragraph=>`<p>${e(paragraph)}</p>`).join('')}</section>${roundupTools.map((tool,index)=>`<section class="guide-tool"><h2>${index+1}. ${e(tool.name)}</h2><p>${e(tool.tagline)}</p><p>${e(tool.description)}</p><ul>${tool.features.slice(0,3).map(feature=>`<li>${e(feature)}</li>`).join('')}</ul><a href="/tools/${e(tool.slug)}/">Read the ${e(tool.name)} listing</a></section>`).join('')}<section class="guide-method"><h2>How this roundup was prepared</h2><p>${e(post.methodology)}</p></section></main></div></article>`;
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

function page({title, description, route, pageName, bodyClass, dataAttr='', content, schema=[]}) {
  return `${head({title,description,route,schema})}
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
  return `<article><section class="tool-detail-hero"><div class="container"><h1 class="detail-title">${e(tool.name)}</h1><p class="detail-tagline">${e(tool.tagline)}</p><a class="btn btn-primary" href="${e(tool.website)}" rel="noopener">Official website</a></div></section><section class="detail-main"><div class="container"><h2>What ${e(tool.name)} does</h2><p>${e(tool.description)}</p><h2>Key features</h2><ul>${tool.features.map(f=>`<li>${e(f)}</li>`).join('')}</ul><h2>Pricing</h2><p>${e(tool.pricing)}</p><h2>Tags</h2><p>${tool.tags.map(tag=>`<a href="/all-tools/?q=${encodeURIComponent(tag)}">${e(tag)}</a>`).join(', ')}</p><h2>Related ${e(category.name)} tools</h2>${staticToolLinks(related)}</div></section></article>`;
}

const infoPages = {
  about: {title:'About Novera', description:'Learn how Novera discovers, categorizes, reviews, and presents useful AI tools.', heading:'Useful discovery, without the noise.', copy:'Novera is an independent directory that organizes AI products around the work people are trying to do. Automated discovery checks approved sources, validates URLs, removes duplicates, and categorizes qualified tools using transparent rules.'},
  privacy: {title:'Privacy Policy', description:'Read how Novera handles analytics, form submissions, hosting data, cookies, and advertising privacy.', heading:'A clear, practical privacy policy.', copy:'Novera uses privacy-friendly Cloudflare Web Analytics for aggregate measurements. Contact and tool-submission forms are processed by Formspree for message delivery and spam screening. If advertising is enabled later, consent choices will be provided where required.'},
  terms: {title:'Terms of Use', description:'Read the terms for using Novera and its independent AI tools directory.', heading:'Simple terms for a useful resource.', copy:'Directory content is provided for general discovery. Product details can change, so visitors should verify important information on official websites. Product names and trademarks belong to their respective owners.'},
  contact: {title:'Contact Novera', description:'Send Novera a listing correction, privacy request, partnership question, or directory feedback.', heading:'Questions, corrections, or feedback?', copy:'Use the contact form for listing corrections, privacy requests, partnerships, or general feedback. For a new product, use the structured tool submission form.'}
};

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
    title:`New AI Tools — ${config.siteName}`,description:'See newly discovered AI tools, automatically organized into clear, useful categories.',route:'/new/',pageName:'new',bodyClass:'new-page',
    content:`<section class="page-hero"><div class="container"><h1>New tools, thoughtfully placed.</h1><p class="lede">Fresh AI products discovered and organized by Novera.</p></div></section><section class="discovery-area"><div class="container">${staticToolLinks(newList)}</div></section>`,schema:[breadcrumbSchema([{name:'Home',route:'/'},{name:'New AI tools',route:'/new/'}])]
  }));

  const blogSchema = schemaBase('Blog',{name:`${config.siteName} AI tool guides`,description:'Human-reviewed weekly AI tool roundups and practical comparisons',blogPost:posts.map(post=>({'@type':'BlogPosting',headline:post.title,url:urlFor(`/guides/${post.slug}/`),datePublished:post.date}))});
  writeRoute('/guides/', page({
    title:`AI Tool Guides & Weekly Roundups — ${config.siteName}`,description:'Explore human-reviewed weekly AI tool roundups with clear categories, practical context, and transparent selection notes.',route:'/guides/',pageName:'guides',bodyClass:'guides-page',
    content:`<section class="page-hero"><div class="container"><h1>Useful context for choosing AI tools.</h1><p class="lede">Weekly roundups created from qualified directory additions and reviewed before publication.</p></div></section><section class="discovery-area"><div class="container">${posts.length ? staticPostLinks(posts) : '<p>The first roundup is being prepared.</p>'}</div></section>`,schema:[blogSchema,breadcrumbSchema([{name:'Home',route:'/'},{name:'Guides',route:'/guides/'}])]
  }));

  for (const post of posts) {
    const articleSchema = schemaBase('BlogPosting',{
      headline:post.title,description:post.description,datePublished:post.date,dateModified:post.updated || post.date,
      author:{'@type':'Organization',name:post.author || 'Novera Editorial'},publisher:{'@type':'Organization',name:config.siteName},
      mainEntityOfPage:urlFor(`/guides/${post.slug}/`),about:(post.toolSlugs || []).map(slug=>toolBySlug(slug)?.name).filter(Boolean)
    });
    writeRoute(`/guides/${post.slug}/`, page({
      title:`${post.title} — ${config.siteName}`,description:post.description,route:`/guides/${post.slug}/`,pageName:'post',bodyClass:'post-page',dataAttr:` data-post="${e(post.slug)}"`,content:staticPostContent(post),
      schema:[articleSchema,breadcrumbSchema([{name:'Home',route:'/'},{name:'Guides',route:'/guides/'},{name:post.title,route:`/guides/${post.slug}/`}])]
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
      content:key === 'contact' ? staticContactContent() : `<section class="page-hero"><div class="container"><h1>${e(info.heading)}</h1><p class="lede">${e(info.copy)}</p></div></section>`,schema:[breadcrumbSchema([{name:'Home',route:'/'},{name:info.title,route}])]
    }));
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
  fs.writeFileSync(path.join(root,'assets/posts-data.js'),`// Generated from data/posts.json.\nwindow.NOVERA_POSTS = ${JSON.stringify(posts,null,2)};\n`);

  const routes = ['/', '/categories/', ...categories.map(c=>`/categories/${c.slug}/`), '/all-tools/', '/new/', '/guides/', ...posts.map(post=>`/guides/${post.slug}/`), '/submit/', ...Object.keys(infoPages).map(key=>`/${key}/`), ...tools.map(t=>`/tools/${t.slug}/`)];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map(route=>`  <url><loc>${xml(urlFor(route))}</loc><lastmod>${today}</lastmod><changefreq>${route==='/new/'?'daily':route.startsWith('/categories/')?'weekly':'monthly'}</changefreq><priority>${route==='/'?'1.0':route.startsWith('/tools/')?'0.7':'0.8'}</priority></url>`).join('\n')}\n</urlset>\n`;
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
