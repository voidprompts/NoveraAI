#!/usr/bin/env python3
"""Offline regression tests for the strict deterministic reviewer."""
from __future__ import annotations

import datetime as dt
import importlib.util
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("auto-review-tools.py")
spec = importlib.util.spec_from_file_location("auto_review_tools", MODULE_PATH)
review = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(review)


class ReviewerTests(unittest.TestCase):
    def page(self, url: str, title: str, text: str):
        return review.EvidencePage(url, title, text[:300], text, [])

    def record(self, **updates):
        value = {
            "slug": "proofcode",
            "name": "ProofCode",
            "website": "https://proofcode.example",
            "category": "productivity-automation",
            "tagline": "Staged discovery text",
            "pricing": "Freemium",
            "rating": 0,
            "featured": False,
            "description": "Staged discovery description",
            "tags": ["AI"],
            "features": ["Generic feature"],
            "discoveredAt": "2026-09-01",
            "sourceName": "Test",
            "sourceUrl": "https://example.com/source",
            "reviewStatus": "auto-discovered",
        }
        value.update(updates)
        return value

    def test_accepts_only_with_ai_product_capabilities_and_pricing(self):
        text = (
            "ProofCode is an AI-powered web app and coding agent. Sign up and get started in the dashboard. "
            "Use AI-assisted code generation, automated code review, test generation, and repository analysis. "
            "A free plan is available. The Pro plan costs $9 per month. Download reports or use the API. " * 5
        )
        result = review.evaluate(self.record(category="coding-development"), [self.page("https://proofcode.example/", "ProofCode AI coding platform", text)], dt.date(2026, 9, 27))
        self.assertEqual(result["decision"], "approved")
        corrected = result["corrected"]
        self.assertEqual(corrected["category"], "coding-development")
        self.assertEqual(corrected["pricing"], "Freemium")
        self.assertEqual(corrected["reviewStatus"], "automatically-reviewed")
        self.assertGreaterEqual(len(corrected["features"]), 3)
        self.assertGreaterEqual(len(corrected["description"]), 260)

    def test_missing_pricing_stays_pending(self):
        text = (
            "ProofCode is an AI-powered coding agent and web app. Get started in the dashboard. "
            "It supports code generation, code review, test generation, debugging, and repository analysis. " * 8
        )
        result = review.evaluate(self.record(category="coding-development"), [self.page("https://proofcode.example/", "ProofCode", text)], dt.date(2026, 9, 27))
        self.assertEqual(result["decision"], "deferred")
        self.assertEqual(result["reason"], "missing_pricing_evidence")

    def test_arxiv_is_rejected_as_publication(self):
        record = self.record(slug="paper", name="Paper", website="https://arxiv.org/abs/2609.12345")
        text = "Research paper abstract. We present a benchmark study of artificial intelligence systems. " * 10
        result = review.evaluate(record, [self.page(record["website"], "Paper abstract", text)], dt.date(2026, 9, 27))
        self.assertEqual(result["decision"], "rejected")
        self.assertEqual(result["reason"], "academic_publication")

    def test_negated_generation_is_not_a_capability(self):
        text = (
            "ProofCode is an AI-powered platform and web app. Sign up to use the dashboard and API. "
            "It does not generate images and never provides an image generator. It offers semantic search and cited sources. "
            "A free plan is available. " * 7
        )
        result = review.evaluate(self.record(), [self.page("https://proofcode.example/", "ProofCode", text)], dt.date(2026, 9, 27))
        self.assertEqual(result["decision"], "deferred")
        self.assertNotIn("image-generation", [item.get("category") for item in result.get("matched", [])])

    def test_category_disagreement_never_auto_recategorizes(self):
        text = (
            "ProofCode is an AI-powered web app and platform. Sign up and use the dashboard and API. "
            "It supports AI writing, draft writing, rewriting, summarization, and grammar checking. A free plan and a $9 paid plan are available. " * 7
        )
        result = review.evaluate(self.record(category="data-analytics"), [self.page("https://proofcode.example/", "ProofCode", text)], dt.date(2026, 9, 27))
        self.assertEqual(result["decision"], "deferred")
        self.assertEqual(result["reason"], "official_evidence_conflicts_with_staged_category")

    def test_private_network_urls_are_blocked(self):
        with self.assertRaises(ValueError):
            review.validate_public_url("http://127.0.0.1/admin")


if __name__ == "__main__":
    unittest.main()
