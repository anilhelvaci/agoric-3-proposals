// @ts-check
// TODO: factor out ambient authority from these
// or at least allow caller to supply authority.
import '@endo/init';
import {
  agoric,
  makeFileRd,
  makeFileRW,
  makeAgd,
  dbTool,
  waitForBlock,
  agops, agd, getContractInfo,
} from '@agoric/synthetic-chain';
import {
  boardValToSlot,
  slotToBoardRemote
} from "@agoric/vats/tools/board-utils.js";
import { makeMarshal } from "@endo/marshal";
import processAmbient from "process";
import cpAmbient from "child_process";
import dbOpenAmbient from "better-sqlite3";
import fspAmbient from "fs/promises";
import pathAmbient from "path";
import { tmpName as tmpNameAmbient } from "tmp";

const AdvanceTimeOfferSpec = ({ id, timestamp }) => ({
  id,
  invitationSpec: {
    source: "agoricContract",
    instancePath: ['manualTimerInstance'],
    callPipe: [["makeAdvanceTimeInvitation"]],
  },
  proposal: {},
  offerArgs: { timestamp },
});

export const makeTestContext = async ({ io = {}, testConfig, srcDir }) => {
  const {
    process: { env, cwd } = processAmbient,
    child_process: { execFileSync } = cpAmbient,
    dbOpen = dbOpenAmbient,
    fsp = fspAmbient,
    path = pathAmbient,
    tmpName = tmpNameAmbient,
  } = io;

  const src = srcDir ? makeFileRd(`${cwd()}/${srcDir}`, { fsp, path }) : {};
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
  return { agd, agoric, agops, swingstore, config, mkTempRW, src };
};

/** @param {number[]} xs */
export const sum = xs => xs.reduce((a, b) => a + b, 0);

/**
 *
 * @param {import('@agoric/synthetic-chain').FileRW} src
 * @param {string} fileName
 * @return {Promise<number>}
 */
export const getFileSize = async (src, fileName) => {
  const file = src.join(fileName);
  const { size } = await file.stat();
  return size;
};

export const poll = async (check, maxTries) => {
  for (let tries = 0; tries < maxTries; tries += 1) {
    const ok = await check();
    if (ok) return;
    await waitForBlock();
  }
  throw Error(`tried ${maxTries} times without success`);
};

/**
 * @typedef AgopsOfferParams
 * @property t
 * @property {string[]} agopsParams
 * @property {string[]} txParams Without --offer flag
 * @property {string} from
 * @property {import('@agoric/synthetic-chain').FileRW} src
 *
 * @param {AgopsOfferParams}
 */
export const agopsOffer = async ({
  t,
  agopsParams,
  txParams,
  from,
  src,
}) => {
  const { agops, agoric } = t.context;

  await src.mkdir(from);
  const fileRW = await src.join(from);

  try {
    const test = await agops.oracle(...agopsParams);
    await fileRW.writeText(test);
    t.log({ test })
    await agoric.wallet(...txParams, '--offer', fileRW.toString());
  } catch (e) {
    t.fail(e);
  }
};

/**
 *
 * @param {string} path
 * @return {Promise<string[]>}
 */
export const getStorageChildren = async path => {
  const { children } = await agd.query('vstorage',
    'children',
    path);

  return children;
};

/**
 * @return {Promise<number>}
 */
const getPriceRound = async () => {
  const children = await getStorageChildren('published.priceFeed.STARS-USD_price_feed');
  console.log({ children });
  const roundChild = [...children].find(element => element === 'latestRound');
  if (roundChild === undefined) return 0;

  const { roundId } = await getContractInfo('priceFeed.STARS-USD_price_feed.latestRound', { agoric });
  return Number(roundId);
};

/**
 *
 * @param t
 * @param price
 * @param {Array<{address, acceptId}>} oracles
 * @return {Promise<void>}
 */
