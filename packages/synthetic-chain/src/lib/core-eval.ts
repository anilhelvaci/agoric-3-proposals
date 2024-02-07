import { execFileSync } from 'node:child_process'; // TODO: use execa
import assert from 'node:assert';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as process from 'node:process';

import { ZipReader } from '@endo/zip';
import dbOpen from 'better-sqlite3';

import { makeAgd } from './agd-lib.js';
import { agoric } from './cliHelper.js';
import { voteLatestProposalAndWait } from './commonUpgradeHelpers.js';
import { dbTool } from './vat-status.js';
import { type WebCache } from './webAsset.js';
import {
  BundleInfo,
  bundleDetail,
  ensureISTForInstall,
  flags,
  getContractInfo,
  loadedBundleIds,
  readBundles,
  txAbbr,
} from './core-eval-support.js';
import { step } from './logging.js';

export const staticConfig = {
  deposit: '10000000ubld', // 10 BLD
  installer: 'gov1', // as in: agd keys show gov1
  proposer: 'validator',
  collateralPrice: 6, // conservatively low price. TODO: look up
  swingstorePath: '~/.agoric/data/agoric/swingstore.sqlite',
};

export type StaticConfig = typeof staticConfig & {
  bundleInfos?: Record<string, BundleInfo>;
};

const makeFakeWebCache = (base: string): WebCache => {
  return {
    getText(segment: string) {
      return fsp.readFile(path.join(base, segment), 'utf8');
    },
    async storedPath(segment: string) {
      return path.join(base, segment);
    },
    async size(segment: string) {
      const info = await fsp.stat(path.join(base, segment));
      return info.size;
    },
    toString() {
      return 'fake web cache';
    },
    async remove() {
      console.warn('noop remove');
    },
  };
};

/**
 * Provide access to the outside world via context.
 *
 * TODO: refactor overlap with mn2-start.test.js
 */
const makeTestContext = async (staticConfig: StaticConfig) => {
  // assume filenames don't overlap
  const bundleAssets = makeFakeWebCache('submission');
  console.log(`bundleAssets: ${bundleAssets}`);

  const config = {
    bundleAssets,
    chainId: 'agoriclocal',
    ...staticConfig,
  };

  const agd = makeAgd({ execFileSync }).withOpts({
    keyringBackend: 'test',
  });

  const dbPath = staticConfig.swingstorePath.replace(/^~/, process.env.HOME!);
  const swingstore = dbTool(dbOpen(dbPath, { readonly: true }));

  const before = new Map();
  return { agd, agoric, swingstore, config, before, fetch };
};

