# myq-garage-worker

A Cloudflare Worker that integrates **myQ** notification emails and displays a clean, beautiful status dashboard. State is stored natively in Cloudflare KV.

## Architecture

This worker acts as two endpoints:

1. **Email Routing Handler (`email`)**: Triggered when a myQ notification email is routed to the worker. It parses the sender and subject to extract device action (opened, closed, stopped) and logs the state.
2. **HTTP Handler (`fetch`)**: Serves a sleek, modern dashboard page displaying the current status of the garage doors retrieved directly from Cloudflare KV.

## Tech Stack

- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/)
- **Codebase**: TypeScript, ESLint, Prettier
- **Storage**: [Cloudflare KV](https://developers.cloudflare.com/kv/)

## Security Recommendation

If you are using this worker for personal use, it is highly recommended to protect your public status page. You can easily do this by putting the worker behind [Cloudflare Zero Trust / Access](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/), restricting access to only your authorized emails or identity providers.

## Environment Variables / Configuration

These variables must be configured in your `wrangler.jsonc` or via the Cloudflare dashboard:

| Variable Name  | Description                                                                                |
| -------------- | ------------------------------------------------------------------------------------------ |
| `GARAGE_DOORS` | A JSON array of the exact names of your garage doors as they appear in the myQ app/emails. |

Example `wrangler.jsonc` var configuration:

```jsonc
  "vars": {
    "GARAGE_DOORS": ["Garage Door Left", "Garage Door Right"]
  }
```

You also need to bind a KV Namespace to `GARAGE_STATE`. See `wrangler.jsonc` for details.

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
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare Account ID (e.g. `e10df460dbcb5906dc9046c03bc276c7`).
