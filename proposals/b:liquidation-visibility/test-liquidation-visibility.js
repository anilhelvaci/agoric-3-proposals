// @ts-check

/**
 * @typedef {{
 *   bundles: string[],
 *   evals: { permit: string; script: string }[],
 * }} ProposalInfo
 */

import anyTest from 'ava';
import * as cpAmbient from 'child_process';
import * as fspAmbient from 'fs/promises';
import * as pathAmbient from 'path';
import * as processAmbient from 'process';
import { tmpName as tmpNameAmbient } from 'tmp';
import dbOpenAmbient from 'better-sqlite3';

import { makeAgd } from '@agoric/synthetic-chain/src/lib/agd-lib.js';
import { dbTool } from '@agoric/synthetic-chain/src/lib/vat-status.js';
import {
  makeFileRd,
  makeFileRW,
} from '@agoric/synthetic-chain/src/lib/webAsset.js';
import {
  agoric,
  wellKnownIdentities,
} from '@agoric/synthetic-chain/src/lib/cliHelper.js';
import {
  provisionSmartWallet,
  voteLatestProposalAndWait,
  waitForBlock,
} from '@agoric/synthetic-chain/src/lib/commonUpgradeHelpers.js';
import {
  ensureISTForInstall,
  flags,
  getContractInfo,
  loadedBundleIds,
  testIncludes,
  txAbbr,
} from './core-eval-support.js';
import { ZipReader } from '@endo/zip';

/** @typedef {Awaited<ReturnType<typeof makeTestContext>>} TestContext */
/** @type {import('ava').TestFn<TestContext>}} */
const test = anyTest;

const assetInfo = {
  /** @type {Record<string, ProposalInfo>} */
  buildAssets: {
    coreEvalInfo: {
      evals: [
        { permit: 'vaultFactory-permit.json', script: 'vaultFactory.js' },
      ],
      bundles: [
        'b1-5302546fafc63a2ef36142fb50c2333eb5e6775f6eebb725d1e3ce83aad7b27b3341992d9d83488383bfd19784b241fccc29a8cb9eeb9ebf33059b3976ff9b22.json',
      ],
    },
  },
};

const dappAPI = {
  instance: 'vaultFactory', // agoricNames.instance key
  vstorageNode: 'vaultFactory',
};

const staticConfig = {
  deposit: '10000000ubld',
  installer: 'user1',
  proposer: 'validator',
  collateralPrice: 6,
  swingstorePath: '~/.agoric/data/agoric/swingstore.sqlite',
  buildInfo: Object.values(assetInfo.buildAssets),
  initialCoins: `20000000ubld`,
  ...dappAPI,
};

const bundleDetail = async (src, bundleName) => {
  const file = src.join(bundleName);
  const [content, absPath] = await Promise.all([
    file.readText(),
    file.toString(),
  ]);
  const { endoZipBase64Sha512 } = JSON.parse(content);
  return {
    id: `b1-${endoZipBase64Sha512}`,
    fileName: bundleName,
    endoZipBase64Sha512,
    absPath,
  };
};

/**
 * Provide access to the outside world via t.context.
 * @param {Object} io
 */
const makeTestContext = async (io = {}) => {
  const {
    process: { env, cwd } = processAmbient,
    child_process: { execFileSync } = cpAmbient,
    dbOpen = dbOpenAmbient,
    fsp = fspAmbient,
    path = pathAmbient,
    tmpName = tmpNameAmbient,
  } = io;

  const src = makeFileRd(`${cwd()}/assets`, { fsp, path });
  const tmpNameP = prefix =>
    new Promise((resolve, reject) =>
      tmpName({ prefix }, (err, x) => (err ? reject(err) : resolve(x))),
    );

  const config = {
    chainId: 'agoriclocal',
    ...staticConfig,
  };

  // This agd API is based on experience "productizing"
  // the inter bid CLI in #7939
  const agd = makeAgd({ execFileSync: execFileSync }).withOpts({
    keyringBackend: 'test',
  });

  const dbPath = staticConfig.swingstorePath.replace(/^~/, env.HOME);
  const swingstore = dbTool(dbOpen(dbPath, { readonly: true }));

  /* @param {string} baseName */
  const mkTempRW = async baseName =>
    makeFileRW(await tmpNameP(baseName), { fsp, path });
  return { agd, agoric, swingstore, config, mkTempRW, src };
};

test.before(async t => (t.context = await makeTestContext()));

test.serial(`pre-flight: not in agoricNames.instance`, async t => {
  const { config, agoric } = t.context;
  const { instance: target } = config;
  console.log({ config, agoric });
  const { instance } = await wellKnownIdentities({ agoric });
  testIncludes(t, target, Object.keys(instance), 'instance keys', false);
});

test.serial('bundles not yet installed', async t => {
  const { swingstore, src } = t.context;
  const loaded = loadedBundleIds(swingstore);
  const info = staticConfig.buildInfo;

  for await (const { bundles, evals } of info) {
    t.log(evals[0].script, evals.length, 'eval', bundles.length, 'bundles');

    const detail = await bundleDetail(src, bundles[0]);
    console.log({ detail });
    const { id } = detail;
    testIncludes(t, id, loaded, 'loaded bundles', false);
  }
});

/** @param {number[]} xs */
const sum = xs => xs.reduce((a, b) => a + b, 0);

const getFileSize = async (src, fileName) => {
  const file = src.join(fileName);
  const { size } = await file.stat();
  return size;
};

/** @param {import('./lib/webAsset.js').FileRd} src */
const readBundleSizes = async src => {
  const info = staticConfig.buildInfo;
  const bundleSizes = await Promise.all(
    info
      .map(({ bundles }) =>
        bundles.map(bundleName => getFileSize(src, bundleName)),
      )
      .flat(),
  );
  const totalSize = sum(bundleSizes);
  return { bundleSizes, totalSize };
};

const minute = 60 / 1; // block time is ~1sec

test.serial('ensure enough IST to install bundles', async t => {
  const { agd, config, src } = t.context;
  const { totalSize, bundleSizes } = await readBundleSizes(src);
  console.log({ totalSize, bundleSizes });
  await ensureISTForInstall(agd, config, totalSize, {
    log: t.log,
  });
  t.pass();
});

test.serial('ensure bundles installed', async t => {
  const { agd, swingstore, agoric, config, io, src } = t.context;
  const { chainId } = config;
  const loaded = loadedBundleIds(swingstore);
  const from = agd.lookup(config.installer);

  let todo = 0;
  let done = 0;
  for await (const { bundles } of staticConfig.buildInfo) {
    todo += bundles.length;
    for await (const bundle of bundles) {
      const { id, endoZipBase64Sha512, absPath } = await bundleDetail(
        src,
        bundle,
      );
      if (loaded.includes(id)) {
        t.log('bundle already installed', id);
        done += 1;
        continue;
      }

      const result = await agd.tx(
        ['swingset', 'install-bundle', `@${absPath}`, '--gas', 'auto'],
        { from, chainId, yes: true },
      );
      t.log(txAbbr(result));
      t.is(result.code, 0);

      const info = await getContractInfo('bundles', { agoric, prefix: '' });
      t.log(info);
      done += 1;
      t.deepEqual(info, {
        endoZipBase64Sha512,
        error: null,
        installed: true,
      });
    }
  }
  t.is(todo, done);
});
