#!/bin/bash
# Prepare an upgrade

if [[ -z "${UPGRADE_TO}" ]]; then
  fail "Requires UPGRADE_TO to be set"
fi

# figlet -f cyberlarge Prepare upgrade
echo -e '
  _____   ______ _______  _____  _______  ______ _______
 |_____] |_____/ |______ |_____] |_____| |_____/ |______
 |       |    \_ |______ |       |     | |    \_ |______

 _     _  _____   ______  ______ _______ ______  _______
 |     | |_____] |  ____ |_____/ |_____| |     \ |______
 |_____| |       |_____| |    \_ |     | |_____/ |______
'
echo "Preparing an upgrade to $UPGRADE_TO"

grep -qF 'env_setup.sh' /root/.bashrc || echo "source /usr/src/upgrade-test-scripts/env_setup.sh" >>/root/.bashrc
grep -qF 'printKeys' /root/.bashrc || echo "printKeys" >>/root/.bashrc

source ./env_setup.sh

PROPOSAL=$1
if [ -z "$PROPOSAL" ]; then
  fail "Must specify what proposal to use"
fi

startAgd

voting_period_s=10
latest_height=$(agd status | jq -r .SyncInfo.latest_block_height)
height=$((latest_height + voting_period_s + 20))
info=${UPGRADE_INFO-"{}"}
if echo "$info" | jq .; then
  echo "upgrade-info: $info"
else
  status=$?
  echo "Upgrade info is not valid JSON: $info"
  exit $status
fi
agd tx -bblock gov submit-proposal software-upgrade "$UPGRADE_TO" \
  --upgrade-height="$height" --upgrade-info="$info" \
  --title="Upgrade to ${UPGRADE_TO}" --description="upgrades" \
  --from=validator --chain-id="$CHAINID" \
  --yes --keyring-backend=test
waitForBlock

voteLatestProposalAndWait

echo "Chain in to-be-upgraded state for $UPGRADE_TO"

while true; do
  latest_height=$(agd status | jq -r .SyncInfo.latest_block_height)
  if [ "$latest_height" -ge "$height" ]; then
    echo "Upgrade height for $UPGRADE_TO reached. Killing agd"
    echo "(CONSENSUS FAILURE above for height $height is expected)"
    break
  fi
  echo "Waiting for upgrade height for $UPGRADE_TO to be reached (need $height, have $latest_height)"
  sleep 1
done

sleep 2
killAgd
echo "state directory $HOME/.agoric ready for upgrade to $UPGRADE_TO"
