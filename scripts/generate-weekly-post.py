#!/usr/bin/env python3
"""Publish one evidence-checked new-tools roundup when enough tools qualify.

Only tools that passed the strict deterministic official-evidence reviewer are
eligible. The script skips a scheduled guide when fewer than the configured
minimum remain unused, and it never reuses tools from an earlier guide.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POSTS_PATH = ROOT / "data" / "posts.json"
TOOLS_PATH = ROOT / "data" / "auto-tools.json"
CONFIG_PATH = ROOT / "site.config.json"

CATEGORY_NAMES = {
    "text-writing": "Text & Writing",
    "image-generation": "Image Generation",
    "video-generation": "Video Generation",
    "audio-music": "Audio & Music",
    "coding-development": "Coding & Development",
    "productivity-automation": "Productivity & Automation",
    "marketing-sales": "Marketing & Sales",
    "research-knowledge": "Research & Knowledge",
    "design-ux": "Design & UX",
    "data-analytics": "Data & Analytics",
    "customer-support": "Customer Support",
    "education-learning": "Education & Learning",
}


def load(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def human_list(items: list[str]) -> str:
    if not items:
        return "several categories"
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return f"{', '.join(items[:-1])}, and {items[-1]}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="Override today's date with YYYY-MM-DD for testing")
    parser.add_argument("--force", action="store_true", help="Ignore the discovery-date window")
    parser.add_argument("--review-status", default="automatically-reviewed", help="Publication-gate status eligible for automated roundups")
    args = parser.parse_args()

    today = dt.date.fromisoformat(args.date) if args.date else dt.date.today()
    full_config = load(CONFIG_PATH, {})
    config = full_config.get("contentAutomation", {})
    automated = full_config.get("automatedReview", {})
    if not config.get("enabled", True) or not automated.get("enabled", False):
        print("Automated roundup publication is disabled.")
        return

    posts = load(POSTS_PATH, [])
    tools = load(TOOLS_PATH, [])
    already_used = {slug for post in posts for slug in post.get("toolSlugs", [])}
    candidate_window = int(config.get("candidateWindowDays", 60))
    cutoff = today - dt.timedelta(days=candidate_window)

    candidates = []
    for tool in tools:
        if tool.get("slug") in already_used or tool.get("reviewStatus") != args.review_status:
            continue
        try:
            discovered = dt.date.fromisoformat(tool.get("discoveredAt", "1900-01-01"))
        except ValueError:
            continue
        if args.force or discovered >= cutoff:
            candidates.append(tool)

    candidates.sort(key=lambda tool: (tool.get("reviewedAt", ""), tool.get("discoveredAt", ""), tool.get("name", "")), reverse=True)
    minimum = int(config.get("minimumToolsPerPost", 3))
    maximum = int(config.get("maximumToolsPerPost", 8))
    candidates = candidates[:maximum]
    if len(candidates) < minimum:
        print(f"No roundup published: {len(candidates)} unused strictly reviewed tools in the {candidate_window}-day window; {minimum} required.")
        return

    slug = f"new-ai-tools-{today.isoformat()}"
    if any(post.get("slug") == slug for post in posts):
        print(f"No roundup published: {slug} already exists.")
        return

    category_labels = []
    for tool in candidates:
        label = CATEGORY_NAMES.get(tool.get("category"), "AI Tools")
        if label not in category_labels:
            category_labels.append(label)

    count = len(candidates)
    formatted_date = f"{today.strftime('%B')} {today.day}, {today.year}"
    category_summary = human_list(category_labels[:4])
    title = f"{count} New AI Tools to Explore — {formatted_date}"
    description = f"An evidence-checked roundup of {count} newly reviewed AI tools across {category_summary}, with official links, verified capabilities, and published access models."
    intro = [
        f"This edition covers {count} newly reviewed products across {category_summary}. Each listing passed Novera’s strict automated evidence gate before entering the public directory.",
        "The gate checks official product pages for explicit AI relevance, product-specific capabilities, category evidence, and published pricing or licensing information. Unclear candidates remain unpublished rather than being used to fill a roundup.",
    ]
    methodology = (
        "Novera’s deterministic reviewer fetched the official product site and selected same-domain documentation or pricing pages, then required explicit evidence of AI functionality, an active software product, at least three product-specific capabilities, a clear category, and a supported pricing classification. "
        "The reviewer uses fixed evidence rules rather than a generative model and records evidence URLs and content hashes in a private audit log. Candidates with missing or conflicting evidence stay pending for a later check; unmistakable articles or research-only records are rejected. "
        "Inclusion is not a paid endorsement, and product capabilities, limits, and prices can change, so confirm current details with each provider."
    )
    post = {
        "slug": slug,
        "title": title,
        "description": description,
        "date": today.isoformat(),
        "updated": today.isoformat(),
        "author": config.get("author", "Novera Editorial"),
        "type": "New tools roundup",
        "readingTime": max(4, min(9, 2 + count)),
        "toolSlugs": [tool["slug"] for tool in candidates],
        "intro": intro,
        "methodology": methodology,
        "reviewStatus": "automatically-reviewed",
        "publicationStatus": "published",
    }
    posts.insert(0, post)
    POSTS_PATH.write_text(json.dumps(posts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    subprocess.run(["node", str(ROOT / "scripts" / "build-site.js")], cwd=ROOT, check=True)
    print(f"Published evidence-checked roundup: {title}")
    print(f"Tools included: {', '.join(tool['name'] for tool in candidates)}")


if __name__ == "__main__":
    main()
