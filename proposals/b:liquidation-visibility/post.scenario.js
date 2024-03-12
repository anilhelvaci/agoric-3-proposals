import test from "ava";
import { makeTestContext, runAuction } from "./core-eval-support.js";

test.before(async t => {
  t.context = await makeTestContext({ testConfig: { swingstorePath: '~/.agoric/data/agoric/swingstore.sqlite' } });
});

test('run auction', async t => {
  await runAuction(t);
  t.pass();
});