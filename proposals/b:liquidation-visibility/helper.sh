sdkRoot=/usr/src/agoric-sdk
proposalRoot=/usr/src/a3p/proposals/b:liquidation-visibility

echo "SDK Root" $sdkRoot
echo "Proposal Root" $proposalRoot

cp -r $proposalRoot/artifacts/src/vaultFactory \
  $sdkRoot/packages/inter-protocol/src

cp $proposalRoot/artifacts/scripts/upgrade-vaults.js \
  $sdkRoot/packages/inter-protocol/scripts

cp $proposalRoot/artifacts/src/proposals/vaultsUpgrade.js \
  $sdkRoot/packages/inter-protocol/src/proposals
