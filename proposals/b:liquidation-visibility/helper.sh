sdkRoot=/usr/src/agoric-sdk
proposalRoot=/usr/src/proposals/b:liquidation-visibility

echo "SDK Root" $sdkRoot
echo "Proposal Root" $proposalRoot

cp -r $proposalRoot/artifacts/src/vaultFactory \
  $sdkRoot/packages/inter-protocol/src

cp $proposalRoot/artifacts/scripts/liquidation-visibility-upgrade.js \
  $sdkRoot/packages/inter-protocol/scripts

cp $proposalRoot/artifacts/src/proposals/vaultsLiquidationVisibility.js \
  $sdkRoot/packages/inter-protocol/src/proposals
