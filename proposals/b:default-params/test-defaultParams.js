import test from 'ava';
import {
//   executeCommand,
//   makeFileRW,
//   makeWebCache,
//   makeWebRd,
//   bundleDetail,
  proposalBuilder,
  readBundles,
  passCoreEvalProposal, getContractInfo, agoric,
} from '@agoric/synthetic-chain';
import * as fsp from 'fs/promises';
import {
  extractNameFromPath,
  getStorageChildren,
  makeStorageInfoGetter,
  makeTestContext
} from "./core-eval-support.js";
// import { existsSync } from 'fs';
// import { tmpName } from 'tmp';
// import * as path from 'path';

const config = {
  installer: 'user1',
  proposer: 'validator',
  script: './add-STARS.js',
  dest: '/usr/src/agoric-sdk/packages/inter-protocol/scripts/add-STARS.js',
  swingstorePath: '~/.agoric/data/agoric/swingstore.sqlite',
};

test.before(async t => (t.context = await makeTestContext({ testConfig: config, srcDir: 'assets' })));

test.serial('copy add-STARS.js to @agoric/inter-protocol/scripts', async t => {
  await fsp.cp(config.script, config.dest);
  await fsp.cp('./add-collateral-core.js', '/usr/src/agoric-sdk/packages/inter-protocol/scripts/add-collateral-core.js');
  await fsp.cp('./addAssetToVault.js', '/usr/src/agoric-sdk/packages/inter-protocol/src/proposals/addAssetToVault.js');
  t.pass();
});

test.serial('build prop', async t => {
  const {
    evals,
    bundles
  } = await proposalBuilder(config.dest);
  t.log({
    evals,
    bundles
  });
  config.proposal = {
    evals,
    bundles
  };
  t.pass();
});

test.serial('run prop', async t => {
  t.log(config.proposal);
  const { tmpNameP } = t.context;
  const { proposal: { evals, bundles } } = config;
  const tmpName = await tmpNameP('default-params');
  await fsp.mkdir(tmpName);

  const evalsCopyP = evals.flatMap(
    ({
       permit,
       script
     }) => [
      fsp.cp(permit, `${tmpName}/${extractNameFromPath(permit)}`),
      fsp.cp(script, `${tmpName}/${extractNameFromPath(script)}`)
    ]);

  const bundlesCopyP = bundles.map(
    bundlePath => fsp.cp(bundlePath, `${tmpName}/${extractNameFromPath(bundlePath)}`)
  );

  await Promise.all([
    ...evalsCopyP,
    ...bundlesCopyP,
  ])

  t.log({ tmpName });
  const bundleInfos = await readBundles(tmpName);
  t.log('bundleInfos', bundleInfos);

  await passCoreEvalProposal(
    bundleInfos,
    { title: `Core eval of ${tmpName}`, ...config }
  );
  t.pass();
});

test.skip('display', async t => {
  const children = await getStorageChildren('published.vaultFactory.managers');
  t.log(children);

  const { getStorageInfo } = makeStorageInfoGetter({ agoric: t.context.agoric });
  const data = await getStorageInfo('published.vaultFactory.managers.manager2.governance');
  t.log('Data: ', data.current.LiquidationMargin.value);
  t.is(data.current.LiquidationMargin.value.numerator.value, 380n);
  t.pass();
});
