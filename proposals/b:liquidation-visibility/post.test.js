import test from 'ava';
import { executeCommand } from "../../packages/synthetic-chain/src/lib/cliHelper.js";
import fs from 'fs';

/**
 * 1. Add new collateral manager
 * 2. Manipulate prices for the new collateral via oracles
 * 3. Open a vault
 * 4. Trigger liquidation
 */

test.serial('build-proposal', async t => {
  const dstPath = '/usr/src/agoric-sdk/packages/inter-protocol/scripts/add-STARS.js';
  if (!fs.existsSync(dstPath)) {
    fs.copyFileSync('./add-STARS.js', dstPath);
  }

  await executeCommand('agoric run', [dstPath]);

  t.pass();
});