export const pushPrice = async (t, price, oracles) => {
  const { mkTempRW } = t.context;
  const tmpRW = await mkTempRW('pushPrices');

  const curRound = await getPriceRound();

  const buildAgopsArgs = id => {
    return [
      'pushPriceRound',
      '--price',
      price,
      '--roundId',
      curRound + 1,
      '--oracleAdminAcceptOfferId',
      id,
    ]
  };

  const buildOfferArgs = from => {
    return [
      'send',
      '--from',
      from,
      '--keyring-backend=test',
    ]
  };

  const offersPs = [];
  for (const { address, acceptId } of oracles) {
    offersPs.push(
      agopsOffer({
         t,
         agopsParams: buildAgopsArgs(acceptId),
         txParams: buildOfferArgs(address),
         src: tmpRW,
         from: address
        }
      )
    )
  }

  await Promise.all(offersPs);
  await waitForBlock(5);
};

export const acceptsOracleInvitations = async (t, oracles) => {
  const { mkTempRW } = t.context;
  const tmpRW = await mkTempRW('acceptInvites');

  const buildAgopsParams = (id = Date.now()) => {
    return ['accept', '--offerId', id, '--pair', 'STARS.USD'];
  };

  const buildOfferParams = from => {
    return ['send', '--from', from, '--keyring-backend=test'];
  };

  const offersP = [];
  for (const { address, acceptId } of oracles) {
    offersP.push(
      agopsOffer({ t, agopsParams: buildAgopsParams(acceptId), txParams: buildOfferParams(address), from: address, src: tmpRW}),
    )
  }

  await Promise.all(offersP);

  // Wait 5 blocks
  await waitForBlock(5);
};

/**
 *
 * @param {{
 *  src: string,
 *  dest: string
 * }[]} config dest must be absolute and src can be relative
 * @param fsp
 */
export const copyAll = (config, { fsp }) => {
  const copyPs = [];
  for (const { src, dest } of config) {
    const srcUrl = new URL(src, import.meta.url);
    copyPs.push(fsp.cp(srcUrl, dest));
  }

  return Promise.all(copyPs);
}

/**
 * Use this method when you need to extract filename from a path
 *
 * @param {string} filePath
 */
export const extractNameFromPath = filePath => filePath.split('/').at(-1)

export const makeBoardMarshaller = () => makeMarshal(boardValToSlot, slotToBoardRemote, { serializeBodyFormat: 'smallcaps'});


/**
 * Like getContractInfo from @agoric/synthetic-chain but also returns
 * the marshaller itself as well.
 *
 * @param io
 * @return {{data: any, marshaller: import('@endo/marshal').Marshal}}
 *
 */
export const makeStorageInfoGetter = io => {
  const {
    agoric
  } = io;

  const marshaller = makeBoardMarshaller();

  const getStorageInfo = async path => {
    const stdout = await agoric.follow('-lF', `:${path}`, '-o', 'text');
    const tx = JSON.parse(stdout);
    return marshaller.fromCapData(tx);
  };

  return { getStorageInfo, marshaller };
}

/**
 * - get the next start time
 * - send an offer to manualTimer
 */
export const runAuction = async (t, from) => {
  const { mkTempRW, agoric } = t.context;
  const id = `manual-timer-${Date.now()}`;
  const tmpRW = await mkTempRW(id);

  const { getStorageInfo, marshaller } = makeStorageInfoGetter({ agoric })

  const schedule = await getStorageInfo('published.fakeAuctioneer.schedule');

  const { nextStartTime } = schedule;
  t.log(schedule);

  // Now start the auction
  await sendTimerOffer(from, nextStartTime.absValue, marshaller, tmpRW, id);
}

export const sendTimerOffer = async (from, timeTo, marshaller, fileSrc, id) => {
  const offerSpec = AdvanceTimeOfferSpec({ id: `${id}-${timeTo}`, timestamp: timeTo });
  const spendAction = {
    method: "executeOffer",
    offer: offerSpec,
  };

  const offer = JSON.stringify(marshaller.toCapData(harden(spendAction)));
  await fileSrc.writeText(offer);

  return agoric.wallet(
    'send',
    '--from',
    from,
    '--keyring-backend=test',
    '--offer',
    fileSrc.toString()
  );
}

