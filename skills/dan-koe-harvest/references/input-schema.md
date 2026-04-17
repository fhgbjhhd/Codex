# Input Schema

Provide JSON from an official X API client or from a manual export of public data.

## Top-level shape

```json
{
  "source": {
    "platform": "x",
    "account": "dan_koe"
  },
  "latest_post": {
    "id": "1900000000000000000",
    "text": "The post text that triggered the run.",
    "created_at": "2026-04-03T08:00:00Z",
    "url": "https://x.com/dan_koe/status/1900000000000000000"
  },
  "participants": [
    {
      "rank": 1,
      "engagement": {
        "type": "reply",
        "like_count": 12,
        "reply_count": 1,
        "retweet_count": 0
      },
      "profile": {
        "username": "founder_ops",
        "name": "Founder Ops",
        "bio": "Helping founders build better systems.",
        "followers_count": 1200,
        "url": "https://x.com/founder_ops"
      },
      "recent_posts": [
        {
          "id": "1",
          "text": "Still spending too much time in repetitive client delivery.",
          "created_at": "2026-04-02T09:30:00Z",
          "url": "https://x.com/founder_ops/status/1"
        }
      ]
    }
  ]
}
```

## Required fields

- `latest_post.id`
- `latest_post.text`
- `participants[]`
- `participants[].profile.username`

## Recommended fields

- `latest_post.url`
- `participants[].profile.bio`
- `participants[].profile.followers_count`
- `participants[].engagement`
- `participants[].recent_posts[]`

## Notes

- Keep the batch to 50 participants or fewer.
- Only include public data you are allowed to process.
- Recent posts should be representative snippets, not a full archive.
- Missing fields are allowed; the scorer falls back to heuristics.
