/* global process */
import { spawnSync } from 'child_process';
import readline from 'readline';
import path from 'path';
import {
  autoGenerateKey,
  detectExistingConfig,
  loadDotEnv,
  updateWranglerKvId,
} from './setup-config.js';
import { deployWorker as runWranglerDeploy } from './wrangler-deploy.js';

loadDotEnv();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function runCommand(command, args, errorMessage) {
  try {
    console.log(`\nExecuting: ${command} ${args.join(' ')}`);
    const result = spawnSync(command, args, { stdio: 'inherit', encoding: 'utf-8' });
    if (result.status !== 0) {
      throw new Error(result.stderr || errorMessage);
    }
  } catch (error) {
    console.error(`\n❌ Error: ${errorMessage}`);
    console.error(error.message);
    process.exit(1);
  }
}

async function runCommandWithOutput(command, args, errorMessage) {
  try {
    console.log(`\nExecuting: ${command} ${args.join(' ')}`);
    const result = spawnSync(command, args, { encoding: 'utf-8' });
    if (result.status !== 0) {
      throw new Error(result.stderr || errorMessage);
    }
    return result.stdout;
  } catch (error) {
    console.error(`\n❌ Error: ${errorMessage}`);
    console.error(error.message);
    process.exit(1);
  }
}

function hasExistingInfrastructure(existingConfig) {
  return Boolean(existingConfig.kvId || existingConfig.isDeployed);
}

function printExistingConfigSummary(existingConfig) {
  console.log('\nExisting configuration detected:');
  console.log(`  Worker: ${existingConfig.workerName ?? 'unknown'}`);

  if (existingConfig.kvId) {
    const kvStatus = existingConfig.kvValid ? 'valid' : 'not found in account';
    console.log(`  KV namespace: ${existingConfig.kvId} (${kvStatus})`);
  } else {
    console.log('  KV namespace: not configured in wrangler.jsonc');
  }

  console.log(`  API_KEY (Home Assistant): ${existingConfig.hasApiKey ? 'configured' : 'not set'}`);
  console.log(
    `  ALLOWED_EMAIL_TO (inbound recipient): ${existingConfig.hasAllowedEmailTo ? 'configured' : 'not set'}`,
  );

  if (existingConfig.garageDoors) {
    console.log(`  GARAGE_DOORS: ${JSON.stringify(existingConfig.garageDoors)}`);
  } else {
    console.log('  GARAGE_DOORS: not set on deployed worker');
  }
}

async function resolveAuth(existingConfig) {
  console.log('\n--- Cloudflare Authentication ---');

  if (existingConfig.auth.method === 'token') {
    console.log('✅ Using CLOUDFLARE_API_TOKEN from the environment.');
    return;
  }

  if (existingConfig.auth.method === 'oauth') {
    console.log('✅ Already authenticated with Wrangler.');
    return;
  }

  console.log('❌ No Cloudflare authentication detected.');
  console.log('\nTo continue, choose one of the following:');
  console.log(
    '  1. Add CLOUDFLARE_API_TOKEN to your .env file (recommended for CI and local deploys)',
  );
  console.log('  2. Run: unset CLOUDFLARE_API_TOKEN && npx wrangler login');

  if (process.env.CLOUDFLARE_API_TOKEN) {
    console.log(
      '\nNote: CLOUDFLARE_API_TOKEN is set but could not be verified. Check that the token is valid.',
    );
  }

  process.exit(1);
}

async function chooseSetupMode(existingConfig) {
  if (!hasExistingInfrastructure(existingConfig)) {
    return 'fresh';
  }

  printExistingConfigSummary(existingConfig);

  console.log('\nProceed with:');
  console.log('  [1] Reuse existing infrastructure (default)');
  console.log('  [2] Change door mapping');
  console.log('  [3] Full setup from scratch');

  const choice = await question('\nEnter choice (1/2/3) [1]: ');
  const normalized = choice.trim() || '1';

  if (normalized === '2') return 'edit';
  if (normalized === '3') return 'fresh';
  return 'reuse';
}

async function collectDoorsInteractive() {
  const doors = {};
  let addMore = true;

  while (addMore) {
    const appName = await question(
      'What is the EXACT name of the garage door in the myQ app? (e.g. "Main Garage"): ',
    );
    if (!appName.trim()) {
      console.log('Name cannot be empty. Try again.');
      continue;
    }

    let keyName = await question(
      `What identifier key would you like to use for "${appName}"? (e.g. "main-garage" or press Enter to auto-generate): `,
    );

    if (!keyName.trim()) {
      keyName = autoGenerateKey(appName);
      console.log(`Auto-generated key: ${keyName}`);
    }

    doors[appName] = keyName;

    const more = await question('\nDo you have another garage door to add? (y/N): ');
    addMore = more.toLowerCase() === 'y';
  }

  return doors;
}

