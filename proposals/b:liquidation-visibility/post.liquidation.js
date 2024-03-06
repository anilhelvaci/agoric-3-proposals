import test from 'ava';
import {
  executeCommand,
  makeFileRW,
  makeWebCache,
  makeWebRd,
  bundleDetail,
} from '@agoric/synthetic-chain';
import * as fsp from 'fs/promises';
import { existsSync } from 'fs';
import { tmpName } from 'tmp';
import * as path from 'path';

const config = {
  featuresSrc: 'visibilityFeaturesProof.tar',
  release:
    'https://github.com/Jorge-Lopes/agoric-sdk-liquidation-visibility/releases/tag/liq-visibility-a3p-v0.1',
};

/**
 * TODO: Make sure to use SHA512 instead of cksum
 */
test.serial('checksum from repo matches local one', async t => {
  const src = makeWebRd(config.release.replace('/tag/', '/download/') + '/', {
    fetch,
  });
  const tmpNameP = prefix =>
    new Promise((resolve, reject) =>
      tmpName({ prefix }, (err, x) => (err ? reject(err) : resolve(x))),
    );
  const td = await tmpNameP('assets');
  const dest = makeFileRW(td, { fsp, path });
  const assets = makeWebCache(src, dest);
  const proofPath = await assets.storedPath('visibilityFeaturesProof.tar');

  const [cksumWeb, cksumLocal] = (
    await Promise.all([
      executeCommand('cksum', [proofPath]),
      executeCommand('cksum', ['./visibilityFeaturesProof.tar']),
    ])
  ).map(cksum => cksum.split(' ')[0]);

  t.log({ cksumWeb, cksumLocal });
  t.is(cksumWeb, cksumLocal);
  t.context = {
    assets,
  };
});

test.serial('unarchive .tar and copy content under agoric-sdk', async t => {
  const unarchiveFolder = new URL('./artifacts', import.meta.url);
  await fsp.mkdir(unarchiveFolder);

  await executeCommand('tar', [
    '-xf',
    'visibilityFeaturesProof.tar',
    '-C',
    'artifacts',
  ]);

  await executeCommand('./helper.sh', []);

  const interProtocolPath = '/usr/src/agoric-sdk/packages/inter-protocol';
  if (
    existsSync(
      `${interProtocolPath}/src/proposals/vaultsLiquidationVisibility.js`,
    ) &&
    existsSync(`${interProtocolPath}/scripts/liquidation-visibility-upgrade.js`)
  ) {
    t.pass();
    return;
  }
  t.fail();
});
/**
 * Bundle hash of the vaultFactory copied from .tar must match with the one
 * used for incarnation 1.
 */
test.serial('make sure bundle hashes match', async t => {
  // Rebuild bundles after copy
  await executeCommand('yarn', ['build:bundles'], {
    cwd: '/usr/src/agoric-sdk/packages/inter-protocol',
  });

  const {
    default: { endoZipBase64Sha512: copiedVFaHash },
  } = await import(
    '/usr/src/agoric-sdk/packages/inter-protocol/bundles/bundle-vaultFactory.js'
  );

  const { endoZipBase64Sha512: originalHash } = bundleDetail('./assets/b1-ccaf7d7db13a60ab9bcdc085240a4be8ee590486a763fb2e94dbc042000af7d5fdeb54edb8bc26febde291c2f777f8c39c47bbbad2b90bcc9da570b09cafec54.json')

  t.is(originalHash, copiedVFaHash);
});

/**
 * - copy mutated vaultFactory.js and auctioneer.js to relevant addresses
 * - agoric run on both of them
 */
test.todo('build proposal for timer upgrades');

/**
 * - ensure enough IST
 * - install bundles
 * - submit proposal
 * - vote
 * - check incarnation numbers
 *    - 1 for auctioneer, 2 for vaultFactory
 */
test.todo('deploy incarnation 2');
