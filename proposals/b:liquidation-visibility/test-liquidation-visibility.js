// @ts-check

/**
 * @typedef {{
 *   bundles: string[],
 *   evals: { permit: string; script: string }[],
 * }} ProposalInfo
 */

import anyTest from 'ava';
import {
  wellKnownIdentities,
} from '@agoric/synthetic-chain/src/lib/cliHelper.js';
import {
  bundleDetail,
  ensureISTForInstall, flags, getContractInfo,
  loadedBundleIds, makeTestContext, readBundleSizes,
  testIncludes,
  txAbbr
} from './core-eval-support.js';
import { voteLatestProposalAndWait, waitForBlock } from '@agoric/synthetic-chain/src/lib/commonUpgradeHelpers.js';

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
  ...dappAPI,
};

test.before(async t => (t.context = await makeTestContext({ testConfig: staticConfig })));

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

test.serial('ensure enough IST to install bundles', async t => {
  const { agd, config, src } = t.context;
  const { totalSize, bundleSizes } = await readBundleSizes(src, staticConfig);
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

  const evalNames = buildInfo
    .map(({ evals }) => evals)
    .flat()
    .map(e => [e.permit, e.script])
    .flat();
  const evalPaths = await Promise.all(evalNames.map(evalName => {
    return src.join(evalName).toString();
  }));
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
