import { makeHelpers } from '/usr/src/agoric-sdk/packages/deploy-script-support/src/helpers.js';
import { defaultProposalBuilder as vaultProposalBuilder } from '/usr/src/agoric-sdk/packages/inter-protocol/scripts/add-collateral-core.js';
import { defaultProposalBuilder as oraclesProposalBuilder } from '/usr/src/agoric-sdk/packages/inter-protocol/scripts/price-feed-core.js';
import fs from 'fs';

/** @type {import('@agoric/deploy-script-support/src/externalTypes.js').ProposalBuilder} */
export const starsVaultProposalBuilder = async powers => {
  return vaultProposalBuilder(powers, {
    interchainAssetOptions: {
      // Values for the Stargaze token on Osmosis
      denom:
        'ibc/987C17B11ABC2B20019178ACE62929FE9840202CE79498E29FE8E5CB02B7C0A4',
      decimalPlaces: 6,
      keyword: 'STARS',
      oracleBrand: 'STARS',
      proposedName: 'STARS',
    },
  });
};

/**
 * @param {string} keyName gov1, gov2...
 */
export const getAgoricAddress = keyName => {
  const pathInfo = `/root/.agoric/${keyName}.out`;
  const keyData = fs.readFileSync(
      pathInfo,
      { encoding: 'utf-8', flag: 'r' },
  );

  const pathMnemonic = `/root/.agoric/${keyName}.key`;
  const keyMnemonic = fs.readFileSync(
      pathMnemonic,
      { encoding: 'utf-8', flag: 'r' },
  );

  const nameExp = /name: (.*)\n/;
  const typeExp = /type: (.*)\n/;
  const addressExp = /address: (.*)\n/;
  const pubkeyExp = /pubkey: (.*)\n/;

  return {
      name: nameExp.exec(keyData)[1],
      type: typeExp.exec(keyData)[1],
      address: addressExp.exec(keyData)[1],
      pubkey: pubkeyExp.exec(keyData)[1],
      mnemonic: keyMnemonic.split('\n')[0],
  };
}

/** @type {import('@agoric/deploy-script-support/src/externalTypes.js').ProposalBuilder} */
export const starsOraclesProposalBuilder = async powers => {
  return oraclesProposalBuilder(powers, {
    AGORIC_INSTANCE_NAME: `STARS-USD price feed`,
    IN_BRAND_LOOKUP: ['agoricNames', 'oracleBrand', 'STARS'],
    IN_BRAND_DECIMALS: 6,
    OUT_BRAND_LOOKUP: ['agoricNames', 'oracleBrand', 'USD'],
    OUT_BRAND_DECIMALS: 4,
    oracleAddresses: [
      getAgoricAddress('gov1').address,
      getAgoricAddress('gov2').address,
      'agoric144rrhh4m09mh7aaffhm6xy223ym76gve2x7y78',
      'agoric19d6gnr9fyp6hev4tlrg87zjrzsd5gzr5qlfq2p',
      'agoric1n4fcxsnkxe4gj6e24naec99hzmc4pjfdccy5nj',
    ],
  });
};

export default async (homeP, endowments) => {
  const { writeCoreProposal } = await makeHelpers(homeP, endowments);
  await writeCoreProposal('add-STARS-prop', starsVaultProposalBuilder);
  await writeCoreProposal('add-STARS-oracles', starsOraclesProposalBuilder);
};
