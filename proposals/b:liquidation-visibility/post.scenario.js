import test from "ava";
import {
  makeAuctionTimerDriver,
  makeTestContext, openVault, pushPrice,
  runAuction
} from "./core-eval-support.js";
import { getContractInfo } from "@agoric/synthetic-chain";
import { Liquiation} from "./spec.test.js";

test.before(async t => {
  t.context = await makeTestContext(
    {
      testConfig: {
        swingstorePath: '~/.agoric/data/agoric/swingstore.sqlite',
        installer: 'user1',
        oracles: [
          { address: 'gov1', acceptId: 'gov1-accept-invite'},
          { address: 'gov2', acceptId: 'gov2-accept-invite'},
        ]
      }
    }
  );
});

test.serial('open vaults', async t => {
  const { config, agops, agd } = t.context;

  const address = await agd.lookup(config.installer);

  let userVaults = await agops.vaults('list', '--from', address);
  console.log('Log: ', userVaults);

  for (const { collateral, ist } of Liquiation.setup.vaults) {
    await openVault(address, ist, collateral, "STARS");
  }

  userVaults = await agops.vaults('list', '--from', address);
  console.log('Log: ', userVaults);

  t.pass();
});

test.serial('trigger liquidation', async t => {
  const { agoric, config } = t.context;
  await pushPrice(t, Liquiation.setup.price.trigger, config.oracles.reverse());

  const { roundId } = await getContractInfo('priceFeed.STARS-USD_price_feed.latestRound', { agoric });
  t.is(roundId, 2n);
});

test('run auction', async t => {
  await runAuction(t, 'user1');
  t.pass();
});

test.only('lockPrice', async t => {
  const driver = await makeAuctionTimerDriver(t, 'user1');
  await driver.lockPrices();
  t.pass();
});