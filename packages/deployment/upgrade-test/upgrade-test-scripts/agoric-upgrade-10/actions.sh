#!/bin/bash

# TODO should env_setup do this for all?
# set -ueo pipefail
set -v -x -e

. ./upgrade-test-scripts/env_setup.sh

# UNTIL we have confidence this script will succeed and let the build complete
#exit 0

# For development:
# TARGET=agoric-upgrade-10 make local_sdk build run
# agoric wallet show --from $GOV1ADDR
waitForBlock 20

echo "Tickling the wallets so they are revived"
# Until they are revived, the invitations can't be deposited. So the first action can't be to accept an invitation (because it won't be there).
govaccounts=("$GOV1ADDR" "$GOV2ADDR" "$GOV3ADDR")
cm=0
for i in "${govaccounts[@]}"; do
    for run in {1..2}; do
        echo "$i: $run: Accepting EC Committee"
        if [[ "$run" == "1" ]]; then
            timeout 3 yarn run --silent agops ec committee --send-from "$i" || true
        else
            agops ec committee --send-from "$i" --voter "$cm"
            cm=$((cm + 1))
        fi
    done
    echo "$i: Accepting EC Charter"
    agops ec charter --send-from "$i"
done

oracles=("$GOV1ADDR" "$GOV2ADDR")
for i in "${oracles[@]}"; do
    echo "$i: Accept oracle invitations"
    ORACLE_OFFER=$(mktemp -t agops.XXX)
    OFFER_ID="$(newOfferId)"
    agops oracle accept --offerId "$OFFER_ID" >|"$ORACLE_OFFER"
    agoric wallet print --file "$ORACLE_OFFER"
    agops perf satisfaction --from "$i" --executeOffer "$ORACLE_OFFER" --keyring-backend=test
    echo "${i}_ORACLE=$OFFER_ID" >> "$HOME/.agoric/envs"
done

source "$HOME/.agoric/envs"

START_FREQUENCY=600 #StartFrequency: 600s (auction runs every 10m)
CLOCK_STEP=20 #ClockStep: 20s (ensures auction completes in time)

FASTER_AUCTIONS_OFFER=$(mktemp -t agops.XXX)
agops auctioneer proposeParamChange --charterAcceptOfferId "$(agops ec find-continuing-id --for "charter member invitation" --from "$GOV1ADDR")" --start-frequency $START_FREQUENCY --clock-step $CLOCK_STEP >|"$FASTER_AUCTIONS_OFFER"
agoric wallet print --file "$FASTER_AUCTIONS_OFFER"
agops perf satisfaction --from "$GOV1ADDR" --executeOffer "$FASTER_AUCTIONS_OFFER" --keyring-backend=test

govaccounts=("$GOV1ADDR" "$GOV2ADDR" "$GOV3ADDR")
for i in "${govaccounts[@]}"; do
    agops ec vote --forPosition 0 --send-from "$i"
done

# wait for the vote to pass
sleep 65

# ensure params were changed
test_val "$(agoric follow -l -F  :published.auction.governance -o jsonlines | jq -r .current.ClockStep.value.relValue)" "$CLOCK_STEP"
test_val "$(agoric follow -l -F  :published.auction.governance -o jsonlines | jq -r .current.StartFrequency.value.relValue)" "$START_FREQUENCY"



# echo Open a vault
# OFFER=$(mktemp -t agops.XXX)
# agops vaults open --wantMinted 5.00 --giveCollateral 9.0 >|"$OFFER"
# # agoric wallet print --file "$OFFER"
# agoric wallet send --offer "$OFFER" --from gov1 --keyring-backend="test"

# # should have the vault
# # VAULT_PATH=$(agops vaults list --from $GOV1ADDR | head -1)
# # agoric follow -F :$VAULT_PATH

# # TODO test bidding
# # TODO
# # agops inter bid by-price --price 1 --give 1.0IST  --from $GOV1ADDR --keyring-backend test



# echo Look up the ids from vstorage.
# # You can debug the 'for' option with `find-continuing-id` to see the `description` fields
# CHARTER_OFFER_ID=$(
#     agops ec find-continuing-id --for "charter member invitation" --from gov1
# )

# # oracle invitation

# echo Propose a new MintLimit for IST-AUSD
# NEW_MINT_LIMIT=123456 # IST whole numbers
# PROPOSAL_OFFER=$(mktemp -t agops.XXX)
# agops psm proposeChangeMintLimit --limit $NEW_MINT_LIMIT --deadline 1 --previousOfferId "$CHARTER_OFFER_ID" >|"$PROPOSAL_OFFER"
# # agoric wallet print --file "$PROPOSAL_OFFER"
# agops perf satisfaction --executeOffer "$PROPOSAL_OFFER" --from gov1 --keyring-backend="test"
# # agoric follow -F :published.committees.Economic_Committee.latestQuestion

# test_val $(agoric follow -F :published.committees.Economic_Committee.latestQuestion -o jsonlines | jq -r .positions[0].changes.MintLimit.value) 123456000000

# echo Vote to enact the new MintLimit 1000
# agops ec vote --forPosition 0 --send-from gov1
# agops ec vote --forPosition 0 --send-from gov2
# agops ec vote --forPosition 0 --send-from gov3

# # agoric wallet show --from $GOV1ADDR

# # agops psm info
# test_val $(agoric follow -F :published.psm.IST.AUSD.governance -o jsonlines | jq -r '.current.MintLimit.value.value') 123456000000