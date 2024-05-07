import test from 'ava';
import {
//   executeCommand,
//   makeFileRW,
//   makeWebCache,
//   makeWebRd,
//   bundleDetail,
  proposalBuilder,
//   readBundles,
//   passCoreEvalProposal,
} from '@agoric/synthetic-chain';
import * as fsp from 'fs/promises';
// import { existsSync } from 'fs';
// import { tmpName } from 'tmp';
// import * as path from 'path';

const config = {
  script: './add-STARS.js',
  dest: '/usr/src/agoric-sdk/packages/inter-protocol/scripts/add-STARS.js',
};

test.serial('copy add-STARS.js to @agoric/inter-protocol/scripts', async t => {
  await fsp.cp(config.script, config.dest);
  t.pass();1
});

test.serial.only('build prop', async t => {
  const {
    evals,
    bundles
  } = await proposalBuilder(config.dest);
  t.log({
    evals,
    bundles
  });

  t.pass();
})
