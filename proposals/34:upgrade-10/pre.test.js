import test from 'ava';

import fsp from 'node:fs/promises';

import {
  agd,
  agops,
  agoric,
} from '@agoric/synthetic-chain/src/lib/cliHelper.js';

import { getUser } from '@agoric/synthetic-chain/src/lib/commonUpgradeHelpers.js';
import {
  GOV1ADDR,
  GOV2ADDR,
  GOV3ADDR,
  PSM_PAIR,
} from '@agoric/synthetic-chain/src/lib/constants.js';
import { openVault } from '@agoric/synthetic-chain/src/lib/econHelpers.js';

test(`Ensure there's only uist`, async t => {
  const result = await agd.query(
    'bank',
    'balances',
    'agoric1megzytg65cyrgzs6fvzxgrcqvwwl7ugpt62346',
  );

  t.is(result.balances.length, 1);
  t.is(result.balances[0].denom, 'uist');
});

test('Ensure gov1 provisioned', async t => {
  const result = await agd.query(
    'vstorage',
    'data',
    `published.wallet.${GOV1ADDR}`,
  );

  t.not(result.value.length, 0);
});

test('Ensure gov2 provisioned', async t => {
  const result = await agd.query(
    'vstorage',
    'data',
    `published.wallet.${GOV2ADDR}`,
  );

  t.not(result.value.length, 0);
});

test('Ensure gov3 provisioned', async t => {
  const result = await agd.query(
    'vstorage',
    'data',
    `published.wallet.${GOV3ADDR}`,
  );

  t.not(result.value.length, 0);
});

test('Ensure user2 not provisioned', async t => {
  try {
    await getUser('user2');
    t.fail();
  } catch (error) {
    t.pass();
  }
});

test('Ensure no vaults exist', async t => {
  const result = await agd.query(
    'vstorage',
    'data',
    `published.vaultFactory.manager0.vaults.vault0`,
  );

  t.is(result.value, '');
});

test(`Provision pool has right balance`, async t => {
  const result = await agd.query(
    'bank',
    'balances',
    'agoric1megzytg65cyrgzs6fvzxgrcqvwwl7ugpt62346',
  );

  t.is(result.balances[0].amount, '19000000');
});

test('Validate PSM denoms', async t => {
  const psmISTChildren = await agd.query(
    'vstorage',
    'children',
    'published.psm.IST',
  );

  t.not(psmISTChildren.children.legnth, 0);

  const denoms = [
    'USDC_axl',
    'DAI_axl',
    'DAI_grv',
    'USDC_grv',
    'USDT_axl',
    'USDT_grv',
  ];

  for (const denom of denoms) {
    t.truthy(psmISTChildren.children.includes(denom));
  }
});

test('PSM gov params were preserved', async t => {
  const toyUSDGovernance = await agoric.follow(
    '-lF',
    `:published.psm.${PSM_PAIR}.governance`,
  );

  const psmGovernanceData = await fsp.readFile(
    '/root/.agoric/psm_governance.json',
    'binary',
  );

  const psmGovernance = JSON.parse(psmGovernanceData);

  t.not(toyUSDGovernance.current.MintLimit.value.value, '0');
  t.is(
    toyUSDGovernance.current.MintLimit.value.value,
    psmGovernance.current.MintLimit.value.value,
  );
  t.is(toyUSDGovernance.current.GiveMintedFee.value.numerator.value, '0');
  t.is(
    toyUSDGovernance.current.GiveMintedFee.value.denominator.value,
    psmGovernance.current.GiveMintedFee.value.denominator.value,
  );
  t.is(toyUSDGovernance.current.WantMintedFee.value.numerator.value, '0');
  t.is(
    toyUSDGovernance.current.WantMintedFee.value.denominator.value,
    psmGovernance.current.WantMintedFee.value.denominator.value,
  );
});

test('PSM metric params were preserved', async t => {
  const toyUSDMetrics = await agoric.follow(
    '-lF',
    `:published.psm.${PSM_PAIR}.metrics`,
  );

  const psmMetricsData = await fsp.readFile(
    '/root/.agoric/psm_metrics.json',
    'binary',
  );

  const psmMetrics = JSON.parse(psmMetricsData);

  t.is(
    toyUSDMetrics.anchorPoolBalance.value,
    psmMetrics.anchorPoolBalance.value,
  );
  t.is(toyUSDMetrics.feePoolBalance.value, psmMetrics.feePoolBalance.value);
  t.is(
    toyUSDMetrics.mintedPoolBalance.value,
    psmMetrics.mintedPoolBalance.value,
  );
  t.is(
    toyUSDMetrics.totalMintedProvided.value,
    psmMetrics.totalMintedProvided.value,
  );
});

// upgrade-8 wrote the JSON file
test('Provision pool metrics are retained across vaults upgrade', async t => {
  const provisionPoolMetrics = await agoric.follow(
    '-lF',
    ':published.provisionPool.metrics',
  );

  const provisionPoolMetricsData = await fsp.readFile(
    '/root/.agoric/provision_pool_metrics.json',
    'utf8',
  );

  const testProvisionPoolMetrics = JSON.parse(provisionPoolMetricsData);

  t.is(
    provisionPoolMetrics.totalMintedConverted.value,
    testProvisionPoolMetrics.totalMintedConverted.value,
  );
  t.is(
    provisionPoolMetrics.totalMintedProvided.value,
    testProvisionPoolMetrics.totalMintedProvided.value,
  );
  t.is(
    provisionPoolMetrics.walletsProvisioned,
    testProvisionPoolMetrics.walletsProvisioned,
  );
});

test('Pre Vault tests', async t => {
  try {
    await openVault(GOV1ADDR, 5, 9);
    t.fail();
  } catch (error) {
    t.truthy(
      error.message.includes(
        "'Error: maxDebtFor called before a collateral quote was available'",
      ),
    );
  }
});

test('Gov1 has no vaults', async t => {
  const vaults = await agops.vaults('list', '--from', GOV1ADDR);
  t.is(vaults.length, 0);
});
