# Contributing

Our Ground is a resource directory and navigation project. Changes should make public information easier to find, understand and use.

Open an issue to discuss a substantial change. Describe the problem, the intended behavior and any accessibility or privacy implications. Avoid including personal circumstances, identifying service-user information or account credentials in public issues.

## Local development

Use Node 24 and the committed lockfile.

```sh
npm ci
npm run dev:local:api
```

In another terminal, run `npm run dev:local:web` and open `http://127.0.0.1:18417`. The local adapter uses explicitly fictional records. It does not require production credentials.

Run the checks relevant to your change. The usual baseline is:

```sh
npm test
npm run build
npm run check:secrets:build
```

The repository’s CI also checks database privacy boundaries and browser behavior. Prefer controlled fixtures for voice and tool tests. Real Gemini requests consume a shared provider allowance and require an approved environment.

## Pull requests

Explain the user-visible problem, the change and how you verified it. Include keyboard and narrow-screen evidence for interface changes. Keep directory facts, source attribution and synthetic fixtures distinct.

Preserve authentication, organization authorization, request validation and privacy controls. Never commit local environment files, provider credentials, database exports, browser session state or account/dashboard captures. Inspect screenshots, recordings and logs before sharing them.

Discuss deployment, schema, data imports and provider configuration with the maintainer before execution. A source contribution does not by itself authorize a production rollout.

## Rights and attribution

Preserve existing notices and document the origin and permitted use of new code, data and media. Third-party components retain their own terms. See [credits](CREDITS.md) and the rights section of the [README](README.md).
