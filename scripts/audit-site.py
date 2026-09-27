#!/usr/bin/env python3
"""Audit Novera's generated publication boundary and SEO outputs."""
from __future__ import annotations

import json
import re
import subprocess
import sys
import urllib.parse
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_json(path: str):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def load_js_value(path: str, marker: str):
    text = (ROOT / path).read_text(encoding="utf-8")
    start = text.index(marker) + len(marker)
    value, _ = json.JSONDecoder().raw_decode(text[start:].lstrip())
    return value


def load_core_data():
    script = (
        "const fs=require('fs'),vm=require('vm');"
        "const sandbox={window:{}};vm.createContext(sandbox);"
        "vm.runInContext(fs.readFileSync('assets/data.js','utf8'),sandbox);"
        "process.stdout.write(JSON.stringify(sandbox.window.NOVERA_DATA));"
    )
    return json.loads(subprocess.check_output(["node", "-e", script], cwd=ROOT, text=True))


def fail(message: str):
    raise AssertionError(message)


def route_file(route: str) -> Path:
    return ROOT / ("index.html" if route == "/" else f"{route.strip('/')}/index.html")


def main():
    config = load_json("site.config.json")
    raw_tools = load_json("data/auto-tools.json")
    all_posts = load_json("data/posts.json")
    core = load_core_data()
    public_auto = load_js_value("assets/auto-data.js", "window.NOVERA_AUTO_TOOLS = ")
    public_posts = load_js_value("assets/posts-data.js", "window.NOVERA_POSTS = ")

    public_statuses = set(config.get("discovery", {}).get("publicationStatuses", []))
    expected_auto = [tool for tool in raw_tools if tool.get("reviewStatus") in public_statuses]
    pending = [tool for tool in raw_tools if tool.get("reviewStatus") not in public_statuses | {"rejected"}]
    rejected = [tool for tool in raw_tools if tool.get("reviewStatus") == "rejected"]
    expected_posts = [post for post in all_posts if post.get("publicationStatus") == "published"]
    review_posts = [post for post in all_posts if post.get("publicationStatus") == "editorial-review"]

    expected_auto_slugs = {tool["slug"] for tool in expected_auto}
    actual_auto_slugs = {tool["slug"] for tool in public_auto}
    if actual_auto_slugs != expected_auto_slugs:
        fail("Browser auto-data does not exactly match editorially approved records")
    if [post["slug"] for post in public_posts] != [post["slug"] for post in expected_posts]:
        fail("Browser posts-data includes a non-published guide or omits a published guide")

    public_tools = [*core["tools"], *expected_auto]
    public_slugs = {tool["slug"] for tool in public_tools}
    audit_slugs = [tool["slug"] for tool in raw_tools]
    if len(audit_slugs) != len(set(audit_slugs)):
        fail("Duplicate slugs exist in data/auto-tools.json")
    if public_slugs & {tool["slug"] for tool in pending + rejected}:
        fail("A pending or rejected record crossed the publication gate")

    allowed_statuses = {"auto-discovered", "editorially-corrected", "directory-only", "automatically-reviewed", "rejected"}
    unknown_statuses = sorted({tool.get("reviewStatus") for tool in raw_tools} - allowed_statuses)
    if unknown_statuses:
        fail(f"Unknown review statuses exist: {unknown_statuses}")

    tools_by_slug = {tool["slug"]: tool for tool in raw_tools}
    automated_tools = [tool for tool in raw_tools if tool.get("reviewStatus") == "automatically-reviewed"]
    for tool in automated_tools:
        if tool.get("reviewMethod") != "strict-deterministic-v1":
            fail(f"Automatically reviewed record lacks the expected review method: {tool['slug']}")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(tool.get("reviewedAt", ""))):
            fail(f"Automatically reviewed record lacks a valid review date: {tool['slug']}")
        if tool.get("pricing") not in {"Free", "Freemium", "Paid", "Enterprise"}:
            fail(f"Automatically reviewed record has invalid pricing: {tool['slug']}")
        if tool.get("category") not in {category["slug"] for category in core["categories"]}:
            fail(f"Automatically reviewed record has invalid category: {tool['slug']}")
        if len(tool.get("description", "")) < 260:
            fail(f"Automatically reviewed record has a thin description: {tool['slug']}")
        if len(tool.get("features", [])) < 3 or len(tool.get("tags", [])) < 3:
            fail(f"Automatically reviewed record lacks product-specific fields: {tool['slug']}")

    used_tool_slugs = [slug for post in all_posts for slug in post.get("toolSlugs", [])]
    reused = sorted(slug for slug, count in Counter(used_tool_slugs).items() if count > 1)
    if reused:
        fail(f"Tools are reused across roundup guides: {reused}")

    minimum_tools = int(config.get("contentAutomation", {}).get("minimumToolsPerPost", 3))
    for post in expected_posts:
        missing = set(post.get("toolSlugs", [])) - public_slugs
        if missing:
            fail(f"Published guide {post['slug']} references non-public tools: {sorted(missing)}")
        if post.get("reviewStatus") == "automatically-reviewed":
            if len(post.get("toolSlugs", [])) < minimum_tools:
                fail(f"Automated guide is thinner than the configured minimum: {post['slug']}")
            wrong_status = [slug for slug in post.get("toolSlugs", []) if tools_by_slug.get(slug, {}).get("reviewStatus") != "automatically-reviewed"]
            if wrong_status:
                fail(f"Automated guide includes tools that did not pass automated review: {wrong_status}")
            if "deterministic reviewer" not in post.get("methodology", ""):
                fail(f"Automated guide does not disclose its review method: {post['slug']}")

    queue_path = ROOT / "data/editorial-queue.json"
    if queue_path.exists() and not isinstance(load_json("data/editorial-queue.json"), dict):
        fail("Editorial queue state must be a JSON object")
    log_path = ROOT / "data/editorial-log.jsonl"
    if log_path.exists():
        for number, line in enumerate(log_path.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.strip():
                continue
            entry = json.loads(line)
            if not entry.get("timestamp") or not entry.get("slug") or not entry.get("decision"):
                fail(f"Invalid editorial audit log entry on line {number}")

    tree = ET.parse(ROOT / "sitemap.xml")
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    entries = tree.findall("s:url", ns)
    sitemap_paths = []
    lastmods = []
    for entry in entries:
        loc = entry.findtext("s:loc", namespaces=ns) or ""
        route = urllib.parse.urlsplit(loc).path or "/"
        sitemap_paths.append(route)
        lastmod = entry.findtext("s:lastmod", namespaces=ns) or ""
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", lastmod):
            fail(f"Invalid sitemap lastmod for {route}: {lastmod}")
        lastmods.append(lastmod)
    if len(sitemap_paths) != len(set(sitemap_paths)):
        fail("Sitemap contains duplicate URLs")
    if len(set(lastmods)) < 4:
        fail("Sitemap lastmod values are not route-specific")

    expected_routes = {
        "/", "/categories/", "/all-tools/", "/new/", "/guides/", "/submit/",
        "/about/", "/editorial-policy/", "/authors/novera-editorial/",
        "/privacy/", "/terms/", "/contact/",
        *{f"/categories/{category['slug']}/" for category in core["categories"]},
        *{f"/tools/{slug}/" for slug in public_slugs},
        *{f"/guides/{post['slug']}/" for post in expected_posts},
    }
    if set(sitemap_paths) != expected_routes:
        missing = sorted(expected_routes - set(sitemap_paths))
        extra = sorted(set(sitemap_paths) - expected_routes)
        fail(f"Sitemap route mismatch; missing={missing}, extra={extra}")

    feed = (ROOT / "feed.xml").read_text(encoding="utf-8")
    for tool in pending + rejected:
        route = f"/tools/{tool['slug']}/"
        if route in sitemap_paths or route in feed:
            fail(f"Non-public tool leaked into sitemap or feed: {tool['slug']}")
        html = route_file(route).read_text(encoding="utf-8")
        if '<meta name="robots" content="noindex,follow">' not in html:
            fail(f"Non-public route is missing noindex,follow: {route}")
        if 'application/ld+json' in html:
            fail(f"Non-public route contains structured data: {route}")
        expected_copy = "under editorial review" if tool in pending else "Listing unavailable"
        if expected_copy not in html:
            fail(f"Non-public route has the wrong notice type: {route}")

    for post in review_posts:
        route = f"/guides/{post['slug']}/"
        if route in sitemap_paths or route in feed:
            fail(f"Review guide leaked into sitemap or feed: {post['slug']}")
        html = route_file(route).read_text(encoding="utf-8")
        if '<meta name="robots" content="noindex,follow">' not in html:
            fail(f"Review guide is missing noindex,follow: {route}")
        if 'application/ld+json' in html:
            fail(f"Review guide contains public structured data: {route}")

    for route in sitemap_paths:
        page_path = route_file(route)
        if not page_path.exists():
            fail(f"Sitemap route has no generated file: {route}")
        html = page_path.read_text(encoding="utf-8")
        if '<meta name="robots" content="index,follow' not in html:
            fail(f"Sitemap route is not indexable: {route}")

    # AdSense-readiness and editorial-transparency checks. These verify the
    # crawlable HTML rather than relying on browser JavaScript.
    trust_routes = {
        "/editorial-policy/": ["Source hierarchy", "Evidence review is not hands-on testing", "Corrections and updates", "Advertising, affiliates, and conflicts"],
        "/authors/novera-editorial/": ["Novera Editorial", "Scope of work", "Review approach", "Quality controls", "ProfilePage", "publishingPrinciples"],
        "/privacy/": ["Advertising and consent", "valid publisher ID"],
        "/about/": ["Who is responsible", "/editorial-policy/", "/authors/novera-editorial/"],
    }
    for route, markers in trust_routes.items():
        html = route_file(route).read_text(encoding="utf-8")
        missing = [marker for marker in markers if marker not in html]
        if missing:
            fail(f"Trust page {route} is missing required disclosures: {missing}")

    for tool in public_tools:
        route = f"/tools/{tool['slug']}/"
        html = route_file(route).read_text(encoding="utf-8")
        markers = [
            "Best fit", "Before you choose", "How this listing was reviewed",
            "No hands-on testing claimed", "/editorial-policy/", "Primary source",
        ]
        missing = [marker for marker in markers if marker not in html]
        if missing:
            fail(f"Public tool page lacks decision or review context: {route} missing={missing}")
        if tool.get("website", "") not in html:
            fail(f"Public tool page lacks its official source URL: {route}")

    for post in expected_posts:
        route = f"/guides/{post['slug']}/"
        html = route_file(route).read_text(encoding="utf-8")
        markers = [
            "Official-source review", "Not a hands-on product test", "Best fit",
            "What to verify", "Official sources", "/authors/novera-editorial/",
            "/editorial-policy/", '"citation"',
        ]
        missing = [marker for marker in markers if marker not in html]
        if missing:
            fail(f"Published guide lacks source or testing transparency: {route} missing={missing}")
        for slug in post.get("toolSlugs", []):
            tool = next((item for item in public_tools if item["slug"] == slug), None)
            if not tool or tool.get("website", "") not in html:
                fail(f"Published guide lacks an official source link for {slug}: {route}")

    app_source = (ROOT / "assets/app.js").read_text(encoding="utf-8")
    for misleading in ["Directory score", "Last reviewed</span><strong>August 2026", "Highest rated"]:
        if misleading in app_source:
            fail(f"Browser UI still contains an unsupported quality signal: {misleading}")

    adsense = config.get("adsense", {})
    if adsense.get("publisherId", "") == "":
        ads = (ROOT / "ads.txt").read_text(encoding="utf-8")
        if "google.com, pub-" in ads:
            fail("ads.txt contains a publisher record before an AdSense ID is configured")
        if adsense.get("consentReady") is not False:
            fail("AdSense consent readiness must remain false before an account is configured")
    runtime_config = (ROOT / "assets/site-config.js").read_text(encoding="utf-8")
    if '"consentReady": false' not in runtime_config:
        fail("Browser runtime is missing the default-off AdSense consent switch")
    for required_guard in ["consentReady !== true", "!consentReady"]:
        if required_guard not in app_source:
            fail(f"AdSense loader is missing its consent guard: {required_guard}")

    # Verify every root-relative HTML link resolves to a generated route or a
    # known machine-readable root file. This catches stale internal links.
    machine_files = {"/feed.xml", "/sitemap.xml", "/robots.txt", "/ads.txt"}
    broken = []
    for html_path in ROOT.rglob("*.html"):
        html = html_path.read_text(encoding="utf-8")
        for href in re.findall(r'href="(/[^"#]*)', html):
            route = urllib.parse.urlsplit(href).path
            if route.startswith("/assets/") or route in machine_files:
                continue
            destination = route_file(route if route.endswith("/") else f"{route}/")
            if not destination.exists():
                broken.append((str(html_path.relative_to(ROOT)), href))
    if broken:
        fail(f"Broken internal links found: {broken[:10]}")

    category_counts = Counter(tool["category"] for tool in public_tools)
    for category in core["categories"]:
        route = f"/categories/{category['slug']}/"
        html = route_file(route).read_text(encoding="utf-8")
        listed = len(re.findall(r'class="tool-card"', html))
        if listed != category_counts[category["slug"]]:
            fail(f"Category count mismatch on {route}: {listed} != {category_counts[category['slug']]}")

    print(
        "Audit passed: "
        f"{len(public_tools)} public tools, {len(pending)} pending, {len(rejected)} rejected, "
        f"{len(expected_posts)} published guides, {len(review_posts)} review guides, "
        f"{len(sitemap_paths)} sitemap URLs, {len(set(lastmods))} distinct lastmod dates."
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"AUDIT FAILED: {error}", file=sys.stderr)
        raise
