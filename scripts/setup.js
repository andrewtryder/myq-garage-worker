/* global process */
import { execSync } from 'child_process';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

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

async function setup() {
  console.log('================================================');
  console.log('🚪 Welcome to the myQ Garage Worker Setup Wizard!');
  console.log('================================================\n');

  console.log('This wizard will guide you through setting up and deploying your worker.');
  console.log('Make sure you have a Cloudflare account and have run `npm install`.\n');

  // Step 1: Login
  const isLogged = await question('Are you already logged into Wrangler (Cloudflare CLI)? (y/N): ');
  if (isLogged.toLowerCase() !== 'y') {
    console.log('\nLogging into Cloudflare. A browser window will open...');
    await runCommand('npx wrangler login', 'Failed to login to Cloudflare.');
  }

  // Step 2: Garage Doors
  console.log('\n--- Configuring Garage Doors ---');
  console.log(
    'We need to map the exact name of your garage door from the myQ app to a simple identifier key.',
  );
  console.log('Example - App Name: "Garage Door Left", Identifier: "garage-left"\n');

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
      keyName = appName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      console.log(`Auto-generated key: ${keyName}`);
    }

    doors[appName] = keyName;

    const more = await question('\nDo you have another garage door to add? (y/N): ');
    addMore = more.toLowerCase() === 'y';
  }

  const doorsJson = JSON.stringify(doors);
  console.log(`\nYour configuration: ${doorsJson}`);

  // Step 3: API Key
  console.log('\n--- Optional API Key ---');
  console.log('You can protect your dashboard with an API key (highly recommended).');
  const wantApiKey = await question('Would you like to set an API key? (Y/n): ');

  let apiKey = '';
  if (wantApiKey.toLowerCase() !== 'n') {
    apiKey = await question('Enter your secret API key: ');
  }

  // Step 4: KV Namespace
  console.log('\n--- KV Namespace Setup ---');
  console.log('We need to create a Cloudflare KV namespace to store your garage state.');

  const createKv = await question('Create a new KV namespace named "myq-garage-state"? (Y/n): ');

  // let kvId = "";
  if (createKv.toLowerCase() !== 'n') {
    const output = await runCommandWithOutput(
      'npx wrangler kv:namespace create GARAGE_STATE',
      'Failed to create KV namespace.',
    );

    // Extract ID from output (usually formatted like `{ binding = "GARAGE_STATE", id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }`)
    const match = output.match(/id = "([a-f0-9]+)"/);
    if (match && match[1]) {
      const kvId = match[1];
      console.log(`\n✅ Successfully created KV namespace with ID: ${kvId}`);

      console.log('\nUpdating wrangler.jsonc with new KV ID...');
      const wranglerPath = path.resolve(process.cwd(), 'wrangler.jsonc');
      if (fs.existsSync(wranglerPath)) {
        let wranglerContent = fs.readFileSync(wranglerPath, 'utf8');
        // Simple regex replace for the ID
        wranglerContent = wranglerContent.replace(/"id":\s*"[a-f0-9]+"/, `"id": "${kvId}"`);
        fs.writeFileSync(wranglerPath, wranglerContent);
        console.log('✅ wrangler.jsonc updated!');
      } else {
        console.log('⚠️ Could not find wrangler.jsonc to update automatically.');
      }
    } else {
      console.log(
        '\n⚠️ Could not automatically extract KV ID. Please check the output above and manually update wrangler.jsonc.',
      );
    }
  } else {
    console.log('Skipping KV creation. Make sure wrangler.jsonc has a valid KV ID.');
  }

  // Step 5: Deploy
  console.log('\n--- Deployment ---');
  const doDeploy = await question('Ready to deploy to Cloudflare? (Y/n): ');

  if (doDeploy.toLowerCase() !== 'n') {
    let deployCmd = `npx wrangler deploy --var GARAGE_DOORS:'${doorsJson}'`;

    console.log('\n🚀 Deploying...');
    await runCommand(deployCmd, 'Failed to deploy worker.');

    if (apiKey) {
      console.log('\n🔒 Setting API_KEY secret...');
      // Wrangler prompts for secrets interactively via stdin by default,
      // but we can pipe it via echo on Unix-like systems. For cross-platform we can run it and instruct.
      console.log(
        'You will be prompted to enter your API key one more time for Cloudflare Secrets.',
      );
      await runCommand('npx wrangler secret put API_KEY', 'Failed to set API_KEY secret.');
    }

    console.log('\n================================================');
    console.log('🎉 Setup Complete!');
    console.log('Your myQ Garage Worker is deployed.');
    if (apiKey) {
      console.log(
        `\nAccess your dashboard at: https://myq-garage-worker.<YOUR_SUBDOMAIN>.workers.dev/?key=${apiKey}`,
      );
    } else {
      console.log(
        '\nAccess your dashboard at: https://myq-garage-worker.<YOUR_SUBDOMAIN>.workers.dev',
      );
    }
    console.log('\nNext steps:');
    console.log('1. Set up Email Routing in Cloudflare to forward to this worker.');
    console.log('2. Set up your myQ app to send email notifications.');
    console.log('See SETUP.md for details.');
    console.log('================================================\n');
  }

  rl.close();
}

setup().catch((err) => {
  console.error(err);
  process.exit(1);
});
