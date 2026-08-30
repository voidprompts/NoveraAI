# Novera publishing, SEO, and monetization setup

## 1. Connect the production domain

Edit `site.config.json` and set `siteUrl` to the final HTTPS domain:

```json
"siteUrl": "https://your-real-domain.com"
```

Then run:

```bash
npm run build
```

This adds production canonical URLs, Open Graph URLs, an absolute sitemap reference, search structured data, and social sharing images to every generated page.

## 2. Enable Google AdSense

After AdSense approves the domain, enter the publisher and responsive ad-slot IDs in `site.config.json`:

```json
"adsense": {
  "publisherId": "ca-pub-1234567890123456",
  "slots": {
    "home": "1111111111",
    "listing": "2222222222",
    "detail": "3333333333"
  }
}
```

Run `npm run build` and deploy. You can alternatively provide `SITE_URL`, `ADSENSE_PUBLISHER_ID`, `ADSENSE_HOME_SLOT`, `ADSENSE_LISTING_SLOT`, and `ADSENSE_DETAIL_SLOT` as deployment environment variables so IDs do not have to be committed. The site then:

- adds the AdSense account verification meta tag;
- generates a valid root `ads.txt` record;
- loads the AdSense library once and only when valid IDs exist;
- renders responsive units on home, listing/category, and detail pages;
- keeps all empty ad placements completely hidden before configuration.

The placements are intentionally low-density to preserve usability and reduce accidental clicks. AdSense approval, policy compliance, CMP/consent configuration, tax setup, and payout details still have to be completed in the publisher's Google account.

## 3. Automatic tool discovery

The scheduled workflow in `.github/workflows/refresh-directory.yml` runs daily at **04:15 UTC / 12:15 PM Manila**. It:

1. Checks enabled sources in `data/discovery-sources.json`.
2. Detects likely AI products.
3. Validates the official URL and description.
4. Removes duplicate names, slugs, and domains.
5. Categorizes each tool using transparent keyword scoring.
6. Rejects records below the configured confidence threshold.
7. Publishes up to eight qualified tools per run.
8. Generates a detail page and adds the tool to its category, search, sitemap, feed, and `/new/` page.
9. Commits the update back to the repository.

Change the confidence threshold, run limit, or auto-publishing behavior in `site.config.json`.

### Add more discovery sources

Add RSS/Atom feeds to `data/discovery-sources.json`:

```json
{
  "name": "Trusted AI product feed",
  "type": "rss",
  "url": "https://publisher.example/feed.xml",
  "enabled": true
}
```

Only use feeds whose terms permit indexing and republication of short factual excerpts.

### Add a tool directly

Place a record in `data/inbox.json` and run `npm run update:local`:

```json
[
  {
    "name": "Example AI",
    "website": "https://example.ai",
    "tagline": "A concise explanation of the useful problem it solves.",
    "description": "A factual, original directory description.",
    "category": "productivity-automation",
    "pricing": "Freemium"
  }
]
```

## 4. Human-reviewed roundup posts

The workflow in `.github/workflows/weekly-roundup.yml` runs every **Monday, Wednesday, and Friday at 05:10 UTC / 1:10 PM Manila**. It does not publish content directly. Instead, it:

1. Selects three to eight qualified tools discovered within the previous 14 days.
2. Excludes tools already used in an earlier roundup.
3. Creates one factual, date-specific roundup with category, pricing, feature, and methodology context.
4. Generates the guide page, BlogPosting structured data, internal links, RSS item, and sitemap entry.
5. Opens a GitHub pull request containing an editorial checklist.
6. Waits for the site owner to review and merge the pull request.

The article only becomes public after the pull request is merged. This human approval step helps prevent inaccurate, repetitive, or low-value scaled content from reaching the production site.

If fewer than three unused qualified tools are available, that scheduled run exits successfully without creating a draft. The system never reuses tools merely to meet the three-times-per-week schedule. Settings are available under `contentAutomation` in `site.config.json`.

To test locally:

```bash
npm run draft:roundup
```

## 5. SEO output

`npm run build` generates or refreshes:

- crawlable server-rendered content shells on every page;
- unique titles and meta descriptions;
- canonical links after a domain is configured;
- Open Graph and Twitter metadata;
- `WebSite`, `SoftwareApplication`, `ItemList`, and `BreadcrumbList` JSON-LD;
- `sitemap.xml`, `robots.txt`, and `feed.xml`;
- internal category, related-tool, tag, and breadcrumb links;
- a 1200×630 social sharing card;
- human-readable URLs for every category and tool.

Submit `/sitemap.xml` in Google Search Console and Bing Webmaster Tools after deployment. Do not add thin, copied, or unverified descriptions merely to increase page count; useful original descriptions are more sustainable for both search and AdSense.

## 6. Commands

```bash
npm run build          # regenerate pages and SEO assets
npm run update         # fetch sources, qualify tools, publish, and rebuild
npm run update:local   # publish inbox data and rebuild without network fetching
npm run preview        # preview on port 4173
```
