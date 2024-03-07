import test from 'ava';
import {
  executeCommand,
  makeFileRW,
  makeWebCache,
  makeWebRd,
  bundleDetail,
  proposalBuilder,
  evalBundles,
} from '@agoric/synthetic-chain';
import * as fsp from 'fs/promises';
import { existsSync } from 'fs';
import { tmpName } from 'tmp';
import * as path from 'path';
import {
  copyAll,
  extractNameFromPath,
} from "./core-eval-support.js";

const config = {
  featuresSrc: 'visibilityFeaturesProof.tar',
  release:
    'https://github.com/Jorge-Lopes/agoric-sdk-liquidation-visibility/releases/tag/liq-visibility-a3p-v0.1',
  originalBundle: 'b1-ccaf7d7db13a60ab9bcdc085240a4be8ee590486a763fb2e94dbc042000af7d5fdeb54edb8bc26febde291c2f777f8c39c47bbbad2b90bcc9da570b09cafec54.json'
};

test.before(async t => {
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
  t.context = {
    assets,
    tmpNameP,
  };
})

/**
 * TODO: Make sure to use SHA512 instead of cksum
 */
test.skip('checksum from repo matches local one', async t => {
  const { assets } = t.context;
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

test.skip('unarchive .tar and copy content under agoric-sdk', async t => {
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
test.skip('make sure bundle hashes match', async t => {
  // Rebuild bundles after copy
  console.log('Building bundles...');
  await executeCommand('yarn', ['build:bundles'], {
    cwd: '/usr/src/agoric-sdk/packages/inter-protocol',
  });

  console.log('Importing vaultFactory bundle...');
  const {
    default: { endoZipBase64Sha512: copiedVFaHash },
  } = await import(
    '/usr/src/agoric-sdk/packages/inter-protocol/bundles/bundle-vaultFactory.js'
    );

  const { endoZipBase64Sha512: originalHash } = bundleDetail(`./assets/${config.originalBundle}`)

  t.is(originalHash, copiedVFaHash);
});

/**
 * - Prerequisites
 *    - manualTimer contract +
 *    - mutated auctioneer
 *    - mutated vault factory +
 *    - proposal
 *    - script
 *    - built artifacts
 * - copy mutated vaultFactory.js and auctioneer.js to relevant addresses
 * - agoric run on both of them
 */
test.skip('prepare vault factory', async t => {
  // Prepare mutated vaultFactory
  const rootRW = makeFileRW('.', { fsp, path });
  const termsW = rootRW.join('./termsWrapper.js');
  const termsR = termsW.readOnly();
  const content = await termsR.readText();
  console.log('TERM WRAPPER');
  console.log(content);

  const vfRW = rootRW.join('./artifacts/src/vaultFactory/vaultFactory.js');
  const vfVersion2 = rootRW.join('./artifacts/src/vaultFactory/vaultFactoryV2.js');
  const vfRead = vfRW.readOnly();
  const vfText = await vfRead.readText();
  const replaceText = 'termsWrapper(zcf.getTerms(), privateArgs);'
  const vfMutated = vfText.replace('zcf.getTerms();', replaceText);
  await vfVersion2.writeText(content + '\n' + vfMutated);

  t.pass();
});

test.serial('build proposal', async t => {
  await copyAll([
    {
      src: './artifacts/src/vaultFactory/vaultFactoryV2.js',
      dest: '/usr/src/agoric-sdk/packages/inter-protocol/src/vaultFactory/vaultFactoryV2.js'
    },
    {
      src: './testAssets/manipulateAuction/manualTimerFaucet.js',
      dest: '/usr/src/agoric-sdk/packages/inter-protocol/src/manualTimerFaucet.js'
    },
    {
      src: './testAssets/manipulateAuction/liq-prep-proposal.js',
      dest: '/usr/src/agoric-sdk/packages/inter-protocol/src/proposals/liq-prep-proposal.js'
    },
    {
      src: './testAssets/manipulateAuction/liq-prep-script.js',
      dest: '/usr/src/agoric-sdk/packages/inter-protocol/scripts/liq-prep-script.js'
    },
  ], { fsp })
  const {
    evals,
    bundles
  } = await proposalBuilder('/usr/src/agoric-sdk/packages/inter-protocol/scripts/liq-prep-script.js')

  const evalsFixed = evals.map(({ script, permit }) => ({
    permit,
    script: script.replace('-permit.json', '.js')
  }));
  t.log(evalsFixed);
  config.proposal = { evals: evalsFixed, bundles };
  t.pass();
});

/**
 * - ensure enough IST
 * - install bundles
 * - submit proposal
 * - vote
 * - check incarnation numbers
 *    - 1 for auctioneer, 2 for vaultFactory
 */
test.serial('deploy incarnation 2', async t => {
  t.log(config.proposal);
  const { tmpNameP } = t.context;
  const { proposal: { evals, bundles } } = config;
  const tmpName = await tmpNameP('liq-prep');
  await fsp.mkdir(tmpName);

  const evalsCopyP = evals.flatMap(
    ({
       permit,
       script
     }) => [
      fsp.cp(permit, `${tmpName}/${extractNameFromPath(permit)}`),
      fsp.cp(script, `${tmpName}/${extractNameFromPath(script)}`)
    ]);

  const bundlesCopyP = bundles.map(
    bundlePath => fsp.cp(bundlePath, `${tmpName}/${extractNameFromPath(bundlePath)}`)
  );

  await Promise.all([
    ...evalsCopyP,
    ...bundlesCopyP,
  ])

  t.log({ tmpName });
  await evalBundles(tmpName);
  t.pass();
});
