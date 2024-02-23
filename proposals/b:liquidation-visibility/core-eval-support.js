// @ts-check
import {
  Far,
  makeMarshal,
  makeTranslationTable,
} from '@agoric/synthetic-chain/src/lib/unmarshal.js';
import { Fail, NonNullish } from '@agoric/synthetic-chain/src/lib/assert.js';

// TODO: factor out ambient authority from these
// or at least allow caller to supply authority.
import { mintIST } from '@agoric/synthetic-chain/src/lib/econHelpers.js';
import { agoric } from '@agoric/synthetic-chain/src/lib/cliHelper.js';
import processAmbient from "process";
import cpAmbient from "child_process";
import dbOpenAmbient from "better-sqlite3";
import fspAmbient from "fs/promises";
import pathAmbient from "path";
import { tmpName as tmpNameAmbient } from "tmp";
import { makeFileRd, makeFileRW } from "@agoric/synthetic-chain/src/lib/webAsset.js";
import { makeAgd } from "@agoric/synthetic-chain/src/lib/agd-lib.js";
import { dbTool } from "@agoric/synthetic-chain/src/lib/vat-status.js";
import { waitForBlock } from "@agoric/synthetic-chain/src/lib/commonUpgradeHelpers.js";

export const makeTestContext = async ({ io = {}, testConfig, srcDir = 'assets' }) => {
  const {
    process: { env, cwd } = processAmbient,
    child_process: { execFileSync } = cpAmbient,
    dbOpen = dbOpenAmbient,
    fsp = fspAmbient,
    path = pathAmbient,
    tmpName = tmpNameAmbient,
  } = io;

  const src = makeFileRd(`${cwd()}/${srcDir}`, { fsp, path });
  const tmpNameP = prefix =>
    new Promise((resolve, reject) =>
      tmpName({ prefix }, (err, x) => (err ? reject(err) : resolve(x))),
    );

  const config = {
    chainId: 'agoriclocal',
    ...testConfig,
  };

  // This agd API is based on experience "productizing"
  // the inter bid CLI in #7939
  const agd = makeAgd({ execFileSync: execFileSync }).withOpts({
    keyringBackend: 'test',
  });

  const dbPath = testConfig.swingstorePath.replace(/^~/, env.HOME);
  const swingstore = dbTool(dbOpen(dbPath, { readonly: true }));

  /* @param {string} baseName */
  const mkTempRW = async baseName =>
    makeFileRW(await tmpNameP(baseName), { fsp, path });
  return { agd, agoric, swingstore, config, mkTempRW, src };
};

// move to unmarshal.js?
export const makeBoardUnmarshal = () => {
  const synthesizeRemotable = (_slot, iface) =>
    Far(iface.replace(/^Alleged: /, ''), {});

  const { convertValToSlot, convertSlotToVal } = makeTranslationTable(
    slot => Fail`unknown id: ${slot}`,
    synthesizeRemotable,
  );

  return makeMarshal(convertValToSlot, convertSlotToVal);
};

export const getContractInfo = async (path, io = {}) => {
  const m = makeBoardUnmarshal();
  const {
    agoric: { follow = agoric.follow },
    prefix = 'published.',
  } = io;
  console.log('@@TODO: prevent agoric follow hang', prefix, path);
  const txt = await follow('-lF', `:${prefix}${path}`, '-o', 'text');
  const { body, slots } = JSON.parse(txt);
  return m.fromCapData({ body, slots });
};

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

export const txAbbr = tx => {
  const { txhash, code, height, gas_used } = tx;
  return { txhash, code, height, gas_used };
};

export const loadedBundleIds = swingstore => {
  const ids = swingstore`SELECT bundleID FROM bundles`.map(r => r.bundleID);
  return ids;
};

/**
 * @param {string} cacheFn - e.g. /home/me.agoric/cache/b1-DEADBEEF.json
 */
export const bundleDetail = cacheFn => {
  const fileName = NonNullish(cacheFn.split('/').at(-1));
  const id = fileName.replace(/\.json$/, '');
  const hash = id.replace(/^b1-/, '');
  return { fileName, endoZipBase64Sha512: hash, id };
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
 * @param {ReturnType<typeof import('../lib/agd-lib.js').makeAgd>} agd
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

/** @param {number[]} xs */
export const sum = xs => xs.reduce((a, b) => a + b, 0);

export const getFileSize = async (src, fileName) => {
  const file = src.join(fileName);
  const { size } = await file.stat();
  return size;
};

/** @param {import('./lib/webAsset.js').FileRd} src
 * @param config
 */
export const readBundleSizes = async (src, config) => {
  const info = config.buildInfo;
  const bundleSizes = await Promise.all(
    info
      .map(({ bundles }) =>
        bundles.map(bundleName => getFileSize(src, bundleName)),
      )
      .flat(),
  );
  const totalSize = sum(bundleSizes);
  return { bundleSizes, totalSize };
};

export const poll = async (check, maxTries) => {
  for (let tries = 0; tries < maxTries; tries += 1) {
    const ok = await check();
    if (ok) return;
    await waitForBlock();
  }
  throw Error(`tried ${maxTries} times without success`);
};