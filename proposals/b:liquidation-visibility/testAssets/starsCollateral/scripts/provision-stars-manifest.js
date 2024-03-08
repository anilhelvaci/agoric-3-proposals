import { AmountMath } from '@agoric/ertp';
import { E } from '@endo/far';

export const init = async (
  {
    consume: {
      agoricNames,
      contractKits: contractKitsP,
      bankManager,
      agoricNamesAdmin,
    },
  },
  { options: { walletAddress } },
) => {
  const contractKits = await contractKitsP;

  const mintHolderInstance = await E(agoricNames).lookup(
    'instance',
    'StarsMintHolder',
  );
  const walletFactoryInstance = await E(agoricNames).lookup(
    'instance',
    'walletFactory',
  );

  const { creatorFacet: walletFactoryFacet } = contractKits.get(
    walletFactoryInstance,
  );

  const { creatorFacet: mint, publicFacet: issuer } =
    contractKits.get(mintHolderInstance);

  const bank = await E(bankManager).getBankForAddress(walletAddress);
  const [walletPresence, isNew] = await E(
    walletFactoryFacet,
  ).provideSmartWallet(walletAddress, bank, agoricNamesAdmin);
  const depositFacet = await E(walletPresence).getDepositFacet();

  const starsBrand = await E(issuer).getBrand();
  const starsAmount = AmountMath.make(
    starsBrand,
    1_000_000_000_000_000_000_000n,
  );

  const starsPayment = await E(mint).mintPayment(starsAmount);

  const print = await E(depositFacet).receive(starsPayment);

  console.log('LOG provision STARS print ', print);
};

export const getManifest = async (_powers, { walletAddress }) =>
  harden({
    manifest: {
      [init.name]: {
        consume: {
          agoricNames: true,
          contractKits: true,
          bankManager: true,
          agoricNamesAdmin: true,
        },
      },
    },
    options: {
      walletAddress,
    },
  });
