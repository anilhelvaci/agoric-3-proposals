// @ts-check

/**
 * @typedef {{
 *   bundles: string[],
 *   evals: { permit: string; script: string }[],
 * }} ProposalInfo
 */

import anyTest from 'ava';
import {
  makeTestContext,
} from './core-eval-support.js';
import {
  mintIST,
  readBundles,
  passCoreEvalProposal,
} from '@agoric/synthetic-chain';

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
        'b1-ccaf7d7db13a60ab9bcdc085240a4be8ee590486a763fb2e94dbc042000af7d5fdeb54edb8bc26febde291c2f777f8c39c47bbbad2b90bcc9da570b09cafec54.json'
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

test.before(async t => (t.context = await makeTestContext({ testConfig: staticConfig, srcDir: 'assets' })));

test.serial('fund user1 before the upgrade', async t => {
  const { agd } = t.context;
  const addr = agd.lookup(staticConfig.installer);
  const unit = 1_000_000;
  const giveValue = 10_000_000;
  const sendValue = giveValue * unit;
  const wantMinted = 1_000_000;
  await mintIST(addr, sendValue, wantMinted, giveValue);
  t.pass();
});

test.serial('test', async t => {

  const dir = '/usr/src/a3p/proposals/b:liquidation-visibility/assets';
  const bundleInfos = await readBundles('/usr/src/a3p/proposals/b:liquidation-visibility/assets');

  await passCoreEvalProposal(bundleInfos, { title: `Core eval of ${dir}`, ...staticConfig });
  t.pass();
});