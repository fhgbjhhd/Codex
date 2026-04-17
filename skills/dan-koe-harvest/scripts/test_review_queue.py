#!/usr/bin/env python3

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import review_queue


class ReviewQueueTests(unittest.TestCase):
    def test_heuristic_analysis_matches_operator_profile(self) -> None:
        candidate = {
            "engagement": {"type": "reply"},
            "profile": {
                "username": "opsfounder",
                "bio": "Founder building systems and AI workflows for agencies.",
                "followers_count": 1200,
            },
            "recent_posts": [
                {"text": "Still too many manual processes in client delivery. Need better automation."},
                {"text": "Trying to delegate recurring work without losing quality."},
            ],
        }

        result = review_queue.heuristic_analysis(candidate, "https://getcyberflow.ai/?ref=test")

        self.assertTrue(result.matched)
        self.assertGreaterEqual(result.score, 60)
        self.assertIn("@opsfounder", result.draft_reply)
        self.assertIn("https://getcyberflow.ai/?ref=test", result.draft_reply)
        self.assertNotIn("If mentions automation directly", result.draft_reply)

    def test_reply_focus_uses_human_language(self) -> None:
        focus = review_queue.reply_focus_from_rationale(["describes manual bottlenecks"])
        self.assertEqual(focus, "you are feeling the drag of manual bottlenecks")


if __name__ == "__main__":
    unittest.main()
