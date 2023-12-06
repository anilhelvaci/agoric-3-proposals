import bundleMintHolder from '@agoric/vats/bundles/bundle-mintHolder.js';
import { E } from '@endo/far';
import { AssetKind } from '@agoric/ertp';
import fs from 'fs/promises';

const deployAssets = async (homeP, { pathResolve }) => {
  const { zoe, board, scratch } = E.get(homeP);

  console.log('Installing mintHolder bundle...');
  const mintHolderInstallation = await E(zoe).install(bundleMintHolder);

  const collateralTerms = {
    keyword: 'Collateral',
    assetKind: AssetKind.NAT,
    displayInfo: { decimalPlaces: 6 },
  };

  const rentalFeeTerms = {
    keyword: 'RentalFee',
    assetKind: AssetKind.NAT,
    displayInfo: { decimalPlaces: 6 },
  };

  const utilityTerms = {
    keyword: 'Utility',
    assetKind: AssetKind.SET,
  };

  console.log('Starting instances...');
  const [collateralKit, rentalFeeKit, utilityKit] = await Promise.all([
    E(zoe).startInstance(mintHolderInstallation, undefined, collateralTerms),
    E(zoe).startInstance(mintHolderInstallation, undefined, rentalFeeTerms),
    E(zoe).startInstance(mintHolderInstallation, undefined, utilityTerms),
  ]);

  console.log('Putting the mint objects to scratch...');
  await Promise.all([
    E(scratch).set('collateral-mint', collateralKit.creatorFacet),
    E(scratch).set('rentalFee-mint', rentalFeeKit.creatorFacet),
    E(scratch).set('utility-mint', utilityKit.creatorFacet),
  ]);

  const [collateralBrand, rentalFeeBrand, utilityBrand] = await Promise.all([
    E(collateralKit.publicFacet).getBrand(),
    E(rentalFeeKit.publicFacet).getBrand(),
    E(utilityKit.publicFacet).getBrand(),
  ]);

  console.log('Putting the issuers to board...');
  const [
    collateralIssuerBoardId,
    collateralBrandBoardId,
    rentalFeeIssuerBoardId,
    rentalFeeBrandBoardId,
    utilityIssuerBoardId,
    utilityBrandBoardId,
  ] = await Promise.all([
    E(board).getId(collateralKit.publicFacet),
    E(board).getId(collateralBrand),
    E(board).getId(rentalFeeKit.publicFacet),
    E(board).getId(rentalFeeBrand),
    E(board).getId(utilityKit.publicFacet),
    E(board).getId(utilityBrand),
  ]);

  console.log('Writing to file...');
  const dappConstants = {
    COLLATERAL_ISSUER_BOARD_ID: collateralIssuerBoardId,
    COLLATERAL_BRAND_BOARD_ID: collateralBrandBoardId,
    RENTAL_FEE_ISSUER_BOARD_ID: rentalFeeIssuerBoardId,
    RENTAL_FEE_BRAND_BOARD_ID: rentalFeeBrandBoardId,
    UTILITY_ISSUER_BOARD_ID: utilityIssuerBoardId,
    UTILITY_BRAND_BOARD_ID: utilityBrandBoardId,
  };
  const defaultsFolder = pathResolve(`../../../generated`);
  const defaultsFile = pathResolve(
    `../../../generated/installationConstants.json`,
  );
  console.log('writing', defaultsFile);
  const defaultsContents = JSON.stringify(dappConstants, undefined, 2);
  await fs.mkdir(defaultsFolder, { recursive: true });
  await fs.writeFile(defaultsFile, defaultsContents);

  console.log('Done.');
};

export default deployAssets;
