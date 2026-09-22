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

    for post in expected_posts:
        missing = set(post.get("toolSlugs", [])) - public_slugs
        if missing:
            fail(f"Published guide {post['slug']} references non-public tools: {sorted(missing)}")

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
        "/about/", "/privacy/", "/terms/", "/contact/",
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
