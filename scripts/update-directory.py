#!/usr/bin/env python3
"""Discover, validate, categorize, and publish new AI tools.

Sources are configured in data/discovery-sources.json. The updater uses only
Python's standard library, keeps an audit trail, prevents duplicates, caps each
run, and calls the SEO/site generator after publishing.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import re
import subprocess
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
AUTO_PATH = DATA_DIR / "auto-tools.json"
INBOX_PATH = DATA_DIR / "inbox.json"
SOURCES_PATH = DATA_DIR / "discovery-sources.json"
CONFIG_PATH = ROOT / "site.config.json"
DATA_JS_PATH = ROOT / "assets" / "data.js"
AUTO_JS_PATH = ROOT / "assets" / "auto-data.js"
LOG_PATH = DATA_DIR / "discovery-log.jsonl"

AI_TERMS = {
    "ai", "artificial intelligence", "llm", "llms", "machine learning", "copilot",
    "agent", "agents", "generative", "gpt", "claude", "automation", "text to image",
    "text-to-image", "voice generation", "ai-powered", "ai powered"
}

CATEGORY_RULES = {
    "text-writing": ["write", "writing", "copy", "grammar", "editor", "summar", "document", "blog", "content"],
    "image-generation": ["image", "photo", "illustrat", "art", "visual", "avatar", "text-to-image", "diffusion"],
    "video-generation": ["video", "film", "clip", "motion", "subtitle", "avatar video", "animation"],
    "audio-music": ["audio", "voice", "speech", "music", "song", "podcast", "sound", "transcri", "dub"],
    "coding-development": ["code", "coding", "developer tool", "programming", "github", "debug", "terminal", "code editor", "ide"],
    "productivity-automation": ["productivity", "automat", "workflow", "orchestrat", "calendar", "meeting", "task", "email", "assistant"],
    "marketing-sales": ["marketing", "sales", "lead", "campaign", "seo", "advert", "crm", "outreach", "conversion"],
    "research-knowledge": ["research", "paper", "knowledge", "search", "citation", "academic", "answer", "science"],
    "design-ux": ["design", "ux", "ui", "prototype", "wireframe", "figma", "website builder", "layout"],
    "data-analytics": ["data", "analytics", "spreadsheet", "sql", "dashboard", "chart", "business intelligence", "database"],
    "customer-support": ["customer", "support", "helpdesk", "chatbot", "service", "ticket", "contact center"],
    "education-learning": ["education", "language learning", "student", "teacher", "tutor", "study", "course", "classroom", "quiz"],
}

FEATURES = {
    "text-writing": ["Create and refine written content", "Summarize and restructure text", "Adapt voice for different audiences", "Move from prompt to draft quickly"],
    "image-generation": ["Generate visual concepts from prompts", "Explore style and composition options", "Create reusable creative assets", "Iterate on visual directions quickly"],
    "video-generation": ["Create video concepts with AI assistance", "Speed up editing and production", "Repurpose content for new formats", "Build shareable visual stories"],
    "audio-music": ["Create or enhance spoken and musical audio", "Work through a simple creative interface", "Export audio for common workflows", "Iterate on sound and voice ideas"],
    "coding-development": ["Accelerate common development tasks", "Work with contextual code assistance", "Explain and improve technical work", "Move from idea to working software"],
    "productivity-automation": ["Reduce repetitive manual work", "Connect tasks into clear workflows", "Organize information and priorities", "Save time across everyday operations"],
    "marketing-sales": ["Create campaign-ready material", "Support prospect and customer research", "Personalize outreach at scale", "Improve repeatable growth workflows"],
    "research-knowledge": ["Find and synthesize useful information", "Explore questions through natural language", "Organize research into clear outputs", "Move from sources to understanding"],
    "design-ux": ["Generate and refine interface ideas", "Explore multiple design directions", "Create editable product concepts", "Shorten early design workflows"],
    "data-analytics": ["Ask natural-language questions of data", "Find patterns and useful signals", "Create clear charts and summaries", "Share insights with a wider team"],
    "customer-support": ["Answer common customer questions", "Assist human support workflows", "Organize and route conversations", "Improve service response time"],
    "education-learning": ["Create guided learning experiences", "Personalize practice and explanations", "Support educators and learners", "Turn material into study activities"],
}

TAG_MAP = {
    "seo": "SEO", "video": "Video", "image": "Images", "voice": "Voice",
    "music": "Music", "code": "Developer", "research": "Research",
    "data": "Data", "marketing": "Marketing", "sales": "Sales",
    "writing": "Writing", "education": "Education", "automation": "Automation",
    "design": "Design", "customer": "Customer support", "productivity": "Productivity"
}


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def fetch_json(url: str):
    request = urllib.request.Request(url, headers={"User-Agent": "NoveraDirectoryBot/1.0 (+directory update)"})
    with urllib.request.urlopen(request, timeout=25) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_text(url: str):
    request = urllib.request.Request(url, headers={"User-Agent": "NoveraDirectoryBot/1.0 (+directory update)"})
    with urllib.request.urlopen(request, timeout=25) as response:
        return response.read().decode("utf-8", errors="replace")


def clean_text(value: str | None) -> str:
    value = html.unescape(value or "")
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def has_exact_term(text: str, term: str) -> bool:
    """Match AI signals as words/phrases, never inside unrelated words like email."""
    return bool(re.search(rf"(?<![a-z0-9]){re.escape(term.lower())}(?![a-z0-9])", text.lower()))


def has_category_term(text: str, term: str) -> bool:
    # Short terms such as AI, UI, UX, IDE, CRM, and SQL need boundaries.
    return has_exact_term(text, term) if len(term) <= 3 else term in text.lower()


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value.lower()).strip("-")
    return value[:70] or "new-ai-tool"


def canonical_url(value: str) -> str:
    if re.search(r"[<>\"']", value or ""):
        return ""
    try:
        parsed = urllib.parse.urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return ""
        return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc.lower(), parsed.path.rstrip("/") or "", "", ""))
    except ValueError:
        return ""


def domain(value: str) -> str:
    return urllib.parse.urlsplit(value).netloc.lower().removeprefix("www.")


def derive_name(title: str) -> str:
    value = re.sub(r"^Show HN:\s*", "", title, flags=re.I).strip()
    # Product names usually precede an em dash, a spaced hyphen, or a descriptor colon.
    value = re.split(r"\s+[—–-]\s+", value, maxsplit=1)[0]
    if ":" in value and len(value.split(":", 1)[0]) <= 36:
        value = value.split(":", 1)[0]
    return clean_text(value)[:70]


def categorize(text: str, title: str = ""):
    lower = text.lower()
    title_lower = title.lower()
    # Clinical documentation products may mention ambient audio or transcription,
    # but their primary use is practice productivity—not audio creation.
    clinical_terms = ("clinical", "therapist", "therapy", "soap note", "patient")
    workflow_terms = ("note", "documentation", "schedule", "appointment", "session")
    if any(term in lower for term in clinical_terms) and any(term in lower for term in workflow_terms):
        return "productivity-automation", 0.92
    title_scores = {
        slug: sum(1 for keyword in words if has_category_term(title_lower, keyword))
        for slug, words in CATEGORY_RULES.items()
    }
    scores = {
        slug: sum(1 + (2 if has_category_term(title_lower, keyword) else 0) for keyword in words if has_category_term(lower, keyword))
        for slug, words in CATEGORY_RULES.items()
    }
    ranked = sorted(scores, key=scores.get, reverse=True)
    best, second = ranked[0], ranked[1]
    if scores[best] == 0:
        return "productivity-automation", 0.35
    margin = scores[best] - scores[second]
    confidence = min(0.96, 0.40 + scores[best] * 0.08 + margin * 0.04)
    # Auto-publishing requires the product title itself to communicate category fit.
    # This prevents technical implementation details in a Show HN post from
    # incorrectly classifying an unrelated product as a developer tool.
    if title_scores[best] == 0:
        confidence = min(confidence, 0.68)
    return best, confidence


def derive_tags(text: str, category: str):
    lower = text.lower()
    tags = [label for keyword, label in TAG_MAP.items() if keyword in lower][:3]
    category_label = category.replace("-", " ").title().replace("Ux", "UX")
    if category_label not in tags and len(tags) < 3:
        tags.append(category_label)
    return tags[:3]


def candidate_from_hn(hit: dict, source_name: str):
    title = clean_text(hit.get("title"))
    description = clean_text(hit.get("story_text") or hit.get("comment_text"))
    text = f"{title} {description}"
    # HN is a broad source: the product title itself must identify an AI
    # capability. This avoids publishing unrelated projects that only mention
    # AI incidentally in their implementation notes.
    if not any(has_exact_term(title, term) for term in AI_TERMS):
        return None
    website = canonical_url(hit.get("url") or "")
    if not website:
        return None
    name = derive_name(title)
    if len(name.split()) > 4:
        host_label = domain(website).split('.')[0]
        if host_label and host_label not in {'www', 'app'}:
            name = host_label.replace('-', ' ').title()
    if len(name) < 2:
        return None
    category, confidence = categorize(text, title)
    display_title = re.sub(r"^Show HN:\s*", "", title, flags=re.I).strip()
    title_parts = re.split(r"\s+[—–-]\s+|:\s+", display_title, maxsplit=1)
    title_descriptor = clean_text(title_parts[1]).rstrip(" .") if len(title_parts) > 1 else ""
    concise = title_descriptor if len(title_descriptor) >= 25 else description[:220].rstrip(" .")
    tagline = concise if len(concise) >= 25 else f"An AI tool for {category.replace('-', ' ')} workflows."
    low_quality_intro = re.match(r"^(hi|hello|good morning|hey)\b", description, flags=re.I)
    if len(description) >= 80 and not low_quality_intro:
        directory_description = description[:420].rstrip(" .") + "."
    else:
        category_label = category.replace('-', ' ')
        directory_description = f"{name} is a newly discovered AI product for {category_label}. {tagline.rstrip('.')}."
    return {
        "name": name,
        "website": website,
        "tagline": tagline[:180],
        "description": directory_description,
        "category": category,
        "confidence": confidence,
        "sourceName": source_name,
        "sourceTitle": title,
        "sourceUrl": f"https://news.ycombinator.com/item?id={hit.get('objectID', '')}",
    }


def candidates_from_rss(source: dict):
    raw = fetch_text(source["url"])
    root = ET.fromstring(raw)
    entries = root.findall(".//item")
    if not entries:  # Atom
        entries = root.findall("{http://www.w3.org/2005/Atom}entry")
    output = []
    for entry in entries[:60]:
        title = clean_text(entry.findtext("title") or entry.findtext("{http://www.w3.org/2005/Atom}title"))
        description = clean_text(entry.findtext("description") or entry.findtext("summary") or entry.findtext("{http://www.w3.org/2005/Atom}summary"))
        link = entry.findtext("link") or ""
        if not link:
            node = entry.find("{http://www.w3.org/2005/Atom}link")
            link = node.get("href", "") if node is not None else ""
        text = f"{title} {description}"
        if not any(has_exact_term(text, term) for term in AI_TERMS):
            continue
        website = canonical_url(link)
        if not website:
            continue
        category, confidence = categorize(text, title)
        output.append({
            "name": derive_name(title), "website": website,
            "tagline": (description or title)[:180],
            "description": (description or title)[:420],
            "category": category, "confidence": confidence,
            "sourceName": source["name"], "sourceUrl": link,
        })
    return output


def discover(source_config: dict):
    found = []
    for source in source_config.get("sources", []):
        if not source.get("enabled") or not source.get("url"):
            continue
        try:
            if source["type"] == "hn_algolia":
                payload = fetch_json(source["url"])
                found.extend(filter(None, (candidate_from_hn(hit, source["name"]) for hit in payload.get("hits", []))))
            elif source["type"] == "rss":
                found.extend(candidates_from_rss(source))
            log("source_ok", {"source": source["name"], "candidates": len(found)})
        except Exception as error:  # one broken source must not stop every source
            log("source_error", {"source": source.get("name"), "error": str(error)[:300]})
    return found


def core_identifiers():
    raw = DATA_JS_PATH.read_text(encoding="utf-8")
    slugs = set(re.findall(r"slug:'([^']+)'", raw))
    websites = {domain(url) for url in re.findall(r"website:'([^']+)'", raw)}
    names = {name.casefold() for name in re.findall(r"name:'([^']+)'", raw)}
    return slugs, websites, names


def normalize_candidate(candidate: dict):
    category = candidate.get("category") or categorize(f"{candidate.get('name','')} {candidate.get('description','')}")[0]
    if category not in CATEGORY_RULES:
        category = categorize(f"{candidate.get('name','')} {candidate.get('description','')}")[0]
    slug = slugify(candidate["name"])
    discovered = dt.date.today().isoformat()
    pricing = candidate.get("pricing", "Freemium")
    if pricing not in {"Free", "Freemium", "Paid", "Enterprise"}:
        pricing = "Freemium"
    raw_tags = candidate.get("tags") or derive_tags(f"{candidate.get('name','')} {candidate.get('description','')}", category)
    raw_features = candidate.get("features") or FEATURES[category]
    return {
        "slug": slug,
        "name": clean_text(candidate["name"])[:70],
        "category": category,
        "tagline": clean_text(candidate.get("tagline") or candidate.get("description"))[:180],
        "pricing": pricing,
        "rating": float(candidate.get("rating", 0)),
        "featured": False,
        "website": canonical_url(candidate["website"]),
        "description": clean_text(candidate.get("description") or candidate.get("tagline"))[:420],
        "tags": [clean_text(str(tag))[:40] for tag in raw_tags][:4],
        "features": [clean_text(str(feature))[:160] for feature in raw_features][:6],
        "discoveredAt": candidate.get("discoveredAt", discovered),
        "sourceName": candidate.get("sourceName", "Submission inbox"),
        "sourceUrl": candidate.get("sourceUrl", candidate["website"]),
        "reviewStatus": "auto-discovered",
    }


def write_auto_js(records: list[dict]):
    payload = json.dumps(records, ensure_ascii=False, indent=2)
    AUTO_JS_PATH.write_text(
        "// Generated by scripts/update-directory.py. Do not edit by hand.\n"
        f"window.NOVERA_AUTO_TOOLS = {payload};\n"
        "if (window.NOVERA_DATA) {\n"
        "  const existing = new Set(window.NOVERA_DATA.tools.map(tool => tool.slug));\n"
        "  window.NOVERA_AUTO_TOOLS.forEach(tool => {\n"
        "    if (!existing.has(tool.slug)) window.NOVERA_DATA.tools.push(tool);\n"
        "  });\n"
        "  window.NOVERA_DATA.categories.forEach(category => {\n"
        "    category.count += window.NOVERA_AUTO_TOOLS.filter(tool => tool.category === category.slug).length;\n"
        "  });\n"
        "}\n",
        encoding="utf-8",
    )


def log(event: str, detail: dict):
    record = {"timestamp": dt.datetime.now(dt.timezone.utc).isoformat(), "event": event, **detail}
    with LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-fetch", action="store_true", help="Rebuild from local data without using network sources")
    parser.add_argument("--dry-run", action="store_true", help="Show candidates without publishing")
    args = parser.parse_args()

    config = load_json(CONFIG_PATH, {})
    source_config = load_json(SOURCES_PATH, {"sources": [], "blockedDomains": []})
    existing = load_json(AUTO_PATH, [])
    inbox = load_json(INBOX_PATH, [])
    candidates = list(inbox)
    if not args.no_fetch:
        candidates.extend(discover(source_config))

    core_slugs, core_domains, core_names = core_identifiers()
    known_slugs = core_slugs | {item["slug"] for item in existing}
    known_domains = core_domains | {domain(item["website"]) for item in existing}
    known_names = core_names | {item["name"].casefold() for item in existing}
    blocked = set(source_config.get("blockedDomains", []))
    minimum = float(config.get("discovery", {}).get("minimumConfidence", 0.55))
    limit = int(config.get("discovery", {}).get("maxNewToolsPerRun", 8))
    accepted = []

    for candidate in candidates:
        try:
            confidence = float(candidate.get("confidence", 1.0 if candidate in inbox else 0))
            item = normalize_candidate(candidate)
            item_domain = domain(item["website"])
            rejection = None
            if confidence < minimum:
                rejection = "low_confidence"
            elif not item["website"] or item_domain in blocked:
                rejection = "blocked_or_invalid_url"
            elif re.match(r"^/(blog|news|article|posts?)/", urllib.parse.urlsplit(item["website"]).path, flags=re.I):
                rejection = "article_not_product"
            elif item["slug"] in known_slugs or item_domain in known_domains or item["name"].casefold() in known_names:
                rejection = "duplicate"
            elif item["name"].casefold() in {"ai", "app", "apps", "tool", "demo", "website"}:
                rejection = "generic_product_name"
            elif re.search(r"\b(game|slop|parody)\b", candidate.get("sourceTitle", ""), flags=re.I):
                rejection = "outside_directory_scope"
            elif len(item["name"]) > 55 or len(item["name"].split()) > 6:
                rejection = "non_product_title"
            elif len(item["tagline"]) < 25:
                rejection = "insufficient_description"
            elif item["tagline"].lower().startswith("an ai tool for "):
                rejection = "generic_fallback_description"
            if rejection:
                log("candidate_rejected", {"name": item.get("name"), "reason": rejection})
                continue
            accepted.append(item)
            known_slugs.add(item["slug"]); known_domains.add(item_domain); known_names.add(item["name"].casefold())
            if len(accepted) >= limit:
                break
        except Exception as error:
            log("candidate_error", {"candidate": str(candidate)[:200], "error": str(error)})

    print(f"Candidates: {len(candidates)} | Qualified new tools: {len(accepted)}")
    for item in accepted:
        print(f"  + {item['name']} -> {item['category']} ({item['website']})")
    if args.dry_run:
        return

    if config.get("discovery", {}).get("autoPublish", True):
        if accepted:
            existing.extend(accepted)
            AUTO_PATH.write_text(json.dumps(existing, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            INBOX_PATH.write_text("[]\n", encoding="utf-8")
            for item in accepted:
                log("tool_published", {"slug": item["slug"], "category": item["category"], "source": item["sourceName"]})
        write_auto_js(existing)
        subprocess.run(["node", str(ROOT / "scripts" / "build-site.js")], check=True, cwd=ROOT)


if __name__ == "__main__":
    main()
