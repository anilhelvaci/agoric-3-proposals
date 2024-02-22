// @ts-check

/**
 * @typedef {{
 *   bundles: string[],
 *   evals: { permit: string; script: string }[],
 * }} ProposalInfo
 */

import anyTest from 'ava';
import dbOpenAmbient from 'better-sqlite3';
import * as cpAmbient from 'child_process';
import * as fspAmbient from 'fs/promises';
import * as pathAmbient from 'path';
import * as processAmbient from 'process';
import { tmpName as tmpNameAmbient } from 'tmp';

import { makeAgd } from '@agoric/synthetic-chain/src/lib/agd-lib.js';
import {
  agoric,
  wellKnownIdentities,
} from '@agoric/synthetic-chain/src/lib/cliHelper.js';
import { dbTool } from '@agoric/synthetic-chain/src/lib/vat-status.js';
import {
  makeFileRd,
  makeFileRW,
} from '@agoric/synthetic-chain/src/lib/webAsset.js';
import {
  bundleDetail,
  ensureISTForInstall, flags, getContractInfo,
  loadedBundleIds,
  testIncludes,
  txAbbr
} from './core-eval-support.js';
import { voteLatestProposalAndWait, waitForBlock } from '@agoric/synthetic-chain/src/lib/commonUpgradeHelpers.js';
import { NonNullish } from '@agoric/synthetic-chain/src/lib/assert.js';

/** @typedef {Awaited<ReturnType<typeof makeTestContext>>} TestContext */
/** @type {import('ava').TestFn<TestContext>}} */
const test = anyTest;

const assetInfo = {
  /** @type {Record<string, ProposalInfo>} */
  buildAssets: {
    coreEvalInfo: {
      evals: [
        { permit: 'upgrade-vaults-liq-visibility-permit.json', script: 'upgrade-vaults-liq-visibility.js' },
      ],
      bundles: [
        'b1-7a5b067832fe1e968aca362ad713126737c3f0289dba7b527e0d23648b9419395c16399eed9358d5c555d29d2724561c12902dc2c960eca1bc4f0deee373a5c8.json',
        'b1-6874b3846d9b293af2e687b168ac825dc19e027f949b10e9c766507db604246c90866428581b94e068779f4dabbf6dd9da5b4161e483a50c6525c8a53edc3025.json'
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
  accounts: {
    mem1: {
      impersonate: 'agoric1ag5a8lhn00h4u9h2shpfpjpaq6v4kku54zk69m',
      address: 'agoric1s32tu4wtkqc5440p0uf0hk508nerfmunr65vtl',
      mnemonic:
        'rival find chest wall myself guess fat hint frozen shed cake theme harbor physical bleak tube large desk cream increase scrap virus top bulb',
    },
    mem2: {
      impersonate: 'agoric140y0mqnq7ng5vvxxwpfe67988e5vqar9whg309',
      address: 'agoric1xdu48rxgakk5us7m3wud04pf92kzjmhwllzdef',
      mnemonic:
        'orient tag produce jar expect travel consider zero flight pause rebuild rent blanket yellow siege ivory hidden loop unlock dream priority prevent horn load',
    },
    mem3: {
      impersonate: 'agoric1wqfu6hu5q2qtey9jtjapaae4df9zd492z4448k',
      address: 'agoric1hmdue96vs0p6zj42aa26x6zrqlythpxnvgsgpr',
      mnemonic:
        'seven regular giggle castle universe find secret like inquiry round write pumpkin risk exhaust dress grab host message carbon student put kind gold treat',
    },
  },
  ...dappAPI,
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

    for await (const bundle of bundles) {
      const detail = bundleDetail(bundle);
      console.log({ detail });
      const { id } = detail;
      testIncludes(t, id, loaded, 'loaded bundles', false);
    }
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
      const { id, endoZipBase64Sha512, fileName } = bundleDetail(
        bundle
      );
      if (loaded.includes(id)) {
        t.log('bundle already installed', id);
        done += 1;
        continue;
      }

      const result = await agd.tx(
        ['swingset', 'install-bundle', `@./assets/${fileName}`, '--gas', '120000000'],
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

/**
 * @param {string} text
 * @param {string} fileName
 */
const acctSub = (text, fileName) => {
  let out = text;
  for (const [name, detail] of Object.entries(staticConfig.accounts)) {
    if (out.includes(detail.impersonate)) {
      console.log('impersonating', name, 'in', fileName);
      out = out.replace(detail.impersonate, detail.address);
    }
  }
  return out;
};

test.serial('core eval proposal passes', async t => {
  const { agd, swingstore, config, mkTempRW, src } = t.context;
  const from = agd.lookup(config.proposer);
  const { chainId, deposit, instance } = config;
  const info = { title: instance, description: `start ${instance}` };
  t.log('submit proposal', instance);

  // double-check that bundles are loaded
  const loaded = loadedBundleIds(swingstore);
  const { buildInfo } = staticConfig;
  for (const { bundles } of buildInfo) {
    for (const bundle of bundles) {
      const { id } = bundleDetail(bundle);
      testIncludes(t, id, loaded, 'loaded bundles');
    }
  }

  /** @param {string} script */
  const withKnownKeys = async script => {
    const file = src.join(script);
    const text = await file.readText();
    const text2 = acctSub(text, script);
    const out = await mkTempRW(script);
    await out.writeText(text2);
    return out.toString();
  };

  const evalNames = buildInfo
    .map(({ evals }) => evals)
    .flat()
    .map(e => [e.permit, e.script])
    .flat();
  const evalPaths = await Promise.all(evalNames.map(withKnownKeys));
  t.log(evalPaths);
  console.log('await tx', evalPaths);
  const result = await agd.tx(
    [
      'gov',
      'submit-proposal',
      'swingset-core-eval',
      ...evalPaths,
      ...flags({ ...info, deposit }),
      ...flags({ gas: 'auto', 'gas-adjustment': '1.2' }),
    ],
    { from, chainId, yes: true },
  );
  console.log('RESULT', { result });
  t.log(txAbbr(result));
  t.is(result.code, 0);

  console.log('await voteLatestProposalAndWait', evalPaths);
  const detail = await voteLatestProposalAndWait();
  t.log(detail.proposal_id, detail.voting_end_time, detail.status);

  // XXX https://github.com/Agoric/agoric-3-proposals/issues/91
  await waitForBlock(15);

  t.is(detail.status, 'PROPOSAL_STATUS_PASSED');
})