export const passCoreEvalProposal = async (
  bundleMap: Record<string, BundleInfo>,
) => {
  // XXX vestige of Ava
  const config = {
    ...staticConfig,
    bundleInfos: bundleMap,
  };
  const context = await makeTestContext(config);
  const bundleInfos = Object.values(bundleMap);

  await step('bundles not yet installed', async () => {
    const loaded = loadedBundleIds(context.swingstore);
    for (const [name, { bundles, evals }] of Object.entries(bundleMap)) {
      console.log(
        name,
        evals[0].script,
        evals.length,
        'eval',
        bundles.length,
        'bundles',
      );
      for (const bundle of bundles) {
        const { id } = bundleDetail(bundle);
        assert(!loaded.includes(id));
      }
    }
  });

  const bundleEntry = async (bundle: { endoZipBase64: string }) => {
    const getZipReader = async () => {
      const { endoZipBase64 } = bundle;
      const toBlob = (base64: string, type = 'application/octet-stream') =>
        fetch(`data:${type};base64,${base64}`).then(res => res.blob());
      const zipBlob = await toBlob(endoZipBase64);
      // https://github.com/endojs/endo/issues/1811#issuecomment-1751499626
      const buffer = await zipBlob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      return new ZipReader(bytes);
    };

    const getCompartmentMap = (zipRd: ZipReader) => {
      const { content } = zipRd.files.get('compartment-map.json');
      const td = new TextDecoder();
      const cmap = JSON.parse(td.decode(content));
      return cmap;
    };

    const zipRd = await getZipReader();
    const cmap = getCompartmentMap(zipRd);
    return cmap.entry;
  };

  await step('bundle names: compartmentMap.entry', async () => {
    const { bundleAssets } = context.config;
    for (const { bundles, evals } of bundleInfos) {
      for (const bundleRef of bundles) {
        const { fileName } = bundleDetail(bundleRef);
        const bundle = JSON.parse(await bundleAssets.getText(fileName));
        const entry = await bundleEntry(bundle);
        console.log(entry, fileName.slice(0, 'b1-12345'.length));
        assert(entry.compartment);
        assert(entry.module);
      }
    }
  });

  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  const readBundleSizes = async (assets: WebCache) => {
    const bundleSizes = await Promise.all(
      bundleInfos
        .map(({ bundles }) =>
          bundles.map(b => assets.size(bundleDetail(b).fileName)),
        )
        .flat(),
    );
    const totalSize = sum(bundleSizes);
    return { bundleSizes, totalSize };
  };

  await step('ensure enough IST to install bundles', async () => {
    const { agd, config } = context;
    const { totalSize } = await readBundleSizes(config.bundleAssets);

    await ensureISTForInstall(agd, config, totalSize, {
      log: console.log,
    });
  });

  await step('ensure bundles installed', async () => {
    const { agd, swingstore, agoric, config } = context;
    const { chainId, bundleAssets } = config;
    const loaded = loadedBundleIds(swingstore);
    const from = agd.lookup(config.installer);

    let todo = 0;
    let done = 0;
    for (const { bundles } of bundleInfos) {
      todo += bundles.length;
      for (const bundle of bundles) {
        const { id, fileName, endoZipBase64Sha512 } = bundleDetail(bundle);
        if (loaded.includes(id)) {
          console.log('bundle already installed', id);
          done += 1;
          continue;
        }

        const bundleRd = await bundleAssets.storedPath(fileName);
        const result = await agd.tx(
          ['swingset', 'install-bundle', `@${bundleRd}`, '--gas', 'auto'],
          { from, chainId, yes: true },
        );
        console.log(txAbbr(result));
        assert.equal(result.code, 0);

        const info = await getContractInfo('bundles', { agoric, prefix: '' });
        console.log(info);
        done += 1;
        assert.deepEqual(info, {
          endoZipBase64Sha512,
          error: null,
          installed: true,
        });
      }
    }
    assert.equal(todo, done);
  });

  await step('core eval proposal passes', async () => {
    const { agd, swingstore, config } = context;
    const from = agd.lookup(config.proposer);
    const { chainId, deposit, bundleAssets } = config;
    // @ts-expect-error FIXME
    const info = { title: config.title, description: config.description };
    // @ts-expect-error FIXME
    console.log('submit proposal', config.title);

    // double-check that bundles are loaded
    const loaded = loadedBundleIds(swingstore);
    for (const { bundles } of bundleInfos) {
      for (const bundle of bundles) {
        const { id } = bundleDetail(bundle);
        if (!loaded.includes(id)) {
          assert.fail(`bundle ${id} not loaded`);
        }
      }
    }

    const evalNames = bundleInfos
      .map(({ evals }) => evals)
      .flat()
      .map(e => [e.permit, e.script])
      .flat();
    const evalPaths = await Promise.all(
      evalNames.map(e => bundleAssets.storedPath(e)),
    );
    const result = await agd.tx(
      [
        'gov',
        'submit-proposal',
        'swingset-core-eval',
        ...evalPaths,
        ...flags({ ...info, deposit }),
        ...flags({ gas: 'auto', 'gas-adjustment': '1.2' }),
      ],
      { from, chainId, yes: true },
    );
    console.log(txAbbr(result));
    assert.equal(result.code, 0);

    const detail = await voteLatestProposalAndWait();
    console.log(detail.proposal_id, detail.voting_end_time, detail.status);
    assert.equal(detail.status, 'PROPOSAL_STATUS_PASSED');
  });
};

export const evalBundles = async (dir: string) => {
  const bundleMap = await readBundles(dir);

  await passCoreEvalProposal(bundleMap);
};
