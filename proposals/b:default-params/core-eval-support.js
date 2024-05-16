// @ts-check
import '@endo/init';
import {
  agd,
  agops,
  agoric,
  dbTool,
  makeAgd,
  makeFileRd,
  makeFileRW,
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
  return { agd, agoric, agops, swingstore, config, mkTempRW, src, tmpNameP };
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
 * Use this method when you need to extract filename from a path
 *
 * @param {string} filePath
 */
export const extractNameFromPath = filePath => filePath.split('/').at(-1)

export const makeBoardMarshaller = () => makeMarshal(boardValToSlot, slotToBoardRemote, { serializeBodyFormat: 'smallcaps' });


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