async function configureGarageDoors(existingConfig, mode) {
  console.log('\n--- Configuring Garage Doors ---');
  console.log(
    'We need to map the exact name of your garage door from the myQ app to a simple identifier key.',
  );
  console.log('Example - App Name: "Garage Door Left", Identifier: "garage-left"\n');

  if (mode === 'reuse' && existingConfig.garageDoors) {
    console.log(`Using existing GARAGE_DOORS: ${JSON.stringify(existingConfig.garageDoors)}`);
    const keep = await question('Keep this door mapping? (Y/n): ');
    if (keep.toLowerCase() !== 'n') {
      return existingConfig.garageDoors;
    }
  }

  if (mode === 'edit' && existingConfig.garageDoors) {
    console.log(`Current GARAGE_DOORS: ${JSON.stringify(existingConfig.garageDoors)}`);
    const replace = await question('Replace this mapping? (y/N): ');
    if (replace.toLowerCase() !== 'y') {
      return existingConfig.garageDoors;
    }
  }

  return collectDoorsInteractive();
}

async function configureApiKey(existingConfig, mode) {
  console.log('\n--- Home Assistant API Key (optional) ---');
  console.log(
    'Browser dashboard access should be protected with Cloudflare Zero Trust / Access (your responsibility).',
  );
  console.log(
    'Set API_KEY only if you use Home Assistant (ha-myq-garage) — it authenticates GET /devices with Bearer.',
  );

  if (existingConfig.hasApiKey && mode !== 'fresh') {
    const update = await question('API_KEY is already configured. Update it? (y/N): ');
    if (update.toLowerCase() !== 'y') {
      return '';
    }

    return question('Enter your new Home Assistant API key: ');
  }

  const wantApiKey = await question('Set API_KEY for Home Assistant? (y/N): ');
  if (wantApiKey.toLowerCase() !== 'y') {
    return '';
  }

  return question('Enter your Home Assistant API key: ');
}

async function configureAllowedEmailTo(existingConfig, mode) {
  console.log('\n--- Allowed Email Recipient (recommended) ---');
  console.log(
    'Set ALLOWED_EMAIL_TO to your Email Routing address so only that envelope RCPT TO is accepted.',
  );

  if (existingConfig.hasAllowedEmailTo && mode !== 'fresh') {
    const update = await question('ALLOWED_EMAIL_TO is already configured. Update it? (y/N): ');
    if (update.toLowerCase() !== 'y') {
      return '';
    }
    return question('Enter the exact inbound email address (RCPT TO): ');
  }

  const want = await question('Set ALLOWED_EMAIL_TO now? (Y/n): ');
  if (want.toLowerCase() === 'n') {
    console.log(
      '⚠️ Skipping ALLOWED_EMAIL_TO. Set it later with: npx wrangler secret put ALLOWED_EMAIL_TO',
    );
    return '';
  }

  return question('Enter the exact inbound email address (RCPT TO): ');
}

async function configureKvNamespace(existingConfig, mode, wranglerPath) {
  console.log('\n--- KV Namespace Setup ---');

  const hasExistingKv = Boolean(existingConfig.kvId && existingConfig.kvValid);

  if (hasExistingKv && mode !== 'fresh') {
    console.log(`Using existing KV namespace: ${existingConfig.kvId}`);
    const createKv = await question('Create a new KV namespace? (y/N): ');
    if (createKv.toLowerCase() !== 'y') {
      console.log('Keeping existing KV namespace.');
      return;
    }
  } else {
    console.log('We need a Cloudflare KV namespace to store your garage state.');
    const defaultPrompt = hasExistingKv ? '(y/N)' : '(Y/n)';
    const createKv = await question(
      `Create a new KV namespace named "GARAGE_STATE"? ${defaultPrompt}: `,
    );
    const shouldCreate = hasExistingKv
      ? createKv.toLowerCase() === 'y'
      : createKv.toLowerCase() !== 'n';

    if (!shouldCreate) {
      console.log('Skipping KV creation. Make sure wrangler.jsonc has a valid KV ID.');
      return;
    }
  }

  const output = await runCommandWithOutput(
    'npx',
    ['wrangler', 'kv', 'namespace', 'create', 'GARAGE_STATE'],
    'Failed to create KV namespace.',
  );

  const match = output.match(/id = "([a-f0-9]+)"/);
  if (match?.[1]) {
    const kvId = match[1];
    console.log(`\n✅ Successfully created KV namespace with ID: ${kvId}`);

    console.log('\nUpdating wrangler.jsonc with new KV ID...');
    if (updateWranglerKvId(wranglerPath, kvId)) {
      console.log('✅ wrangler.jsonc updated!');
    } else {
      console.log('⚠️ Could not find wrangler.jsonc to update automatically.');
    }
    return;
  }

  console.log(
    '\n⚠️ Could not automatically extract KV ID. Please check the output above and manually update wrangler.jsonc.',
  );
}

