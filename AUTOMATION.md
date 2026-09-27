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

Discovery is not publication. Newly staged records remain private to the audit queue until they pass either a manual editorial review or the strict automated evidence gate described below. Public statuses are `editorially-corrected`, intentional `directory-only`, and `automatically-reviewed`. Rejected records remain in the audit JSON to prevent rediscovery and receive a distinct `noindex,follow` unavailable notice. Change the discovery threshold, run limit, review batch size, deferral interval, or allowed publication statuses in `site.config.json`.

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

The local update stages this record; it does not make it public. The scheduled reviewer can later assign `automatically-reviewed` only when the official evidence passes every strict gate. Manual maintenance can still use:

- `editorially-corrected` — manually verified and rewritten for a full public listing;
- `directory-only` — intentionally public in the directory but excluded from automated roundups;
- `rejected` — retained only in the audit data with an unavailable notice.

Leave uncertain records as `auto-discovered`. Add an `updatedAt` date whenever a manually maintained listing receives a substantial editorial change, then run `npm run validate`.

## 4. Strict hands-off review and publication

The workflow in `.github/workflows/weekly-roundup.yml` runs every **Monday, Wednesday, and Friday at 05:10 UTC / 1:10 PM Manila**. It processes the existing backlog and future discoveries in conservative batches. No paid model, API key, or generative writing service is used.

For each due candidate, `scripts/auto-review-tools.py`:

1. Validates that the official URL resolves only to public internet addresses and limits redirects, content types, download size, and same-domain evidence links.
2. Fetches the official product page and up to three relevant same-domain documentation, feature, about, or pricing pages.
3. Requires explicit official evidence of AI functionality and an active software product.
4. Requires at least three product-specific capability signals, a clear category, and published pricing or licensing evidence.
5. Produces conservative original copy from fixed editorial templates tied to those capability signals; it does not copy the discovery post or ask a model to invent prose.
6. Assigns `automatically-reviewed` only after every gate passes.
7. Rejects only decisive non-products, such as an academic paper presented as a product record.
8. Leaves unreachable, incomplete, ambiguous, or conflicting records as `auto-discovered`, records a reason in `data/editorial-queue.json`, and schedules a later retry.
9. Writes evidence URLs and content hashes to the non-public `data/editorial-log.jsonl` audit trail.

After reviewing a batch, the workflow:

1. Publishes every verified listing even when fewer than three tools qualify.
2. Creates a roundup only when at least three unused `automatically-reviewed` tools are available in the configured 60-day window.
3. Never reuses a tool in another roundup and never creates thin filler to satisfy the schedule.
4. Runs offline reviewer regression tests, JavaScript and Python syntax checks, a complete rebuild, and the publication/SEO audit.
5. Creates a fresh `automation/editorial-*` branch and pull request only when files actually changed.
6. Restricts automatic merging to a hard allowlist of generated content and audit-data paths. Any workflow, script, configuration, or application-code change blocks the merge.
7. Waits for the exact `Workers Builds: noveraai` preview check, requires a clean merge state and unchanged head commit, then merges and deletes the temporary branch.
8. Leaves the pull request open and unpublished if hosting, validation, path, or merge checks fail. The next scheduled run can retry a safe pending pull request.

The reviewer intentionally favors false negatives over false positives. A candidate can remain pending indefinitely when official evidence is insufficient. Settings are under `automatedReview` and `contentAutomation` in `site.config.json`.

To test the reviewer and publication logic locally:

```bash
npm run test:review
python3 scripts/auto-review-tools.py --dry-run --limit 3
npm run publish:roundup
npm run validate
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
npm run test:review    # run offline regression tests for the strict reviewer
npm run review:auto    # review one due backlog batch using official evidence
npm run publish:roundup # publish only when at least three unused reviewed tools qualify
npm run preview        # preview on port 4173
```

## AdSense activation safety

Advertising is prepared but disabled by default. A valid publisher ID is enough to generate the ownership meta tag and `ads.txt`; it does **not** activate an ad unit. Ad rendering also requires numeric slot IDs and the explicit `adsense.consentReady` switch.

Before changing that switch to `true`:

1. Obtain AdSense site approval and the real `ca-pub-...` identifier.
2. Configure Google's required certified consent message for applicable EEA, UK, and Swiss visitors in AdSense Privacy & messaging.
3. Create the home, listing, and detail ad units.
4. Provide `ADSENSE_PUBLISHER_ID`, the three slot variables, and `ADSENSE_CONSENT_READY=true` in the build environment (or update the equivalent configuration in one reviewed PR).
5. Rebuild and run `npm run validate`; confirm the privacy policy and `ads.txt` are correct before deployment.

Novera deliberately has no ad placement on contact, submission, privacy, terms, author, editorial-policy, pending, rejected, or empty-state pages. Advertising must remain visually labeled and may not influence inclusion, wording, category placement, or review status.

## Editorial transparency

Every public tool page provides a best-fit statement, category-specific evaluation checks, a review label, a dated record marker, an official source, and a no-hands-on-testing disclosure. Published roundups add an at-a-glance section, provider links, product-specific verification prompts, visible organizational authorship, and a source-review disclosure. The organizational author profile is `/authors/novera-editorial/`; the governing source, testing, automation, corrections, and conflicts policy is `/editorial-policy/`.
