/* global process */
import { execSync } from 'child_process';
import readline from 'readline';
import path from 'path';
import {
  autoGenerateKey,
  detectExistingConfig,
  loadDotEnv,
  updateWranglerKvId,
} from './setup-config.js';

loadDotEnv();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function runCommand(command, errorMessage) {
  try {
    console.log(`\nExecuting: ${command}`);
    execSync(command, { stdio: 'inherit' });
  } catch (error) {
    console.error(`\n❌ Error: ${errorMessage}`);
    console.error(error.message);
    process.exit(1);
  }
}

async function runCommandWithOutput(command, errorMessage) {
  try {
    console.log(`\nExecuting: ${command}`);
    return execSync(command, { encoding: 'utf-8' });
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

  console.log(`  API_KEY: ${existingConfig.hasApiKey ? 'configured' : 'not set'}`);

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
  console.log('\n--- Optional API Key ---');
  console.log('You can protect your dashboard with an API key (highly recommended).');

  if (existingConfig.hasApiKey && mode !== 'fresh') {
    const update = await question('API_KEY is already configured. Update it? (y/N): ');
    if (update.toLowerCase() !== 'y') {
      return '';
    }

    return question('Enter your new secret API key: ');
  }

  const wantApiKey = await question('Would you like to set an API key? (Y/n): ');
  if (wantApiKey.toLowerCase() === 'n') {
    return '';
  }

  return question('Enter your secret API key: ');
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
    'npx wrangler kv:namespace create GARAGE_STATE',
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

async function deployWorker(doorsJson, apiKey, workerName, hadExistingApiKey) {
  console.log('\n--- Deployment ---');
  const doDeploy = await question('Ready to deploy to Cloudflare? (Y/n): ');
  if (doDeploy.toLowerCase() === 'n') {
    console.log('Skipping deployment.');
    return;
  }

  const deployVarCmd = `npx wrangler deploy --dry-run --var GARAGE_DOORS:'${doorsJson}'`;

  console.log('\n🔍 Running deploy dry-run...');
  await runCommand(deployVarCmd, 'Deploy dry-run failed. Fix the issues above before deploying.');

  const confirmDeploy = await question('\nDry-run succeeded. Proceed with deployment? (Y/n): ');
  if (confirmDeploy.toLowerCase() === 'n') {
    console.log('Skipping deployment.');
    return;
  }

  const deployCmd = `npx wrangler deploy --var GARAGE_DOORS:'${doorsJson}'`;
  console.log('\n🚀 Deploying...');
  await runCommand(deployCmd, 'Failed to deploy worker.');

  if (apiKey) {
    console.log('\n🔒 Setting API_KEY secret...');
    console.log('You will be prompted to enter your API key one more time for Cloudflare Secrets.');
    await runCommand('npx wrangler secret put API_KEY', 'Failed to set API_KEY secret.');
  }

  console.log('\n================================================');
  console.log('🎉 Setup Complete!');
  console.log('Your myQ Garage Worker is deployed.');
  const workerHost = workerName ?? 'myq-garage-worker';
  if (apiKey) {
    console.log(
      `\nAccess your dashboard at: https://${workerHost}.<YOUR_SUBDOMAIN>.workers.dev/?key=${apiKey}`,
    );
  } else if (hadExistingApiKey) {
    console.log(
      `\nAccess your dashboard at: https://${workerHost}.<YOUR_SUBDOMAIN>.workers.dev/?key=YOUR_API_KEY`,
    );
  } else {
    console.log(`\nAccess your dashboard at: https://${workerHost}.<YOUR_SUBDOMAIN>.workers.dev`);
  }
  console.log('\nNext steps:');
  console.log('1. Set up Email Routing in Cloudflare to forward to this worker.');
  console.log('2. Set up your myQ app to send email notifications.');
  console.log('See SETUP.md for details.');
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
  await configureKvNamespace(existingConfig, mode, wranglerPath);
  await deployWorker(doorsJson, apiKey, existingConfig.workerName, existingConfig.hasApiKey);

  rl.close();
}

setup().catch((err) => {
  console.error(err);
  process.exit(1);
});
