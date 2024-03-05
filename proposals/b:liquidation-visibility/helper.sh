sdkRoot=/usr/src/agoric-sdk
proposalRoot=/usr/src/a3p/proposals/b:liquidation-visibility

echo "SDK Root" $sdkRoot
echo "Proposal Root" $proposalRoot

cp -r $proposalRoot/artifacts/src/vaultFactory \
  $sdkRoot/packages/inter-protocol/src

cp $proposalRoot/artifacts/scripts/liquidation-visibility-upgrade.js \
  $sdkRoot/packages/inter-protocol/scripts

cp $proposalRoot/artifacts/src/proposals/vaultsLiquidationVisibility.js \
  $sdkRoot/packages/inter-protocol/src/proposals

cd $sdkRoot/packages/inter-protocol/
yarn build:bundles
agoric run scripts/liquidation-visibility-upgrade.js

#yarn bundle-source --cache-json $proposalRoot/bundles \
# $sdkRoot/packages/inter-protocol/src/vaultFactory/vaultDirector.js vaultDirector
#
#yarn bundle-source --cache-json $proposalRoot/bundles \
# $sdkRoot/packages/inter-protocol/src/vaultFactoryV2/vaultFactory.js vaultFactoryV2

#yarn bundle-source --cache-json $proposalRoot/bundles \
# $sdkRoot/packages/inter-protocol/src/vaultFactory/customTimerVaultFactory.js customTimerVaultFactory

#jq ".endoZipBase64Sha512" bundles/bundle-vaultFactoryV2.json