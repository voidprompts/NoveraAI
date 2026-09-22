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
3. Validates the official URL and source description.
4. Removes duplicate names, slugs, and domains.
5. Proposes a category using transparent keyword scoring.
6. Rejects records below the configured confidence threshold.
7. Stages up to eight qualified discoveries per run with `reviewStatus: auto-discovered`.
8. Keeps staged records out of browse pages, category and directory counts, browser-facing tool data, structured data, feeds, and the sitemap.
9. Writes a `noindex,follow` editorial-review notice at each staged route, which also safely replaces any route left by an older deployment.
10. Commits the staged audit update back to the repository.

Discovery is not publication. Only `editorially-corrected` and intentional `directory-only` records enter the public directory. Rejected records remain in the audit JSON to prevent rediscovery and receive a distinct `noindex,follow` unavailable notice. Change the confidence threshold, run limit, or allowed publication statuses in `site.config.json`. Do not set `autoPublish` to true.

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

The local update stages this record; it does not make it public. After checking official sources and replacing all generic copy, an editor can assign one of these statuses in `data/auto-tools.json`:

- `editorially-corrected` — verified and rewritten for a full public listing;
- `directory-only` — intentionally public in the directory but excluded from automated roundups;
- `rejected` — retained only in the audit data with an unavailable notice.

Leave uncertain records as `auto-discovered`. Add an `updatedAt` date whenever an accepted listing receives a substantial editorial change, then run `npm run validate`.

## 4. Human-reviewed roundup posts

The workflow in `.github/workflows/weekly-roundup.yml` runs every **Monday, Wednesday, and Friday at 05:10 UTC / 1:10 PM Manila**. It does not publish content directly. Instead, it:

1. Selects three to eight unused qualified records from the configured 60-day editorial window.
2. Excludes tools already used in an earlier roundup and intentional `directory-only` or rejected records.
3. Creates one factual, date-specific roundup draft with category, pricing, feature, and methodology context.
4. Marks the guide `publicationStatus: editorial-review` and generates a direct preview route with `noindex,follow`.
5. Excludes the draft from the public Guides index, browser-facing post data, BlogPosting structured data, RSS, and the sitemap.
6. Opens a GitHub pull request containing an editorial checklist.
7. Waits for an editor to verify and correct each record, then mark accepted tools public and change the guide to `publicationStatus: published`.

Merging an untouched automation pull request does not publish the guide or its staged listings. The build also fails if a guide marked `published` references any non-public tool. These safeguards help prevent inaccurate, repetitive, or low-value scaled content from reaching indexable production pages.

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
- stable route-specific sitemap `lastmod` dates derived from launch, discovery, editorial-update, and guide dates rather than the build date;
- public-only category counts, search data, feeds, schemas, and sitemap entries;
- `noindex,follow` review or unavailable notices for pending and rejected audit records;
- internal category, related-tool, tag, and breadcrumb links;
- a 1200×630 social sharing card;
- human-readable URLs for every public category and tool.

Submit `/sitemap.xml` in Google Search Console and Bing Webmaster Tools after deployment. Do not add thin, copied, or unverified descriptions merely to increase page count; useful original descriptions are more sustainable for both search and AdSense.

## 6. Commands

```bash
npm run build          # regenerate pages and public-only SEO assets
npm run audit          # verify publication boundaries, routes, counts, links, feeds, and sitemap dates
npm run validate       # rebuild and run the full publication/SEO audit
npm run update         # fetch sources, qualify tools, stage for review, and rebuild
npm run update:local   # stage inbox data and rebuild without network fetching
npm run preview        # preview on port 4173
```
