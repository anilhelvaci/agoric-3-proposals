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
  agd,
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
        'b1-7de5948cddb5c8cd4ec7565e8bdb6cfa428ed35817e048f7bca9f546743b810c10844483c8c5f6ded9f0c4fa68fa27d0fb243ce6503b486edc6f6dccfb86974c.json',
        'b1-f8d93fe2fd201b55d06eee58888b4a7d857fa4972bd9d62166498d30799b325b74dbaff8134d3b80c9f9198c8078ec3a22d0e41946371bdd39b532c1a47568ec.json',
      ],
    },
    addOracle: {
      evals: [
        { permit: 'add-STARS-prop-permit.json', script: 'add-STARS-prop.js' },
      ],
      bundles: [
        'b1-ec50836896d227c58f516d455fe8711425da908d14bb763cf98a18a9ac6757acd9b4fca73e8a0b2771959beaabc46945adee197a92d4e79ad9f31749d3f4d498.json',
        'b1-6024621ece2194b4384ef363e54fa5e6025f96ac10f7edfd5850a0a33158f5dab86f0b402c7a4d429afb9b64370642d505d7965993f50c3a561958aba488d2f8.json',
      ],
    },
  },
  /** @type {Record<string, ProposalInfo>} */
  provisionWallet: {
    stars: {
      evals: [
        { permit: 'provisionSTARS-permit.json', script: 'provisionSTARS.js' },
      ],
      bundles: [
        'b1-a611fe191d453e1d501327ac178fb0b6cbbaf048f24de802fff4ea4defa232e07c0488c656c535bdf06ab8f1f0dfdaecc1ce3121341860b545f92a97c8d9c312.json',
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
  provisionInfo: Object.values(assetInfo.provisionWallet),
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
      srcDir: 'testAssets/starsCollateral/proposals',
    })),
);

/**
 * Remove 'skip' to generate the assets that adds a new collateral to vault factory.
 */
