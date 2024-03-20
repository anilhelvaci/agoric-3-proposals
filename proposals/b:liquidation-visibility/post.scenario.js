import test from "ava";
import {
  assertVisibility,
  bidByDiscount,
  bidByPrice,
  makeAuctionTimerDriver,
  makeTestContext, openVault, pushPrice,
} from "./core-eval-support.js";
import { getContractInfo } from "@agoric/synthetic-chain";
import { Liquidation} from "./spec.test.js";

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

  for (const { collateral, ist } of Liquidation.setup.vaults) {
    await openVault(address, ist, collateral, "STARS");
  }

  userVaults = await agops.vaults('list', '--from', address);
  console.log('Log: ', userVaults);

  t.pass();
});

test.serial('place bid', async t => {
  const { agd } = t.context;
  const user1Addr = agd.lookup('user1');
  const colKeyword = 'STARS';

  for (const bid of Liquidation.setup.bids) {
    if (bid.price) {
      await bidByPrice(user1Addr, bid.give, colKeyword, bid.price);
    } else if(bid.discount) {
      await bidByDiscount(user1Addr, bid.give, colKeyword, bid.discount);
    }
  }
  t.pass();
});

test.serial('trigger liquidation', async t => {
  const { agoric, config, agd } = t.context;
  const { roundId: roundIdBefore, startedBy } = await getContractInfo('priceFeed.STARS-USD_price_feed.latestRound', { agoric });
  const gov1Addr = agd.lookup('gov1');

  const oraclesConfig = startedBy === gov1Addr ? config.oracles.reverse() : config.oracles;

  await pushPrice(t, Liquidation.setup.price.trigger, oraclesConfig);

  const { roundId: roundIdAfter } = await getContractInfo('priceFeed.STARS-USD_price_feed.latestRound', { agoric });

  t.is(roundIdAfter, roundIdBefore + 1n);
});

test.serial('start auction', async t => {
  const { startAuction } = await makeAuctionTimerDriver(t, 'user1');
  await startAuction();
  t.pass();
});

test.serial('make sure all bids are settled', async t => {
  const { advanceAuctionStep } = await makeAuctionTimerDriver(t, 'user1');
  // We expect all bids to settle after 5 clock steps
  for (let i = 0; i < 5; i++) {
    await advanceAuctionStep();
  }
  t.pass();
});

test.serial('assert visibility', async t => {
  await assertVisibility(t, 2);
});