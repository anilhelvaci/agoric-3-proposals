import test from 'ava';
import {
  executeCommand,
  agoric,
  getContractInfo,
  readBundles,
  passCoreEvalProposal,
} from "@agoric/synthetic-chain";
import fs from 'fs';
import {
  acceptsOracleInvitations,
  makeTestContext,
  poll,
  pushPrice,
} from "./core-eval-support.js";

/**
 * 1. Add new collateral manager
 * 2. Manipulate prices for the new collateral via oracles
 * 3. Open a vault
 * 4. Trigger liquidation
 */

const assetInfo = {
  /** @type {Record<string, ProposalInfo>} */
  buildAssets: {
    addOracle: {
      evals: [
        { permit: 'add-STARS-oracles-permit.json', script: 'add-STARS-oracles.js' },
      ],
      bundles: [
        'b1-7de5948cddb5c8cd4ec7565e8bdb6cfa428ed35817e048f7bca9f546743b810c10844483c8c5f6ded9f0c4fa68fa27d0fb243ce6503b486edc6f6dccfb86974c.json',
        'b1-f8d93fe2fd201b55d06eee58888b4a7d857fa4972bd9d62166498d30799b325b74dbaff8134d3b80c9f9198c8078ec3a22d0e41946371bdd39b532c1a47568ec.json'
      ],
    },
    addAsset: {
      evals: [
        { permit: 'add-STARS-asset-permit.json', script: 'add-STARS-asset.js' },
      ],
      bundles: [
        'b1-7b19e4d6f6b67050a3b8a7b2ddda55231b0309b44556740ced6a89f6a2135b27920ea19c257258ca585aba8c5d71c38aa4527992b23df2c58456f29a0de274ac.json',
        'b1-ec50836896d227c58f516d455fe8711425da908d14bb763cf98a18a9ac6757acd9b4fca73e8a0b2771959beaabc46945adee197a92d4e79ad9f31749d3f4d498.json'
      ],
    },
    addCollateral: {
      evals: [
        { permit: 'add-STARS-prop-permit.json', script: 'add-STARS-prop.js' },
      ],
      bundles: [
        'b1-7b19e4d6f6b67050a3b8a7b2ddda55231b0309b44556740ced6a89f6a2135b27920ea19c257258ca585aba8c5d71c38aa4527992b23df2c58456f29a0de274ac.json',
        'b1-ec50836896d227c58f516d455fe8711425da908d14bb763cf98a18a9ac6757acd9b4fca73e8a0b2771959beaabc46945adee197a92d4e79ad9f31749d3f4d498.json'
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
  buildAddAssetInfo: Object.values({ ...assetInfo.buildAssets.addOracle, ...assetInfo.buildAssets.addAsset }),
  buildAddCollateralInfo: [assetInfo.buildAssets.addCollateral],
  initialCoins: `20000000ubld`,
  oracles: [
    { address: 'gov1', acceptId: 'gov1-accept-invite'},
    { address: 'gov2', acceptId: 'gov2-accept-invite'},
  ]
};

test.before(async t => (t.context = await makeTestContext({
  testConfig: staticConfig
})));

/**
 * Remove 'skip' to generate the assets that adds a new collateral to vault factory.
 * TODO: Add a read me on how to build the proposal
 */
test.serial.skip('build-proposal', async t => {
  const dstPath = '/usr/src/agoric-sdk/packages/inter-protocol/scripts/add-STARS.js';
  if (!fs.existsSync(dstPath)) {
    fs.copyFileSync('./testAssets/starsCollateral/add-STARS.js', dstPath);
  }

  await executeCommand('agoric run', [dstPath], { cwd: './testAssets/starsCollateral/'});

  t.pass();
});

test.serial('add STARS asset', async t => {
  const propDir = '/usr/src/a3p/proposals/b:liquidation-visibility/testAssets/addStarsAsset';
  const bundleInfos = await readBundles(propDir);
  await passCoreEvalProposal(
    bundleInfos,
    { title: `Core eval of ${propDir}`, installer: 'user1'}
  );
  t.log(bundleInfos);
  t.pass();
});

test.serial('add STARS collateral', async t => {
  const propDir = '/usr/src/a3p/proposals/b:liquidation-visibility/testAssets/addStarsCollateral';
  const bundleInfos = await readBundles(propDir);
  await passCoreEvalProposal(
    bundleInfos,
    { title: `Core eval of ${propDir}`, installer: 'user1'}
  );
  t.log(bundleInfos);
  t.pass();
});

test.serial('STARS is added as a collateral', async t => {
  const { agoric } = t.context;

  // contract initialization took ~10min in mainnet
  await poll(() => getContractInfo('vaultFactory.metrics', { agoric }), 15 * 60); // 15 mins

  const { collaterals } = await getContractInfo('vaultFactory.metrics', { agoric });
  const name = collaterals[collaterals.length - 1][Symbol.toStringTag].split(' ')[0];
  t.log({ name });
  t.is('STARS', name);
});

test.serial('accept oracle invitations', async t => {
  await acceptsOracleInvitations(t, staticConfig.oracles);
  t.pass();
});

test.serial('push initial prices', async t => {
  await pushPrice(t, '12.34', staticConfig.oracles);

  const { roundId } = await getContractInfo('priceFeed.STARS-USD_price_feed.latestRound', { agoric });
  t.is(roundId, 1n);
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