test.serial('build proposal for STARS collateral', async t => {
  const addStarsPath =
    '/usr/src/agoric-sdk/packages/inter-protocol/scripts/add-STARS.js';
  if (!fs.existsSync(addStarsPath)) {
    fs.copyFileSync(
      './testAssets/starsCollateral/scripts/add-STARS.js',
      addStarsPath,
    );
  }

  const addCollateralCorePath =
    '/usr/src/agoric-sdk/packages/inter-protocol/scripts/add-collateral-core-mod.js';
  if (!fs.existsSync(addCollateralCorePath)) {
    fs.copyFileSync(
      './testAssets/starsCollateral/scripts/add-collateral-core-mod.js',
      addCollateralCorePath,
    );
  }

  const addAssetToVaultPath =
    '/usr/src/agoric-sdk/packages/inter-protocol/scripts/addAssetToVault-mod.js';
  if (!fs.existsSync(addAssetToVaultPath)) {
    fs.copyFileSync(
      './testAssets/starsCollateral/scripts/addAssetToVault-mod.js',
      addAssetToVaultPath,
    );
  }

  await executeCommand('agoric run', [addStarsPath], {
    cwd: './testAssets/starsCollateral/proposals',
  });

  //ToDo: copy bundles from /root/.agoric/cache/ to /testAssets/starsCollateral/proposals
  // > cp /root/.agoric/cache/* /usr/src/a3p/proposals/b:liquidation-visibility/testAssets/starsCollateral/proposals/

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

test.serial('ensure enough IST to install collateral bundles', async t => {
  const { agd, config, src } = t.context;
  const { totalSize, bundleSizes } = await readBundleSizes(
    src,
    staticConfig.buildInfo,
  );
  console.log({ totalSize, bundleSizes });
  await ensureISTForInstall(agd, config, totalSize, {
    log: t.log,
  });
  t.pass();
});

test.serial('ensure STARS collateral bundles installed', async t => {
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
          `@./testAssets/starsCollateral/proposals/${fileName}`,
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

test.serial('core eval proposal for STARS collateral passes', async t => {
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

test.serial('build proposal for STARS provision', async t => {
  const provisionStarsPath =
    '/usr/src/agoric-sdk/packages/inter-protocol/scripts/provision-Stars.js';
  if (!fs.existsSync(provisionStarsPath)) {
    fs.copyFileSync(
      './testAssets/starsCollateral/scripts/provision-Stars.js',
      provisionStarsPath,
    );
  }

  const provisionStarsManifestPath =
    '/usr/src/agoric-sdk/packages/inter-protocol/scripts/provision-stars-manifest.js';
  if (!fs.existsSync(provisionStarsManifestPath)) {
    fs.copyFileSync(
      './testAssets/starsCollateral/scripts/provision-stars-manifest.js',
      provisionStarsManifestPath,
    );
  }

  await executeCommand('agoric run', [provisionStarsPath], {
    cwd: './testAssets/starsCollateral/proposals',
  });

  //ToDo: copy bundles from /root/.agoric/cache/ to /testAssets/starsCollateral/proposals
  // cp /root/.agoric/cache/b1-a611fe191d453e1d501327ac178fb0b6cbbaf048f24de802fff4ea4defa232e07c0488c656c535bdf06ab8f1f0dfdaecc1ce3121341860b545f92a97c8d9c312.json /usr/src/a3p/proposals/b:liquidation-visibility/testAssets/starsCollateral/proposals/

  t.pass();
});

test.serial('ensure enough IST to install provision bundles', async t => {
  const { agd, config, src } = t.context;
  const { totalSize, bundleSizes } = await readBundleSizes(
    src,
    staticConfig.provisionInfo,
  );
  console.log({ totalSize, bundleSizes });
  await ensureISTForInstall(agd, config, totalSize, {
    log: t.log,
  });
  t.pass();
});

test.serial('ensure STARS provision bundles installed', async t => {
  const { agd, swingstore, agoric, config } = t.context;
  const { chainId } = config;
  const loaded = loadedBundleIds(swingstore);
  const from = agd.lookup(config.installer);

  let todo = 0;
  let done = 0;
  for await (const { bundles } of staticConfig.provisionInfo) {
    todo += bundles.length;
    for await (const bundle of bundles) {
      const { id, endoZipBase64Sha512, fileName } = bundleDetail(bundle);
      if (loaded.includes(id)) {
        t.log('bundle already installed', id);
        done += 1;
        continue;
      }

      console.log('Log: ', fileName);

      const result = await agd.tx(
        [
          'swingset',
          'install-bundle',
          `@./testAssets/starsCollateral/proposals/${fileName}`,
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

test.serial('core eval proposal for STARS provision passes', async t => {
  const { agd, swingstore, config, src } = t.context;
  const from = agd.lookup(config.proposer);
  const { chainId, deposit, instance } = config;
  const info = { title: instance, description: `start ${instance}` };
  t.log('submit proposal', instance);

  // double-check that bundles are loaded
  const loaded = loadedBundleIds(swingstore);
  const { provisionInfo } = staticConfig;
  for (const { bundles } of provisionInfo) {
    for (const bundle of bundles) {
      const { id } = bundleDetail(bundle);
      testIncludes(t, id, loaded, 'loaded bundles');
    }
  }

  const evalNames = provisionInfo
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

test.serial('ensure user1 is provisioned with STARS', async t => {
  const { config } = t.context;

  const address = await agd.keys(
    'show',
    config.installer,
    '-a',
    '--keyring-backend=test',
  );
  const balances = (await agd.query('bank', 'balances', `${address}`)).balances;
  t.log('Log: from', balances);

  for (const balance of balances) {
    if (
      balance.denom ===
      'ibc/987C17B11ABC2B20019178ACE62929FE9840202CE79498E29FE8E5CB02B7C0A4'
    ) {
      t.is(balance.amount, '1000000000000000000000');
    }
  }
});

test.todo('open vaults');
test.todo('trigger liquidation');
test.todo('run liquidation');
test.todo('check visibility'); // How long the auction is going to take?
test.skip('vstorage check', async t => {
  const { agoric } = t.context;
  const data = await getContractInfo('auction.governance', { agoric });
  t.log(data.current.ClockStep);
  t.pass();
});
