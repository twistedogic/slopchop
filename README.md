# slopchop

A durable agent app on [pi-durable](https://github.com/earendil-works/pi). Every turn is committed to
SQLite before it is shown, so a process that dies mid-turn is resumed the next time the app starts.

## Requirements

Node >= 22.18 — it runs the TypeScript directly, so there is no build step.

## Setup

```bash
npm install
cp .env.example .env   # add OPENAI_API_KEY
```

## Run

```bash
npm start -- "what is the capital of France?"
npm start -- "and which river runs through it?"   # same transcript, still there
```

## Check

```bash
npm test        # a turn is answered and survives a restart (faux provider, no API key needed)
npm run typecheck
```

## Layout

| File | What it does |
| --- | --- |
| `src/harness.ts` | Opens the durable session: models, registry, SQLite storage, root conversation |
| `src/cli.ts` | One prompt in, one answer out |
| `src/text.ts` | Text of an entry's assistant message |
| `test/smoke.test.ts` | Answers a turn, then reopens the database and finds it again |

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `OPENAI_API_KEY` | — | OpenAI credential, read by the provider |
| `PI_MODEL` | `gpt-6-sol` | Model id for the root conversation |
| `SLOPCHOP_DB` | `data/session.sqlite` | SQLite file holding the transcript |