async function deployWorker(doorsJson, apiKey, allowedEmailTo, workerName, existingSecrets) {
  console.log('\n--- Deployment ---');
  const doDeploy = await question('Ready to deploy to Cloudflare? (Y/n): ');
  if (doDeploy.toLowerCase() === 'n') {
    console.log('Skipping deployment.');
    return;
  }

  console.log('\n🔍 Running deploy dry-run...');
  try {
    runWranglerDeploy({ garageDoors: doorsJson, dryRun: true });
  } catch {
    console.error('Deploy dry-run failed. Fix the issues above before deploying.');
    process.exit(1);
  }

  const confirmDeploy = await question('\nDry-run succeeded. Proceed with deployment? (Y/n): ');
  if (confirmDeploy.toLowerCase() === 'n') {
    console.log('Skipping deployment.');
    return;
  }

  console.log('\n🚀 Deploying...');
  try {
    runWranglerDeploy({ garageDoors: doorsJson });
  } catch {
    console.error('Failed to deploy worker.');
    process.exit(1);
  }

  if (apiKey) {
    console.log('\n🔒 Setting API_KEY secret for Home Assistant...');
    console.log('You will be prompted to enter the key one more time for Cloudflare Secrets.');
    await runCommand(
      'npx',
      ['wrangler', 'secret', 'put', 'API_KEY'],
      'Failed to set API_KEY secret.',
    );
  }

  if (allowedEmailTo) {
    console.log('\n🔒 Setting ALLOWED_EMAIL_TO secret...');
    console.log('You will be prompted to enter the address one more time for Cloudflare Secrets.');
    await runCommand(
      'npx',
      ['wrangler', 'secret', 'put', 'ALLOWED_EMAIL_TO'],
      'Failed to set ALLOWED_EMAIL_TO secret.',
    );
  }

  console.log('\n================================================');
  console.log('🎉 Setup Complete!');
  console.log('Your myQ Garage Worker is deployed.');
  const workerHost = workerName ?? 'myq-garage-worker';
  console.log(`\nDashboard URL: https://${workerHost}.<YOUR_SUBDOMAIN>.workers.dev`);
  console.log('\nNext steps:');
  console.log(
    '1. Put the dashboard behind Cloudflare Zero Trust / Access (operator responsibility).',
  );
  console.log('2. If using Home Assistant, Bypass Access for /devices and set API_KEY.');
  console.log('3. Set up Email Routing in Cloudflare to forward to this worker.');
  console.log('4. Set up your myQ app to send email notifications.');
  console.log('See SETUP.md and README.md for details.');
  if (existingSecrets.hasApiKey && !apiKey) {
    console.log('\n(Existing API_KEY secret was left unchanged.)');
  }
  if (existingSecrets.hasAllowedEmailTo && !allowedEmailTo) {
    console.log('(Existing ALLOWED_EMAIL_TO secret was left unchanged.)');
  }
  console.log('================================================\n');
}

async function setup() {
  console.log('================================================');
  console.log('🚪 Welcome to the myQ Garage Worker Setup Wizard!');
  console.log('================================================\n');

  console.log('This wizard will guide you through setting up and deploying your worker.');
  console.log('Make sure you have a Cloudflare account and have run `npm install`.\n');

  const wranglerPath = path.resolve(process.cwd(), 'wrangler.jsonc');

  console.log('Checking your existing Cloudflare configuration...');
  console.log(
    '(Verifying authentication, KV namespace, secrets, and deployed settings. This may take a moment.)\n',
  );

  const existingConfig = await detectExistingConfig(wranglerPath);

  await resolveAuth(existingConfig);

  const mode = await chooseSetupMode(existingConfig);
  const doors = await configureGarageDoors(existingConfig, mode);
  const doorsJson = JSON.stringify(doors);
  console.log(`\nYour configuration: ${doorsJson}`);

  const apiKey = await configureApiKey(existingConfig, mode);
  const allowedEmailTo = await configureAllowedEmailTo(existingConfig, mode);
  await configureKvNamespace(existingConfig, mode, wranglerPath);
  await deployWorker(doorsJson, apiKey, allowedEmailTo, existingConfig.workerName, {
    hasApiKey: existingConfig.hasApiKey,
    hasAllowedEmailTo: existingConfig.hasAllowedEmailTo,
  });

  rl.close();
}

setup().catch((err) => {
  console.error(err);
  process.exit(1);
});
