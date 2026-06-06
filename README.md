# myq-garage-worker

A Cloudflare Worker that integrates **myQ** notification emails with **Adafruit IO** feeds and displays a clean, beautiful status dashboard.

## Architecture

This worker acts as two endpoints:

1. **Email Routing Handler (`email`)**: Triggered when a myQ notification email is routed to the worker. It parses the sender and subject to extract device action (opened, closed, stopped) and maps it to specific Adafruit IO feeds.
2. **HTTP Handler (`fetch`)**: Serves a sleek, modern dashboard page displaying the current status of the garage doors retrieved directly from the last data point in your Adafruit IO feeds.

## Tech Stack

- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/)
- **Codebase**: TypeScript, ESLint, Prettier
- **Integration**: Adafruit IO REST API

## Environment Variables / Secrets

These variables must be configured on Cloudflare Workers (either via the dashboard or using `npx wrangler secret put`):

| Variable Name       | Description                                           |
| ------------------- | ----------------------------------------------------- |
| `ADAFRUIT_USERNAME` | Your Adafruit IO username                             |
| `ADAFRUIT_IO_KEY`   | Your Adafruit IO API key (Secret)                     |
| `GARAGE_LEFT_FEED`  | Key of the Adafruit IO feed for the Left garage door  |
| `GARAGE_RIGHT_FEED` | Key of the Adafruit IO feed for the Right garage door |

## Local Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Boot the local development server (remotely proxying to Cloudflare APIs):

   ```bash
   npm run dev
   ```

3. Open `http://localhost:8787` to view the local instance of the status page.

## Formatting & Linting

We maintain a strict code quality process:

- Linting check: `npm run lint`
- Formatting code: `npm run format`
- Type checking: `npm run typecheck`

## Continuous Integration / Deployment (CI/CD)

Deployments are automated through **GitHub Actions** when code is pushed to the `main` branch.

To set this up, add the following Repository Secrets in your GitHub repository (**Settings** -> **Secrets and variables** -> **Actions**):

- `CLOUDFLARE_API_TOKEN`: Your Cloudflare API Token (scoped to Edit Workers).
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare Account ID (`e10df460dbcb5906dc9046c03bc276c7`).
