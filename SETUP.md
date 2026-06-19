# Setup Guide

This guide will walk you through the end-to-end setup of the `myq-garage-worker` to get your garage door status dashboard up and running.

## 1. Setting up MyQ Email Notifications

To feed data into the worker, we first need to instruct the MyQ app to send email notifications whenever a door opens, closes, or stops.

1. Open the **myQ** app on your phone.
2. Go to the **Notifications** or **Alerts** section.
3. Create a new notification.
4. Set the condition to trigger when your garage door **Opens**, **Closes**, or **Stops**. (You will likely need to create separate rules for each door and each action, or a single rule that covers all actions depending on app version).
5. Ensure the notification delivery method includes **Email** and verify it is sending to your personal email address.
6. **Note exactly what the device is named in the app** (e.g., "Garage Door Left"). You will need this exact string later.

## 2. Deploying the Cloudflare Worker

1. Clone or fork this repository to your local machine.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the interactive setup wizard, which will guide you through mapping your garage doors, creating the KV namespace, and deploying the worker:

   ```bash
   npm run setup
   ```

   **Re-running the wizard:** If you already have a Worker deployed, the wizard detects your existing KV namespace, secrets, and `GARAGE_DOORS` configuration. It defaults to reusing that infrastructure and will not recreate KV unless you explicitly ask it to. A deploy dry-run runs before any live deployment.

   **Authentication:** You can authenticate with a `CLOUDFLARE_API_TOKEN` in a `.env` file (recommended) or with `npx wrangler login`. If `CLOUDFLARE_API_TOKEN` is set, the wizard uses it directly and will not attempt OAuth login.

   _Alternatively, to deploy manually without the wizard:_

   ```bash
   # Set GARAGE_DOORS in .env, then:
   npm run deploy
   ```

   Or with wrangler directly — ensure `GARAGE_DOORS` is valid JSON in `wrangler.jsonc` vars (see `scripts/wrangler-deploy.js`).

   _If using GitHub Actions:_ Add `GARAGE_DOORS` as a Repository Secret in GitHub Settings -> Secrets and variables -> Actions.

## 3. Configuring Cloudflare Email Routing

Now we need to create a dedicated email address on Cloudflare that will trigger this worker.

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Select your domain.
3. Go to **Email** -> **Email Routing** in the sidebar. (If you haven't enabled Email Routing yet, follow the setup steps to configure your DNS records).
4. Go to the **Routing Rules** tab.
5. Click **Create rule**.
6. Set the **Custom address** to something like `garage@yourdomain.com`.
7. Under **Action**, select **Send to a Worker**.
8. Select the `myq-garage-worker` you deployed in step 2.
9. Save the rule.

## 4. Setting up Email Forwarding

Finally, you need to forward the notifications from your personal email to the Cloudflare Worker address you just created.

### If using Gmail:

1. Go to Gmail Settings (gear icon) -> **See all settings**.
2. Go to the **Forwarding and POP/IMAP** tab.
3. Click **Add a forwarding address** and enter the Cloudflare email address you created (e.g., `garage@yourdomain.com`).
4. Google will send a verification code to that address. Since the worker isn't set up to forward that code back to you, you will need to temporarily point that Cloudflare email address to your personal inbox, get the code, verify it, and then point it back to the Worker.
5. Once verified, go to the Gmail search bar, click the filter icon, and create a filter:
   - **From**: `notification@myq.com`
   - Click **Create filter**.
   - Check **Forward it to:** and select your Cloudflare email address.
6. Click **Create filter**.

You're done! Open, close, or stop your garage door. Within a few seconds, the email should route through Gmail, to Cloudflare, trigger the worker, and update your public status dashboard!

## 5. Protect API routes with an API Key

To protect machine-facing routes (`GET /devices`, `GET /?json=true`, `POST /simulate`, `POST /simulate-alert`) while keeping the HTML dashboard at `/` public, create a secret `API_KEY`.

- _Via GitHub Actions:_ Add `API_KEY` as a Repository Secret.
- _Via Cloudflare Dashboard:_ Go to your Worker -> Settings -> Variables -> Add variable, enter `API_KEY`, enter your password/key, and click **Encrypt**.

The status dashboard remains bookmarkable at `https://your-worker.workers.dev/` with no key. Home Assistant and other API clients should send `Authorization: Bearer YOUR_API_KEY` (or use `?key=` / `x-api-key` on protected routes).
