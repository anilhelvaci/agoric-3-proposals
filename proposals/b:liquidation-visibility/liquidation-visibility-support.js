// @ts-check

// import { NonNullish } from '@agoric/synthetic-chain';
import { mintIST } from '@agoric/synthetic-chain';

/**
 * Asserts that `haystack` includes `needle` (or when `sense` is false, that it
 * does not), providing pretty output in the case of failure.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {unknown} needle
 * @param {unknown[]} haystack
 * @param {string} label
 * @param {boolean} [sense] true to assert inclusion; false for exclusion
 * @returns {void}
 */
export const testIncludes = (t, needle, haystack, label, sense = true) => {
  const matches = haystack.filter(c => Object.is(c, needle));
  t.deepEqual(matches, sense ? [needle] : [], label);
};

/**
 * @param {Record<string, string>} record - e.g. { color: 'blue' }
 * @returns {string[]} - e.g. ['--color', 'blue']
 */
export const flags = record => {
  return Object.entries(record)
    .map(([k, v]) => [`--${k}`, v])
    .flat();
};

export const loadedBundleIds = swingstore => {
  const ids = swingstore`SELECT bundleID FROM bundles`.map(r => r.bundleID);
  return ids;
};

const importBundleCost = (bytes, price = 0.002) => {
  return bytes * price;
};

/**
 * @typedef {{
 *   bundles: string[],
 *   evals: { permit: string; script: string }[],
 * }} ProposalInfo
 */

const myISTBalance = async (agd, addr, denom = 'uist', unit = 1_000_000) => {
  const coins = await agd.query(['bank', 'balances', addr]);
  const coin = coins.balances.find(a => a.denom === denom);
  return Number(coin.amount) / unit;
};

/**
 * @param {number} myIST
 * @param {number} cost
 * @param {{
 *  unit?: number, padding?: number, minInitialDebt?: number,
 *  collateralPrice: number,
 * }} opts
 * @returns
 */
const mintCalc = (myIST, cost, opts) => {
  const {
    unit = 1_000_000,
    padding = 1,
    minInitialDebt = 6,
    collateralPrice,
  } = opts;
  const { round, max } = Math;
  const wantMinted = max(round(cost - myIST + padding), minInitialDebt);
  const giveCollateral = round(wantMinted / collateralPrice) + 1;
  const sendValue = round(giveCollateral * unit);
  return { wantMinted, giveCollateral, sendValue };
};

/**
 *
 * @param {ReturnType<typeof import('../../packages/synthetic-chain/src/lib/agd-lib.js').makeAgd>} agd
 * @param {*} config
 * @param {number} bytes total bytes
 * @param {{ log: (...args: any[]) => void }} io
 * @returns
 */
export const ensureISTForInstall = async (agd, config, bytes, { log }) => {
  const cost = importBundleCost(bytes);
  log({ totalSize: bytes, cost });
  const { installer } = config;
  const addr = agd.lookup(installer);
  const istBalance = await myISTBalance(agd, addr);

  if (istBalance > cost) {
    log('balance sufficient', { istBalance, cost });
    return;
  }
  const { sendValue, wantMinted, giveCollateral } = mintCalc(
    istBalance,
    cost,
    config,
  );
  log({ wantMinted });
  await mintIST(addr, sendValue, wantMinted, giveCollateral);
};
