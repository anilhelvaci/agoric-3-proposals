/* eslint-disable no-undef */
const startAssetsFaucet = async ({
  consume: { zoe, agoricNamesAdmin, contractKits, board, chainStorage },
}) => {
  const boardAux = E(chainStorage).makeChildNode('boardAux');

  const logger = (log) => {
    console.log('[ASSET_CRABBLE_CORE_EVAL]', log);
  };

  const publishBrandInfo = async (brand, marshaller) => {
    const [id, displayInfo, allegedName] = await Promise.all([
      E(board).getId(brand),
      E(brand).getDisplayInfo(),
      E(brand).getAllegedName(),
    ]);
    const node = E(boardAux).makeChildNode(id);
    const aux = await E(marshaller).toCapData(
      harden({ allegedName, displayInfo }),
    );
    await E(node).setValue(JSON.stringify(aux));
  };

  const assetsFaucetBundleID = 'ddc23eddf3926ed5b0a6f861c794ffd8fb80ca49f1c9dbf0656b5642060e0c6567ef2d131968b29792a7651fe68eec07ac2ed519650f888a587bc95f72674628';

  const crabbleIstTerms = {
    keyword: 'CrabbleIST',
    assetKind: 'nat',
    displayInfo: { decimalPlaces: 6 },
  };

  const chainboardCollectionTerms = {
    keyword: 'ChainboardCollection',
    assetKind: 'set',
  };

  const crabbleCollectionTerms = {
    keyword: 'CrabbleCollection',
    assetKind: 'set',
  };

  logger('Get faucet contract installation');
  const assetsFaucetInstallation = await E(zoe).installBundleID(
    `b1-${assetsFaucetBundleID}`,
  );

  logger({
    assetsFaucetInstallation,
  });

  logger('Get agoricNamesAdmin');
  const issuerAdminP = E(agoricNamesAdmin).lookupAdmin('issuer');
  const brandAdminP = E(agoricNamesAdmin).lookupAdmin('brand');
  const instanceAdminP = E(agoricNamesAdmin).lookupAdmin('instance');

  logger('Starting Faucet contracts');
  const {
    creatorFacet: crabbleIstCreatorFacet,
    publicFacet: crabbleIstPublicFacet,
    instance: crabbleIstInstance,
  } = await E(zoe).startInstance(
    assetsFaucetInstallation,
    {},
    crabbleIstTerms,
    {},
    'CrabbleISTFaucet',
  );

  const {
    creatorFacet: chainboardCollectionCreatorFacet,
    publicFacet: chainboardCollectionPublicFacet,
    instance: chainboardCollectionInstance,
  } = await E(zoe).startInstance(
    assetsFaucetInstallation,
    {},
    chainboardCollectionTerms,
    {},
    'ChainboardCollectionFaucet',
  );

  const {
    creatorFacet: crabbleCollectionCreatorFacet,
    publicFacet: crabbleCollectionPublicFacet,
    instance: crabbleCollectionInstance,
  } = await E(zoe).startInstance(
    assetsFaucetInstallation,
    {},
    crabbleCollectionTerms,
    {},
    'CrabbleCollectionFaucet',
  );

  logger({
    crabbleIstCreatorFacet,
    crabbleIstPublicFacet,
    crabbleIstInstance,
    chainboardCollectionCreatorFacet,
    chainboardCollectionPublicFacet,
    chainboardCollectionInstance,
    crabbleCollectionCreatorFacet,
    crabbleCollectionPublicFacet,
    crabbleCollectionInstance,
  });

  logger('Updating agoricNames with assets issuers and brands');
  const crabbleIstIssuerP = E(crabbleIstPublicFacet).getIssuer();
  const chainboardCollectionIssuerP = E(
    chainboardCollectionPublicFacet,
  ).getIssuer();
  const crabbleCollectionIssuerP = E(crabbleCollectionPublicFacet).getIssuer();

  const [
    crabbleIstIssuer,
    crabbleIstBrand,
    chainboardCollectionIssuer,
    chainboardCollectionBrand,
    crabbleCollectionIssuer,
    crabbleCollectionBrand,
  ] = await Promise.all([
    crabbleIstIssuerP,
    E(crabbleIstIssuerP).getBrand(),
    chainboardCollectionIssuerP,
    E(chainboardCollectionIssuerP).getBrand(),
    crabbleCollectionIssuerP,
    E(crabbleCollectionIssuerP).getBrand(),
  ]);
  await Promise.all([
    E(issuerAdminP).update('CrabbleIST', crabbleIstIssuer),
    E(brandAdminP).update('CrabbleIST', crabbleIstBrand),
    E(issuerAdminP).update('ChainboardCollection', chainboardCollectionIssuer),
    E(brandAdminP).update('ChainboardCollection', chainboardCollectionBrand),
    E(issuerAdminP).update('CrabbleCollection', crabbleCollectionIssuer),
    E(brandAdminP).update('CrabbleCollection', crabbleCollectionBrand),
  ]);

  logger('Updating agoricNames with contract instances');
  await Promise.all([
    E(instanceAdminP).update('CrabbleISTFaucet', crabbleIstInstance),
    E(instanceAdminP).update(
      'ChainboardCollectionFaucet',
      chainboardCollectionInstance,
    ),
    E(instanceAdminP).update(
      'CrabbleCollectionFaucet',
      crabbleCollectionInstance,
    ),
  ]);

  logger('Publishing brand info to boardAux...');
  const marshaller = await E(board).getPublishingMarshaller();
  await Promise.all([
    publishBrandInfo(crabbleIstBrand, marshaller),
    publishBrandInfo(chainboardCollectionBrand, marshaller),
    publishBrandInfo(crabbleCollectionBrand, marshaller),
  ]);

  logger('Record faucet contracts kits on contractKits');
  const crabbleIstKit = {
    crabbleIstCreatorFacet,
    crabbleIstPublicFacet,
    crabbleIstInstance,
  };

  const chainboardCollectionKit = {
    chainboardCollectionCreatorFacet,
    chainboardCollectionPublicFacet,
    chainboardCollectionInstance,
  };

  const crabbleCollectionKit = {
    crabbleCollectionCreatorFacet,
    crabbleCollectionPublicFacet,
    crabbleCollectionInstance,
  };

  await Promise.all([
    E(contractKits).init(crabbleIstInstance, crabbleIstKit),
    E(contractKits).init(chainboardCollectionInstance, chainboardCollectionKit),
    E(contractKits).init(crabbleCollectionInstance, crabbleCollectionKit),
  ]);

  logger('Completed');
};

harden(startAssetsFaucet);
startAssetsFaucet;
