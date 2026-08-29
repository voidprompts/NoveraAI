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
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/data.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/auto-data.js'), 'utf8'), sandbox);
const data = sandbox.window.NOVERA_DATA;
const categories = data.categories;
const tools = data.tools;
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
  <script src="/assets/app.js" defer></script>
</head>`;
}

function staticCategoryLinks(list = categories) {
  return `<div class="category-grid">${list.map(c => `<a class="category-card" href="/categories/${e(c.slug)}/"><h3>${e(c.name)}</h3><p>${e(c.description)}</p><span class="category-card-foot"><span>${e(c.count)} tools</span></span></a>`).join('')}</div>`;
}

function staticToolLinks(list) {
  return `<div class="tool-grid">${list.map(t => `<a class="tool-card" href="/tools/${e(t.slug)}/"><h3>${e(t.name)}</h3><p class="tagline">${e(t.tagline)}</p><span class="pricing-badge" data-price="${e(t.pricing)}">${e(t.pricing)}</span></a>`).join('')}</div>`;
}

function page({title, description, route, pageName, bodyClass, dataAttr='', content, schema=[]}) {
  return `${head({title,description,route,schema})}
<body class="${e(bodyClass)}" data-page="${e(pageName)}"${dataAttr}>
  <header id="site-header"></header>
  <main id="main">${content}</main>
  <footer id="site-footer"></footer>
  <noscript><p class="container">JavaScript adds filters and interactions; all directory links remain available above.</p></noscript>
</body>
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
  return `<section class="hero"><div class="container"><div class="hero-inner"><span class="eyebrow">Curated for useful work</span><h1>All the AI tools.<br><span class="accent">Organized.</span></h1><p class="hero-copy">Discover thoughtfully selected AI tools, clearly categorized so you can spend less time searching and more time creating.</p></div></div></section><section class="section"><div class="container"><h2>Explore AI tools by category</h2>${staticCategoryLinks()}</div></section><section class="section"><div class="container"><h2>Featured AI tools</h2>${staticToolLinks(featured)}</div></section>`;
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
  privacy: {title:'Privacy Policy', description:'Read how Novera handles submissions, hosting data, cookies, and advertising privacy.', heading:'A clear, practical privacy policy.', copy:'Novera processes limited hosting and submission information to operate the directory. When advertising is enabled, Google AdSense and its partners may use cookies or similar technologies to deliver and measure ads. Consent choices are provided where required.'},
  terms: {title:'Terms of Use', description:'Read the terms for using Novera and its independent AI tools directory.', heading:'Simple terms for a useful resource.', copy:'Directory content is provided for general discovery. Product details can change, so visitors should verify important information on official websites. Product names and trademarks belong to their respective owners.'},
  contact: {title:'Contact Novera', description:'Contact Novera about listing corrections, privacy, partnerships, or directory feedback.', heading:'Questions, corrections, or feedback?', copy:'Contact the directory about outdated listings, privacy requests, partnerships, or feedback. For a new product, use the structured tool submission form.'}
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

  writeRoute('/submit/', page({
    title:`Submit an AI Tool — ${config.siteName}`,description:'Submit a useful AI product for inclusion in the Novera directory.',route:'/submit/',pageName:'submit',bodyClass:'submit-page',
    content:`<section class="page-hero"><div class="container"><h1>Know a tool worth sharing?</h1><p class="lede">Submit an AI tool for automated quality checks and categorization.</p></div></section>`,schema:[breadcrumbSchema([{name:'Home',route:'/'},{name:'Submit a tool',route:'/submit/'}])]
  }));

  for (const [key, info] of Object.entries(infoPages)) {
    const route = `/${key}/`;
    writeRoute(route, page({
      title:`${info.title} — ${config.siteName}`,description:info.description,route,pageName:'info',bodyClass:'info-page',dataAttr:` data-info="${key}"`,
      content:`<section class="page-hero"><div class="container"><h1>${e(info.heading)}</h1><p class="lede">${e(info.copy)}</p></div></section>`,schema:[breadcrumbSchema([{name:'Home',route:'/'},{name:info.title,route}])]
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
  const runtimeConfig = {siteName:config.siteName,siteUrl:siteUrl,adsense:config.adsense || {publisherId:'',slots:{}}};
  fs.writeFileSync(path.join(root,'assets/site-config.js'),`// Generated from site.config.json.\nwindow.NOVERA_SITE_CONFIG = ${JSON.stringify(runtimeConfig,null,2)};\n`);

  const routes = ['/', '/categories/', ...categories.map(c=>`/categories/${c.slug}/`), '/all-tools/', '/new/', '/submit/', ...Object.keys(infoPages).map(key=>`/${key}/`), ...tools.map(t=>`/tools/${t.slug}/`)];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map(route=>`  <url><loc>${xml(urlFor(route))}</loc><lastmod>${today}</lastmod><changefreq>${route==='/new/'?'daily':route.startsWith('/categories/')?'weekly':'monthly'}</changefreq><priority>${route==='/'?'1.0':route.startsWith('/tools/')?'0.7':'0.8'}</priority></url>`).join('\n')}\n</urlset>\n`;
  fs.writeFileSync(path.join(root,'sitemap.xml'),sitemap);
  fs.writeFileSync(path.join(root,'robots.txt'),`User-agent: *\nAllow: /\nDisallow: /data/\nDisallow: /scripts/\n${siteUrl ? `Sitemap: ${siteUrl}/sitemap.xml\n` : ''}`);

  const recent = tools.filter(t=>t.discoveredAt).sort((a,b)=>String(b.discoveredAt).localeCompare(String(a.discoveredAt))).slice(0,30);
  const feedItems = recent.map(t=>`<item><title>${xml(t.name)}</title><link>${xml(urlFor(`/tools/${t.slug}/`))}</link><guid>${xml(urlFor(`/tools/${t.slug}/`))}</guid><pubDate>${new Date(`${t.discoveredAt}T12:00:00Z`).toUTCString()}</pubDate><description>${xml(t.description)}</description></item>`).join('');
  fs.writeFileSync(path.join(root,'feed.xml'),`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(config.siteName)} new AI tools</title><link>${xml(siteUrl || '/')}</link><description>${xml(config.defaultDescription)}</description>${feedItems}</channel></rss>\n`);

  const adsText = validPublisher() ? `google.com, ${config.adsense.publisherId.replace('ca-','')}, DIRECT, f08c47fec0942fa0\n` : '# Add a valid AdSense publisherId in site.config.json, then run npm run build.\n';
  fs.writeFileSync(path.join(root,'ads.txt'),adsText);
}

generateMachineFiles();
generatePages();
console.log(`Built ${tools.length} tool pages, ${categories.length} category pages, sitemap, feed, and SEO metadata.`);
