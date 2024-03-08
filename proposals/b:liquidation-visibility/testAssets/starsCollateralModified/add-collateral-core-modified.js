/* global process */
import { makeHelpers } from '/usr/src/agoric-sdk/packages/deploy-script-support/src/helpers.js';
import { getManifestForPsm } from '/usr/src/agoric-sdk/packages/inter-protocol/src/proposals/startPSM.js';
import { makeInstallCache } from '/usr/src/agoric-sdk/packages/inter-protocol/src/proposals/utils.js';
import { getManifestForAddAssetToVault } from './addAssetToVault-modified.js';

/** @type {import('/usr/src/agoric-sdk/packages/deploy-script-support/src/externalTypes.js').ProposalBuilder} */
export const defaultProposalBuilder = async (
  { publishRef, install: install0, wrapInstall },
  {
    debtLimitValue = undefined,
    interestRateValue = undefined,
    interchainAssetOptions = /** @type {object} */ ({}),
  } = {},
  { env = process.env } = {},
) => {
  /** @type {import('/usr/src/agoric-sdk/packages/inter-protocol/src/proposals/addAssetToVault.js').InterchainAssetOptions} */
  const {
    issuerBoardId = env.INTERCHAIN_ISSUER_BOARD_ID,
    denom = env.INTERCHAIN_DENOM,
    keyword = 'ATOM',
    issuerName = keyword,
    oracleBrand = issuerName,
    decimalPlaces = 6,
    proposedName = issuerName,
    initialPrice = undefined,
  } = interchainAssetOptions;

  if (!denom) {
    assert(issuerBoardId, 'INTERCHAIN_ISSUER_BOARD_ID is required');
  }

  const install = wrapInstall ? wrapInstall(install0) : install0;

  return harden({
    sourceSpec: './addAssetToVault-modified.js',
    getManifestCall: [
      getManifestForAddAssetToVault.name,
      {
        debtLimitValue: debtLimitValue && BigInt(debtLimitValue),
        interestRateValue: interestRateValue && BigInt(interestRateValue),
        interchainAssetOptions: {
          denom,
          issuerBoardId,
          decimalPlaces,
          initialPrice,
          keyword,
          issuerName,
          proposedName,
          oracleBrand,
        },
        scaledPriceAuthorityRef: publishRef(
          install(
            '/usr/src/agoric-sdk/packages/zoe/src/contracts/scaledPriceAuthority.js',
            '/usr/src/agoric-sdk/packages/builders/scripts/bundles/bundle-scaledPriceAuthority.js',
            { persist: true },
          ),
        ),
      },
    ],
  });
};

/** @type {import('/usr/src/agoric-sdk/packages/deploy-script-support/src/externalTypes.js').ProposalBuilder} */
export const psmProposalBuilder = async (
  { publishRef, install: install0, wrapInstall },
  { anchorOptions = /** @type {object} */ ({}) } = {},
  { env = process.env } = {},
) => {
  const { denom = env.ANCHOR_DENOM, decimalPlaces = 6 } = anchorOptions;

  assert(denom, 'ANCHOR_DENOM is required');

  const install = wrapInstall ? wrapInstall(install0) : install0;

  return harden({
    sourceSpec: '/usr/src/agoric-sdk/packages/inter-protocol/src/proposals/startPSM.js',
    getManifestCall: [
      getManifestForPsm.name,
      {
        anchorOptions: {
          ...anchorOptions,
          denom,
          decimalPlaces,
        },
        installKeys: {
          psm: publishRef(
            install(
              '/usr/src/agoric-sdk/packages/inter-protocol/src/psm/psm.js',
              '/usr/src/agoric-sdk/packages/builders/scripts/bundles/bundle-psm.js',
            ),
          ),
          mintHolder: publishRef(
            install(
              '/usr/src/agoric-sdk/packages/vats/src/mintHolder.js',
              '/usr/src/agoric-sdk/packages/vats/bundles/bundle-mintHolder.js',
            ),
          ),
        },
      },
    ],
  });
};

export default async (homeP, endowments) => {
  const { writeCoreProposal } = await makeHelpers(homeP, endowments);

  const tool = await makeInstallCache(homeP, {
    loadBundle: spec => import(spec),
  });

  await writeCoreProposal('gov-add-collateral', defaultProposalBuilder);
  await writeCoreProposal('gov-start-psm', opts =>
    // @ts-expect-error XXX makeInstallCache types
    psmProposalBuilder({ ...opts, wrapInstall: tool.wrapInstall }),
  );
};
