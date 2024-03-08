import test from 'ava';
import {
  executeCommand,
  agoric,
  voteLatestProposalAndWait,
  waitForBlock,
  getContractInfo,
  loadedBundleIds,
  bundleDetail,
  ensureISTForInstall,
  testIncludes,
  flags,
  txAbbr,
} from '@agoric/synthetic-chain';
import fs from 'fs';
import {
  acceptsOracleInvitations,
  makeTestContext,
  poll,
  pushPrice,
  readBundleSizes,
} from './core-eval-support.js';

const assetInfo = {
  /** @type {Record<string, ProposalInfo>} */
  buildAssets: {
    addCollateral: {
      evals: [
        {
          permit: 'add-STARS-oracles-permit.json',
          script: 'add-STARS-oracles.js',
        },
      ],
      bundles: [
        'b1-b123ca991a7cf5c48db0466f40c2ca5502660080e222649cdcb5a2a1375aca8ae5193a06fa280936dbdc83b934e4a39e02a86977b8703dd9861cf4e936d64cc8.json',
        'b1-40b50d243f175a664f8858730a060513d29b833dc11878101cca306c933b7d04f75f30c56228eb0faee1a9a3da3f4c0b7360a24a8665b352f0cf67c0e3e93bb4.json',
      ],
    },
    addOracle: {
      evals: [{ permit: 'add-STARS-permit.json', script: 'add-STARS.js' }],
      bundles: [
        'b1-0fcad2a97764fd05a4ccbb48e94a49eccb83ffb7c90af83e13cf2c0ebe75048db05d0445ca457c41e85563eecfd1a8659466e597dde6634a589c4a74bc1cd2d4.json',
        'b1-1c596fbec796fe95faa61f2de98939f557c24f4dd71d37b2c0431eca0526bd7057d6d90420d3cb3a5f5dd16f8ea09ee6f803a25a985b707bde5b5bebe88198d0.json',
      ],
    },
  },
};

const staticConfig = {
  deposit: '10000000ubld',
  installer: 'user1',
  proposer: 'validator',
  collateralPrice: 6,
  swingstorePath: '~/.agoric/data/agoric/swingstore.sqlite',
  buildInfo: Object.values(assetInfo.buildAssets),
  initialCoins: `20000000ubld`,
  oracles: [
    { address: 'gov1', acceptId: 'gov1-accept-invite' },
    { address: 'gov2', acceptId: 'gov2-accept-invite' },
  ],
};

test.before(
  async t =>
    (t.context = await makeTestContext({
      testConfig: staticConfig,
      srcDir: 'testAssets/starsCollateralModified',
    })),
);

test.serial('build-proposal', async t => {
  fs.copyFileSync('./testAssets/starsCollateralModified/add-STARS.js', dstPath);

  await executeCommand('agoric run', [dstPath], {
    cwd: './testAssets/starsCollateralModified/',
  });

  t.pass();
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
  const { agd, swingstore, agoric, config } = t.context;
  const { chainId } = config;
  const loaded = loadedBundleIds(swingstore);
  const from = agd.lookup(config.installer);

  let todo = 0;
  let done = 0;
  for await (const { bundles } of staticConfig.buildInfo) {
    todo += bundles.length;
    for await (const bundle of bundles) {
      const { id, endoZipBase64Sha512, fileName } = bundleDetail(bundle);
      if (loaded.includes(id)) {
        t.log('bundle already installed', id);
        done += 1;
        continue;
      }

      const result = await agd.tx(
        [
          'swingset',
          'install-bundle',
          `@./testAssets/starsCollateralModified/${fileName}`,
          '--gas',
          '120000000',
        ],
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
  const { agd, swingstore, config, src } = t.context;
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
  const evalPaths = await Promise.all(
    evalNames.map(evalName => {
      return src.join(evalName).toString();
    }),
  );
  t.log(evalPaths);
  console.log('await tx', evalPaths);
  const result = await agd.tx(
    [
      'gov',
      'submit-proposal',
      'swingset-core-eval',
      ...evalPaths,
      ...flags({ ...info, deposit }),
      ...flags({ gas: '120000000', 'gas-adjustment': '1.2' }),
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
});

test.serial('STARS is added as a collateral', async t => {
  const { agoric } = t.context;

  // contract initialization took ~10min in mainnet
  await poll(
    () => getContractInfo('vaultFactory.metrics', { agoric }),
    15 * 60,
  ); // 15 mins

  const { collaterals } = await getContractInfo('vaultFactory.metrics', {
    agoric,
  });
  const name =
    collaterals[collaterals.length - 1][Symbol.toStringTag].split(' ')[0];
  t.log({ name });
  t.is('STARS', name);
});

test.serial('accept oracle invitations', async t => {
  await acceptsOracleInvitations(t, staticConfig.oracles);
  t.pass();
});

test.serial('push initial prices', async t => {
  await pushPrice(t, '12.34', staticConfig.oracles);

  const { roundId } = await getContractInfo(
    'priceFeed.STARS-USD_price_feed.latestRound',
    { agoric },
  );
  t.is(roundId, 1n);
});
