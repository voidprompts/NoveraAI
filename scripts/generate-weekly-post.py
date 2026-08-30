#!/usr/bin/env python3
"""Prepare one factual new-tools roundup for editorial review.

The script never publishes directly. It updates data/posts.json on an automation
branch; the scheduled GitHub workflow opens a pull request. Merging that pull
request is the human approval step that makes the article public.
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
    args = parser.parse_args()

    today = dt.date.fromisoformat(args.date) if args.date else dt.date.today()
    config = load(CONFIG_PATH, {}).get("contentAutomation", {})
    if not config.get("enabled", True):
        print("Roundup content automation is disabled.")
        return

    posts = load(POSTS_PATH, [])
    tools = load(TOOLS_PATH, [])
    already_used = {slug for post in posts for slug in post.get("toolSlugs", [])}
    cutoff = today - dt.timedelta(days=14)

    candidates = []
    for tool in tools:
        if tool.get("slug") in already_used:
            continue
        try:
            discovered = dt.date.fromisoformat(tool.get("discoveredAt", "1900-01-01"))
        except ValueError:
            continue
        if args.force or discovered >= cutoff:
            candidates.append(tool)

    candidates.sort(key=lambda tool: (tool.get("discoveredAt", ""), tool.get("name", "")), reverse=True)
    minimum = int(config.get("minimumToolsPerPost", 3))
    maximum = int(config.get("maximumToolsPerPost", 8))
    candidates = candidates[:maximum]
    if len(candidates) < minimum:
        print(f"No draft created: {len(candidates)} unused recent tools; {minimum} required.")
        return

    # Each scheduled run gets a date-specific route so up to three independent
    # review drafts can be prepared in one week without branch or slug clashes.
    slug = f"new-ai-tools-{today.isoformat()}"
    if any(post.get("slug") == slug for post in posts):
        print(f"No draft created: {slug} already exists.")
        return

    category_labels = []
    for tool in candidates:
        label = CATEGORY_NAMES.get(tool.get("category"), "AI Tools")
        if label not in category_labels:
            category_labels.append(label)

    count = len(candidates)
    formatted_date = f"{today.strftime('%B')} {today.day}, {today.year}"
    title = f"{count} New AI Tools to Explore — {formatted_date}"
    category_summary = human_list(category_labels[:4])
    description = f"A reviewed look at {count} newly discovered AI tools across {category_summary}, with clear features, pricing models, and links to detailed listings."
    intro = [
        f"This directory review surfaced {count} products with clearly defined use cases across {category_summary}. Rather than ranking unfamiliar products, this roundup explains what each tool is designed to do and where it fits.",
        "Every product below passed Novera’s automated URL, duplicate, and category checks before entering this editorial draft. Product capabilities and pricing can change, so use each detailed listing as a starting point and confirm important information on the official website.",
    ]
    methodology = (
        "This roundup was generated from newly qualified Novera directory entries. Automated checks validated URLs, removed duplicate domains, and assigned an initial category. "
        "A person reviewed this draft before publication. Inclusion is not a paid endorsement, and affiliate relationships do not affect selection or placement."
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
        "reviewStatus": "approved-by-merge",
    }
    posts.insert(0, post)
    POSTS_PATH.write_text(json.dumps(posts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    subprocess.run(["node", str(ROOT / "scripts" / "build-site.js")], cwd=ROOT, check=True)
    print(f"Prepared review draft: {title}")
    print(f"Tools included: {', '.join(tool['name'] for tool in candidates)}")


if __name__ == "__main__":
    main()
