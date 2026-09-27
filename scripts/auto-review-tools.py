#!/usr/bin/env python3
"""Strict, deterministic editorial review for staged AI-tool candidates.

The reviewer deliberately favors false negatives over false positives. It uses
only official pages on the candidate's host, requires explicit AI/product/
pricing evidence, and leaves uncertainty pending. It never asks a model to
invent or paraphrase claims. Decisions and evidence hashes are written to a
private audit log under /data, which robots.txt already disallows.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import ipaddress
import json
import re
import socket
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS_PATH = ROOT / "data" / "auto-tools.json"
QUEUE_PATH = ROOT / "data" / "editorial-queue.json"
LOG_PATH = ROOT / "data" / "editorial-log.jsonl"
CONFIG_PATH = ROOT / "site.config.json"
BUILD_SCRIPT = ROOT / "scripts" / "build-site.js"
REVIEW_VERSION = "strict-deterministic-v1"
ALLOWED_PRICING = {"Free", "Freemium", "Paid", "Enterprise"}
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
CATEGORY_NOUNS = {
    "text-writing": "writing tool",
    "image-generation": "image tool",
    "video-generation": "video tool",
    "audio-music": "audio tool",
    "coding-development": "development tool",
    "productivity-automation": "productivity and automation tool",
    "marketing-sales": "marketing and sales tool",
    "research-knowledge": "research and knowledge tool",
    "design-ux": "design tool",
    "data-analytics": "data and analytics tool",
    "customer-support": "customer-support tool",
    "education-learning": "learning tool",
}

# Every published feature is a fixed editorial sentence tied to explicit words
# on an official page. This avoids copying discovery posts or asking a model to
# manufacture prose.
CAPABILITY_RULES = [
    ("draft-writing", "text-writing", "AI writing", "Draft or revise written content with AI assistance", "AI-assisted drafting", [r"\b(?:ai writing|writing assistant|draft (?:text|content|copy)|rewrite (?:text|content|copy)|copywriting)\b"]),
    ("summarization", "text-writing", "Summarization", "Summarize long text into shorter, usable outputs", "text summarization", [r"\bsummari[sz](?:e|es|ing|ation)\b"]),
    ("grammar-editing", "text-writing", "Grammar editing", "Check grammar, spelling, or writing clarity", "grammar and clarity editing", [r"\b(?:grammar check(?:ing|er)?|grammar correction|spelling check(?:ing|er)?|writing clarity)\b"]),
    ("translation", "text-writing", "Translation", "Translate written content between languages", "AI-assisted translation", [r"\b(?:ai translation|translate text|document translation|multilingual translation)\b"]),
    ("document-chat", "research-knowledge", "Document chat", "Ask questions about uploaded documents or saved material", "question answering over documents", [r"\b(?:chat with|ask questions? (?:about|of)) (?:your )?(?:documents?|pdfs?|files?)\b"]),
    ("web-search", "research-knowledge", "AI search", "Search for information with AI-assisted retrieval", "AI-assisted search", [r"\b(?:ai search|semantic search|search the web|web search)\b"]),
    ("citations", "research-knowledge", "Citations", "Trace answers back to cited sources", "source-linked answers", [r"\b(?:citations?|cited sources?|source-linked|sources? (?:for|behind) (?:the )?answers?)\b"]),
    ("knowledge-base", "research-knowledge", "Knowledge base", "Organize source material into a searchable knowledge base", "searchable knowledge organization", [r"\b(?:knowledge base|knowledge graph|research workspace|second brain)\b"]),
    ("image-generation", "image-generation", "Image generation", "Generate images from text or visual prompts", "prompt-based image generation", [r"\b(?:text[- ]to[- ]image|image generator|generate images?)\b"]),
    ("image-editing", "image-generation", "Image editing", "Edit or transform images with AI-assisted controls", "AI-assisted image editing", [r"\b(?:image editor|edit images?|inpainting|background removal|remove background|photo editor)\b"]),
    ("image-enhancement", "image-generation", "Image enhancement", "Enhance, restore, sharpen, or upscale images", "image enhancement", [r"\b(?:upscal|unblur|sharpen|image restoration|enhance (?:an )?image|enhance photos?)\w*\b"]),
    ("image-detection", "image-generation", "AI image detection", "Check images for signals associated with AI generation", "AI-image detection", [r"\b(?:ai[- ]generated image|detect ai images?|image detector|synthetic image detection)\b"]),
    ("image-3d", "design-ux", "Image to 3D", "Convert reference images into 3D assets or models", "image-to-3D conversion", [r"\b(?:image[- ]to[- ]3d|3d model generation|generate 3d models?)\b"]),
    ("video-generation", "video-generation", "Video generation", "Generate video sequences from prompts or source material", "AI video generation", [r"\b(?:text[- ]to[- ]video|video generator|generate videos?)\b"]),
    ("video-editing", "video-generation", "Video editing", "Edit or revise video with AI-assisted tools", "AI-assisted video editing", [r"\b(?:video editor|edit videos?|non[- ]linear edit|nle\b)\b"]),
    ("subtitles", "video-generation", "Subtitles", "Create subtitles or captions from spoken content", "automatic subtitles and captions", [r"\b(?:automatic subtitles?|ai subtitles?|generate captions?|auto[- ]caption)\b"]),
    ("dubbing", "video-generation", "Dubbing", "Translate or dub spoken video content", "AI-assisted dubbing", [r"\b(?:dubbing|dub videos?|voice translation)\b"]),
    ("video-clipping", "video-generation", "Video clipping", "Find and cut shorter clips from longer recordings", "long-video clipping", [r"\b(?:video clipping|clip generator|short clips?|long[- ]form video)\b"]),
    ("transcription", "audio-music", "Transcription", "Transcribe speech into searchable text", "speech transcription", [r"\b(?:speech[- ]to[- ]text|transcri(?:be|bes|bing|ption))\b"]),
    ("voice-generation", "audio-music", "Voice generation", "Generate spoken audio from text", "AI voice generation", [r"\b(?:text[- ]to[- ]speech|voice generator|generate voices?|speech synthesis)\b"]),
    ("music-generation", "audio-music", "Music generation", "Generate music or sound from prompts", "AI music generation", [r"\b(?:music generator|generate music|text[- ]to[- ]music)\b"]),
    ("code-generation", "coding-development", "Code generation", "Generate or modify source code with AI assistance", "AI-assisted code generation", [r"\b(?:code generation|generate (?:source )?code|ai code generator)\b"]),
    ("ai-coding-workflows", "coding-development", "AI coding", "Support workflows built around AI coding tools", "support for AI coding workflows", [r"\b(?:ai coding|coding assistant|ai pair programmer)\b"]),
    ("code-review", "coding-development", "Code review", "Review source code and surface potential issues", "automated code review", [r"\b(?:code review|review (?:your )?code|pull request review|pr review)\b"]),
    ("testing", "coding-development", "Software testing", "Create or run checks for software quality", "automated software testing", [r"\b(?:generate tests?|test generation|software testing|unit tests?|test suite)\b"]),
    ("debugging", "coding-development", "Debugging", "Analyze failures and support debugging workflows", "AI-assisted debugging", [r"\b(?:debugging|debug code|error analysis|analy[sz]e (?:an )?error)\b"]),
    ("repository-analysis", "coding-development", "Repository analysis", "Analyze repositories, changes, or development history", "repository analysis", [r"\b(?:repository analysis|analy[sz]e (?:a )?(?:repo|repository)|coding history|codebase analysis)\b"]),
    ("multi-agent-dev", "coding-development", "Coding agents", "Coordinate or supervise AI coding agents", "coding-agent coordination", [r"\b(?:(?:coordinate|connect|orchestrate|run|supervise) (?:multiple )?(?:ai )?coding agents?|multi[- ]agent (?:coding|development)|(?:claude code|codex|opencode).{0,35}(?:work together|talk to each other|as (?:one|a) (?:team|group)))\b"]),
    ("agent-verification", "coding-development", "Agent verification", "Verify, constrain, or supervise AI-generated code changes", "verification of AI-generated code", [r"\b(?:verify ai code|independent verification|agent supervision|supervise coding agents?|guardrails? for (?:ai )?(?:code|coding agents?))\b"]),
    ("workflow-automation", "productivity-automation", "Workflow automation", "Connect steps into repeatable automated workflows", "workflow automation", [r"\b(?:workflow automation|automate workflows?|automation platform|orchestrat(?:e|ion))\b"]),
    ("email-automation", "productivity-automation", "Email automation", "Draft, organize, or act on email with AI assistance", "AI-assisted email management", [r"\b(?:email agent|ai email|email automation|manage (?:your )?email)\b"]),
    ("calendar", "productivity-automation", "Calendar automation", "Prepare, schedule, or update calendar events", "calendar automation", [r"\b(?:calendar agent|calendar automation|schedule meetings?|calendar events?)\b"]),
    ("meeting-notes", "productivity-automation", "Meeting notes", "Capture and organize notes or actions from meetings", "automated meeting notes", [r"\b(?:meeting notes?|meeting assistant|action items? from meetings?)\b"]),
    ("task-agents", "productivity-automation", "AI agents", "Use AI agents to carry out multi-step tasks", "agent-led task execution", [r"\b(?:ai agents? (?:that|to|for)|agentic workflows?|personal agents?)\b"]),
    ("marketing-content", "marketing-sales", "Marketing content", "Create campaign or promotional content with AI assistance", "AI-assisted marketing content", [r"\b(?:marketing content|ad copy|campaign content|social media content)\b"]),
    ("sales-outreach", "marketing-sales", "Sales outreach", "Research or personalize sales outreach", "AI-assisted sales outreach", [r"\b(?:sales outreach|lead generation|prospecting|personalized outreach)\b"]),
    ("seo", "marketing-sales", "SEO", "Research or improve search-engine visibility", "AI-assisted SEO workflows", [r"\b(?:seo tool|search engine optimization|keyword research|content optimization)\b"]),
    ("ui-generation", "design-ux", "UI generation", "Generate interface layouts or components from instructions", "AI-assisted interface generation", [r"\b(?:ui generator|generate (?:a )?(?:ui|interface)|text[- ]to[- ]ui|frontend design)\b"]),
    ("prototyping", "design-ux", "Prototyping", "Create or revise product prototypes and design concepts", "AI-assisted prototyping", [r"\b(?:prototype generator|rapid prototyping|design prototype|generate prototypes?)\b"]),
    ("design-systems", "design-ux", "Design systems", "Organize reusable design-system context for people or agents", "design-system organization", [r"\b(?:design system|design tokens?|component library)\b"]),
    ("analytics", "data-analytics", "Analytics", "Analyze data and summarize useful patterns", "AI-assisted analytics", [r"\b(?:ai analytics|analytics platform|analy[sz]e data|data analysis)\b"]),
    ("spreadsheets", "data-analytics", "Spreadsheets", "Process or enrich spreadsheet rows with AI", "AI-assisted spreadsheet processing", [r"\b(?:ai spreadsheet|spreadsheet automation|process spreadsheets?|batch processing for spreadsheets?)\b"]),
    ("sql", "data-analytics", "SQL", "Query structured data with natural-language assistance", "natural-language data queries", [r"\b(?:text[- ]to[- ]sql|natural language (?:to )?sql|ask (?:your )?data)\b"]),
    ("dashboards", "data-analytics", "Dashboards", "Create dashboards, charts, or structured reports", "dashboard and report creation", [r"\b(?:analytics dashboard|create dashboards?|charts? and reports?|data visualization)\b"]),
    ("observability", "data-analytics", "Observability", "Inspect logs, traces, costs, or agent outcomes", "AI-system observability", [r"\b(?:agent observability|llm observability|structured logs?|decision traces?|agent costs?)\b"]),
    ("support-chatbot", "customer-support", "Support chatbot", "Answer support questions through an AI chatbot", "AI-assisted support conversations", [r"\b(?:support chatbot|customer support ai|ai customer service|customer service chatbot)\b"]),
    ("ticketing", "customer-support", "Ticket automation", "Classify, route, or respond to support tickets", "support-ticket automation", [r"\b(?:ticket automation|support tickets?|helpdesk automation|route tickets?)\b"]),
    ("ai-tutor", "education-learning", "AI tutoring", "Provide interactive explanations and guided practice", "AI-guided tutoring", [r"\b(?:ai tutor|personal tutor|tutoring assistant|socratic tutor)\b"]),
    ("course-generation", "education-learning", "Course creation", "Create lessons, courses, or learning materials", "AI-assisted course creation", [r"\b(?:course generator|create courses?|lesson generator|learning materials?)\b"]),
    ("assessment", "education-learning", "Assessment", "Generate or evaluate quizzes, exercises, or mastery checks", "AI-assisted assessment", [r"\b(?:quiz generator|generate quizzes?|mastery checks?|assess learning)\b"]),
]

STRONG_AI_PATTERNS = [
    r"\bartificial intelligence\b", r"\bai[- ]powered\b", r"\bgenerative ai\b",
    r"\blarge language models?\b", r"\bllms?\b", r"\bmachine learning\b",
    r"\b(?:gpt|claude|gemini|copilot|diffusion model|neural network)s?\b",
    r"\bai agents?\b", r"\bagentic\b", r"\bai[- ]assisted\b",
]
PRODUCT_PATTERNS = [
    r"\bget started\b", r"\bsign up\b", r"\btry (?:it|now|free)\b", r"\bdownload\b",
    r"\binstall\b", r"\bapi\b", r"\bdashboard\b", r"\bweb app\b", r"\bplatform\b",
    r"\bsoftware\b", r"\bworkspace\b", r"\bopen source\b", r"\bself[- ]host(?:ed)?\b",
]
MODE_PATTERNS = [
    ("Web app", r"\b(?:web app|browser[- ]based|in your browser)\b"),
    ("API", r"\bapi\b"), ("MCP", r"\bmcp\b"), ("CLI", r"\bcli\b|command[- ]line"),
    ("Browser extension", r"\bbrowser extension\b|chrome extension"),
    ("Desktop app", r"\bdesktop app\b|\bwindows app\b|\bmac(?:os)? app\b"),
    ("Mobile app", r"\bmobile app\b|\bios app\b|\bandroid app\b"),
    ("Open source", r"\bopen source\b|\bapache[- ]2\.0\b|\bmit licen[cs]e\b"),
    ("Self-hosted", r"\bself[- ]host(?:ed|ing)?\b"), ("Local processing", r"\bon[- ]device\b|\bruns? locally\b|\blocal[- ]first\b"),
]
RELEVANT_LINK_TERMS = ("pricing", "plans", "features", "docs", "documentation", "about", "how-it-works", "product", "welcome", "open-source")


def load_json(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def clean_text(value: str | None) -> str:
    value = html.unescape(value or "")
    value = re.sub(r"\s+", " ", value).strip()
    return value


def normalized_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.casefold())


def host_key(url: str) -> str:
    host = (urllib.parse.urlsplit(url).hostname or "").casefold()
    return host.removeprefix("www.")


def validate_public_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("invalid_http_url")
    host = parsed.hostname.casefold()
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        raise ValueError("private_host")
    addresses = {item[4][0] for item in socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)}
    if not addresses:
        raise ValueError("unresolved_host")
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            raise ValueError("non_public_address")
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path or "/", parsed.query, ""))


class SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_public_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class EvidenceParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.meta_description = ""
        self.links: list[str] = []
        self.parts: list[str] = []
        self._ignored = 0
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        attr = {str(k).casefold(): str(v or "") for k, v in attrs}
        if tag in {"script", "style", "noscript", "svg", "template"}:
            self._ignored += 1
        if tag == "title":
            self._in_title = True
        if tag == "meta":
            key = (attr.get("name") or attr.get("property") or "").casefold()
            if key in {"description", "og:description", "twitter:description"} and not self.meta_description:
                self.meta_description = clean_text(attr.get("content"))
        if tag == "a" and attr.get("href"):
            self.links.append(attr["href"])

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript", "svg", "template"} and self._ignored:
            self._ignored -= 1
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._ignored:
            return
        text = clean_text(data)
        if not text:
            return
        if self._in_title:
            self.title = clean_text(f"{self.title} {text}")
        self.parts.append(text)


class EvidencePage:
    def __init__(self, url: str, title: str, description: str, text: str, links: list[str]):
        self.url = url
        self.title = title
        self.description = description
        self.text = text
        self.links = links


def fetch_page(url: str, max_bytes: int = 1_500_000) -> EvidencePage:
    safe = validate_public_url(url)
    opener = urllib.request.build_opener(SafeRedirectHandler())
    request = urllib.request.Request(safe, headers={
        "User-Agent": "NoveraEvidenceBot/1.0 (+strict automated directory review)",
        "Accept": "text/html,application/xhtml+xml,text/plain;q=0.7",
    })
    with opener.open(request, timeout=25) as response:
        final_url = validate_public_url(response.geturl())
        content_type = (response.headers.get_content_type() or "").casefold()
        if content_type not in {"text/html", "application/xhtml+xml", "text/plain"}:
            raise ValueError(f"unsupported_content_type:{content_type}")
        raw = response.read(max_bytes + 1)
        if len(raw) > max_bytes:
            raise ValueError("page_too_large")
        charset = response.headers.get_content_charset() or "utf-8"
        body = raw.decode(charset, errors="replace")
    parser = EvidenceParser()
    parser.feed(body)
    text = clean_text(" ".join(parser.parts))[:120_000]
    return EvidencePage(final_url, clean_text(parser.title)[:300], clean_text(parser.meta_description)[:600], text, parser.links)


def collect_evidence(website: str, max_pages: int) -> list[EvidencePage]:
    first = fetch_page(website)
    pages = [first]
    origin = host_key(first.url)
    ranked: list[tuple[int, str]] = []
    seen = {first.url.rstrip("/")}
    for href in first.links:
        absolute = urllib.parse.urljoin(first.url, href)
        parsed = urllib.parse.urlsplit(absolute)
        if parsed.scheme not in {"http", "https"} or host_key(absolute) != origin:
            continue
        normalized = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path or "/", parsed.query, ""))
        if normalized.rstrip("/") in seen:
            continue
        lower = normalized.casefold()
        score = sum(4 for term in RELEVANT_LINK_TERMS if term in lower)
        if score:
            ranked.append((-score, normalized))
            seen.add(normalized.rstrip("/"))
    for _, url in sorted(ranked)[: max(0, max_pages - 1)]:
        try:
            pages.append(fetch_page(url))
        except Exception:
            continue
    return pages


def affirmative_match(text: str, patterns: list[str]) -> bool:
    for pattern in patterns:
        for match in re.finditer(pattern, text, flags=re.I):
            before = text[max(0, match.start() - 45):match.start()].casefold()
            if re.search(r"\b(?:no|not|never|without|doesn['’]?t|does not|isn['’]?t|is not)\b[^.!?]{0,30}$", before):
                continue
            return True
    return False


def count_patterns(text: str, patterns: list[str]) -> int:
    return sum(1 for pattern in patterns if affirmative_match(text, [pattern]))


def pricing_from_text(text: str) -> tuple[str | None, str]:
    lower = text.casefold()
    without_trials = re.sub(r"\bfree\s+trial\b", "trial", lower)
    free = bool(re.search(r"\b(?:free plan|free tier|free forever|completely free|free to use|available for free|open source|mit licen[cs]e|apache[- ]2\.0)\b", without_trials))
    zero_offer = bool(re.search(r"(?:[$€£]\s*0(?:\.00)?\b|\bprice\s*[:=]?\s*0\b)", lower))
    positive_price = bool(re.search(r"(?:[$€£]\s*(?!0(?:\.0+)?\b)\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d+)?\s*(?:usd|eur|gbp)\b)", lower))
    paid_words = bool(re.search(r"\b(?:paid plans?|subscription|pay as you go|monthly plan|annual plan|per month|/month|contact sales)\b", lower))
    enterprise = "enterprise" in lower and bool(re.search(r"\b(?:contact sales|talk to sales|enterprise plan)\b", lower))
    if (free or zero_offer) and (positive_price or paid_words or enterprise):
        return "Freemium", "official_free_and_paid_signals"
    if free or zero_offer:
        return "Free", "official_free_signal"
    if positive_price or re.search(r"\bpay as you go\b", lower):
        return "Paid", "official_paid_signal"
    if enterprise:
        return "Enterprise", "official_enterprise_signal"
    return None, "missing_pricing_evidence"


def detect_modes(text: str) -> list[str]:
    return [label for label, pattern in MODE_PATTERNS if affirmative_match(text, [pattern])][:4]


def decisive_nonproduct(record: dict, text: str, product_score: int) -> str | None:
    parsed = urllib.parse.urlsplit(record.get("website", ""))
    host = (parsed.hostname or "").casefold().removeprefix("www.")
    path = parsed.path.casefold()
    if host == "arxiv.org" or path.startswith(("/abs/", "/pdf/")):
        return "academic_publication"
    generic = record.get("name", "").casefold() in {"blog", "article", "paper", "research", "news", "arxiv"}
    dated_article = bool(re.search(r"/(?:19|20)\d{2}/\d{1,2}/\d{1,2}/", path))
    article_path = bool(re.search(r"/(?:blog|articles?|posts?|news|papers?|research)/", path))
    scholarly = bool(re.search(r"\b(?:research paper|preprint|abstract|benchmark paper|we present|our study)\b", text, flags=re.I))
    if product_score < 2 and scholarly and (generic or article_path or dated_article):
        return "research_or_article_not_product"
    if product_score < 2 and generic and (article_path or dated_article):
        return "article_not_product"
    return None


def human_list(values: list[str]) -> str:
    if len(values) == 1:
        return values[0]
    if len(values) == 2:
        return f"{values[0]} and {values[1]}"
    return f"{', '.join(values[:-1])}, and {values[-1]}"


def evaluate(record: dict, pages: list[EvidencePage], today: dt.date, minimum_capabilities: int = 3) -> dict:
    evidence_text = clean_text(" ".join(f"{p.title} {p.description} {p.text}" for p in pages))
    lower = evidence_text.casefold()
    evidence_hash = hashlib.sha256(evidence_text.encode("utf-8")).hexdigest()
    product_score = count_patterns(evidence_text, PRODUCT_PATTERNS)
    nonproduct = decisive_nonproduct(record, evidence_text, product_score)
    base = {"slug": record["slug"], "evidenceUrls": [p.url for p in pages], "evidenceSha256": evidence_hash}
    if nonproduct:
        return {**base, "decision": "rejected", "reason": nonproduct}
    if len(evidence_text) < 500:
        return {**base, "decision": "deferred", "reason": "insufficient_official_text"}
    if count_patterns(evidence_text, STRONG_AI_PATTERNS) < 1:
        return {**base, "decision": "deferred", "reason": "official_pages_lack_explicit_ai_evidence"}
    if product_score < 2:
        return {**base, "decision": "deferred", "reason": "official_pages_lack_product_evidence"}

    supplied_name = normalized_name(record.get("name", ""))
    title_space = normalized_name(" ".join(f"{p.title} {p.description}" for p in pages))
    domain_label = normalized_name(host_key(record.get("website", "")).split(".")[0])
    if len(supplied_name) < 2 or (supplied_name not in title_space and supplied_name != domain_label):
        return {**base, "decision": "deferred", "reason": "product_name_not_verified"}

    matched = []
    for key, category, tag, feature, summary, patterns in CAPABILITY_RULES:
        if affirmative_match(evidence_text, patterns):
            matched.append({"key": key, "category": category, "tag": tag, "feature": feature, "summary": summary})
    if len(matched) < minimum_capabilities:
        return {**base, "decision": "deferred", "reason": "fewer_than_three_product_specific_capabilities"}
    scores = Counter(item["category"] for item in matched)
    ranked = scores.most_common()
    category, category_score = ranked[0]
    second_score = ranked[1][1] if len(ranked) > 1 else 0
    if category_score < minimum_capabilities or category_score <= second_score:
        return {**base, "decision": "deferred", "reason": "ambiguous_category"}
    # A deterministic reviewer may confirm a category, but it must not make the
    # kind of nuanced recategorization decision that requires human context.
    # Disagreement with discovery therefore stays pending instead of publishing.
    if category != record.get("category"):
        return {**base, "decision": "deferred", "reason": "official_evidence_conflicts_with_staged_category"}
    category_matched = [item for item in matched if item["category"] == category]
    unique = []
    for item in category_matched:
        if item["feature"] not in {entry["feature"] for entry in unique}:
            unique.append(item)
    if len(unique) < minimum_capabilities:
        return {**base, "decision": "deferred", "reason": "fewer_than_three_same_category_capabilities"}

    pricing, pricing_reason = pricing_from_text(evidence_text)
    if pricing not in ALLOWED_PRICING:
        return {**base, "decision": "deferred", "reason": pricing_reason}
    modes = detect_modes(evidence_text)
    if not modes:
        modes = ["official website"]
    selected = unique[:5]
    summaries = [item["summary"] for item in selected[:3]]
    features = [item["feature"] for item in selected]
    tags = []
    for value in [*(item["tag"] for item in selected), *modes]:
        if value not in tags:
            tags.append(value)
    tags = tags[:4]
    name = clean_text(record["name"])[:70]
    tagline = features[0].rstrip(".") + "."
    category_name = CATEGORY_NAMES[category]
    noun = CATEGORY_NOUNS[category]
    description = (
        f"{name} is an AI {noun} for {summaries[0]}. Official product materials also document "
        f"{human_list(summaries[1:])}. Users can access the product through {human_list(modes)}. "
        f"Novera classified its pricing as {pricing} from the provider’s published plan or licensing information. "
        "Capabilities, limits, and prices can change, so confirm current details on the official website."
    )
    corrected = dict(record)
    corrected.update({
        "category": category,
        "tagline": tagline[:180],
        "pricing": pricing,
        "rating": 0.0,
        "featured": False,
        "description": description,
        "tags": tags,
        "features": features,
        "reviewStatus": "automatically-reviewed",
        "reviewedAt": today.isoformat(),
        "reviewMethod": REVIEW_VERSION,
    })
    return {
        **base,
        "decision": "approved",
        "reason": "strict_official_evidence_gate_passed",
        "pricingReason": pricing_reason,
        "category": category,
        "capabilities": [item["key"] for item in selected],
        "corrected": corrected,
    }


def append_log(entry: dict, now: dt.datetime):
    record = {"timestamp": now.isoformat(), "reviewVersion": REVIEW_VERSION, **entry}
    with LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="Override today's date with YYYY-MM-DD")
    parser.add_argument("--limit", type=int, help="Maximum candidates to review")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and report without changing files")
    parser.add_argument("--result-file", help="Write a machine-readable run summary")
    args = parser.parse_args()

    today = dt.date.fromisoformat(args.date) if args.date else dt.date.today()
    now = dt.datetime.combine(today, dt.time(12), tzinfo=dt.timezone.utc) if args.date else dt.datetime.now(dt.timezone.utc)
    config = load_json(CONFIG_PATH, {}).get("automatedReview", {})
    if not config.get("enabled", False):
        print("Automated review is disabled.")
        return
    batch_size = args.limit or int(config.get("batchSize", 12))
    defer_days = int(config.get("deferDays", 14))
    max_pages = int(config.get("maxOfficialPages", 4))
    minimum_capabilities = max(3, int(config.get("minimumCapabilities", 3)))
    if not config.get("requirePricingEvidence", True):
        raise ValueError("Strict automated publication requires pricing evidence")
    tools = load_json(TOOLS_PATH, [])
    queue = load_json(QUEUE_PATH, {})

    eligible = []
    for index, record in enumerate(tools):
        if record.get("reviewStatus") != "auto-discovered":
            continue
        state = queue.get(record["slug"], {})
        next_date = state.get("nextReviewAt", "")
        if next_date and next_date > today.isoformat():
            continue
        eligible.append((record.get("discoveredAt", ""), int(state.get("attempts", 0)), record.get("slug", ""), index))
    eligible.sort()
    selected = eligible[:batch_size]

    result = {"date": today.isoformat(), "reviewVersion": REVIEW_VERSION, "reviewed": 0, "approved": [], "rejected": [], "deferred": [], "errors": []}
    for _, _, slug, index in selected:
        record = tools[index]
        result["reviewed"] += 1
        try:
            pages = collect_evidence(record["website"], max_pages)
            decision = evaluate(record, pages, today, minimum_capabilities)
        except Exception as error:
            decision = {"slug": slug, "decision": "deferred", "reason": f"fetch_or_parse_error:{type(error).__name__}", "evidenceUrls": [], "error": str(error)[:240]}
        public_log = {key: value for key, value in decision.items() if key != "corrected"}
        if decision["decision"] == "approved":
            tools[index] = decision["corrected"]
            result["approved"].append(slug)
            queue[slug] = {"state": "approved", "attempts": int(queue.get(slug, {}).get("attempts", 0)) + 1, "lastReviewedAt": today.isoformat(), "reason": decision["reason"]}
        elif decision["decision"] == "rejected":
            tools[index]["reviewStatus"] = "rejected"
            tools[index]["reviewedAt"] = today.isoformat()
            tools[index]["reviewMethod"] = REVIEW_VERSION
            result["rejected"].append(slug)
            queue[slug] = {"state": "rejected", "attempts": int(queue.get(slug, {}).get("attempts", 0)) + 1, "lastReviewedAt": today.isoformat(), "reason": decision["reason"]}
        else:
            attempts = int(queue.get(slug, {}).get("attempts", 0)) + 1
            wait = defer_days if attempts < 3 else max(30, defer_days * 2)
            next_review = today + dt.timedelta(days=wait)
            result["deferred"].append({"slug": slug, "reason": decision["reason"], "nextReviewAt": next_review.isoformat()})
            queue[slug] = {"state": "deferred", "attempts": attempts, "lastReviewedAt": today.isoformat(), "nextReviewAt": next_review.isoformat(), "reason": decision["reason"]}
        print(f"{slug}: {decision['decision']} ({decision['reason']})")
        if not args.dry_run:
            append_log(public_log, now)

    print(f"Reviewed {result['reviewed']}: {len(result['approved'])} approved, {len(result['rejected'])} rejected, {len(result['deferred'])} deferred.")
    if args.result_file:
        Path(args.result_file).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.dry_run:
        return
    TOOLS_PATH.write_text(json.dumps(tools, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    QUEUE_PATH.write_text(json.dumps(queue, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    subprocess.run(["node", str(BUILD_SCRIPT)], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
