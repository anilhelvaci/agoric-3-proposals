import { makeHelpers } from '@agoric/deploy-script-support';
import { getManifest } from './provision-stars-manifest.js';

/**
 * @param {string} keyName gov1, gov2...
 */
export const getAgoricAddress = keyName => {
  const pathInfo = `/root/.agoric/${keyName}.out`;
  const keyData = fs.readFileSync(pathInfo, { encoding: 'utf-8', flag: 'r' });

  const pathMnemonic = `/root/.agoric/${keyName}.key`;
  const keyMnemonic = fs.readFileSync(pathMnemonic, {
    encoding: 'utf-8',
    flag: 'r',
  });

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
};

const walletAddress = getAgoricAddress('user1').address;

export const defaultProposalBuilder = async () => {
  return harden({
    sourceSpec: './provision-stars-manifest.js',
    getManifestCall: [
      getManifest.name,
      {
        walletAddress,
      },
    ],
  });
};

export default async (homeP, endowments) => {
  const { writeCoreProposal } = await makeHelpers(homeP, endowments);
  await writeCoreProposal('provisionSTARS', defaultProposalBuilder);
};
