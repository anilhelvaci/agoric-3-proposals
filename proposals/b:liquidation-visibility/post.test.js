import test from 'ava';

/**
 * 1. Add new collateral manager
 * 2. Manipulate prices for the new collateral via oracles
 * 3. Open a vault
 * 4. Trigger liquidation
 */

test.serial('build-proposal', t => {
  t.log('initial');
  t.log('process', process.execArgv);
  t.pass();
});