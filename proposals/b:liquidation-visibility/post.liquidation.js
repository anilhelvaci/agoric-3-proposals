import test from "ava";
import { executeCommand, makeFileRW, makeWebCache, makeWebRd } from "@agoric/synthetic-chain";
import * as fsp from 'fs/promises';
import { tmpName } from 'tmp';
import * as path from 'path';

const config = {
  featuresSrc: 'visibilityFeaturesProof.tar',
  release: 'https://github.com/Jorge-Lopes/agoric-sdk-liquidation-visibility/releases/tag/liq-visibility-a3p-v0.1',
};

test.serial('checksum from repo matches local one', async t => {
  const src = makeWebRd(config.release.replace('/tag/', '/download/') + '/', { fetch });
  const tmpNameP = prefix =>
    new Promise((resolve, reject) =>
      tmpName({ prefix }, (err, x) => (err ? reject(err) : resolve(x))),
    );
  const td = await tmpNameP('assets');
  const dest = makeFileRW(td, { fsp, path });
  const assets = makeWebCache(src, dest);
  const proofPath = await assets.storedPath('visibilityFeaturesProof.tar');

  const [cksumWeb, cksumLocal] = (await Promise.all([
    executeCommand('cksum', [proofPath]),
    executeCommand('cksum', ['./visibilityFeaturesProof.tar']),
  ])).map(cksum => cksum.split(' ')[0]);

  t.log({ cksumWeb, cksumLocal });
  t.is(cksumWeb, cksumLocal);
  t.context = {
    assets
  };
});

test.todo('unarchive .tar and copy content under agoric-sdk');
/**
 * Bundle hash of the vaultFactory copied from .tar must match with the one
 * used for incarnation 1.
 */
test.todo('make sure bundle hashes match');

/**
 * - copy mutated vaultFactory.js and auctioneer.js to relevant addresses
 * - agoric run on both of them
 */
test.todo('build proposal for timer upgrades');

/**
 * - ensure enough IST
 * - install bundles
 * - submit proposal
 * - vote
 * - check incarnation numbers
 *    - 1 for auctioneer, 2 for vaultFactory
 */
test.todo('deploy incarnation 2');