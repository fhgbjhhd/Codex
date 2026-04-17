# n8n Self-Hosted Bridge

This stack runs n8n in Docker with Postgres and wires it to the OpenClaw gateway without exposing third-party API keys to the control UI.

## Deploy

1. Copy `.env.example` to `.env` and fill in production values.
2. Start the stack:

```bash
docker compose --env-file .env up -d
```

3. Open n8n, create an owner account, and store these secrets in **Credentials**:
   - OpenAI API key
   - Perplexity API key
   - Telegram Bot token

## OpenClaw bridge env

Set these on the gateway host before starting OpenClaw:

```bash
export OPENCLAW_N8N_WEBHOOK_RESEARCH_INGEST_URL="https://n8n.example.com/webhook/research-ingest"
export OPENCLAW_N8N_CALLBACK_BASE_URL="https://gateway.example.com"
export OPENCLAW_N8N_STATUS_TOKEN="replace-with-a-shared-secret"
```

`OPENCLAW_N8N_CALLBACK_BASE_URL` must be reachable from the n8n container. If both services share a private network, use that internal URL instead of a public domain.

## Research -> Ingest workflow

Create a workflow in n8n with this node order:

1. **Webhook**
   - Path: `research-ingest`
   - Method: `POST`
   - Expected fields:
     - `bridgeRunId`
     - `sourceUrl`
     - `region`
     - `callbackUrl`
     - `callbackToken`

2. **HTTP Request**: callback start
   - `POST {{$json.callbackUrl}}/integrations/n8n/callback`
   - Header: `X-OpenClaw-N8N-Token: {{$json.callbackToken}}`
   - JSON body:

```json
{
  "bridgeRunId": "={{$json.bridgeRunId}}",
  "status": "running",
  "stepKey": "research",
  "stepLabel": "Research",
  "stepStatus": "running",
  "stepDetail": "Research pipeline started."
}
```

3. **Perplexity / HTTP Request / AI node**
   - Do the research call with n8n Credentials.

4. **Code or Set**
   - Normalize the research payload into the record shape you want to store.

5. **HTTP Request**: OpenClaw ingest target
   - Send the normalized record to your store or downstream API.

6. **HTTP Request**: callback success
   - Same callback URL + token
   - JSON body:

```json
{
  "bridgeRunId": "={{$json.bridgeRunId}}",
  "status": "success",
  "steps": [
    {
      "key": "research",
      "label": "Research",
      "status": "success",
      "detail": "Research completed."
    },
    {
      "key": "ingest",
      "label": "Ingest",
      "status": "success",
      "detail": "Record stored successfully."
    }
  ]
}
```

7. **Error workflow** or failure branch
   - POST the same callback with:

```json
{
  "bridgeRunId": "={{$json.bridgeRunId}}",
  "status": "error",
  "error": "={{$json.error || 'Workflow failed'}}",
  "stepKey": "ingest",
  "stepLabel": "Ingest",
  "stepStatus": "error",
  "stepDetail": "={{$json.error || 'Workflow failed'}}"
}
```

## What the UI expects

- Trigger method: `n8n.trigger`
- Status method: `n8n.status`
- Runs method: `n8n.runs`
- Callback route: `POST /integrations/n8n/callback`

The control UI polls these methods and paints step states:

- green: success
- red: error
- amber: running
- gray: pending
