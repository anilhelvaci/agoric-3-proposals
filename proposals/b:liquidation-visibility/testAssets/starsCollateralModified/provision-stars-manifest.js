import { AmountMath } from '@agoric/ertp';
import { E } from '@endo/far';

export const init = async (
  { consume: { zoe, agoricNames, contractKits } },
  { options: { walletAddress } },
) => {
  const mintHolderInstance = await E(agoricNames).lookup(
    'instance',
    'StarsMintHolder',
  );
  const { mint, issuer } = await E(contractKits).get(mintHolderInstance);
  const starsBrand = await E(issuer).getBrand();

  const starsAmount = AmountMath.make(
    starsBrand,
    1_000_000_000_000_000_000_000n,
  );
  const starsPayment = mint.mintPayment(starsAmount);


  
};

export const getManifest = async (_powers, { walletAddress }) =>
  harden({
    manifest: {
      [init.name]: {
        consume: {
          zoe: 'zoe',
          agoricNames: true,
          contractKits: true,
        },
      },
    },
    options: {
      walletAddress,
    },
  });
