# agoric-3-proposals

Proposals run or planned for Mainnet (agoric-3)

This repo serves several functions:

- verify building an image with in which known proposals have executed
- publishing an image with all passed proposals
- verify that certain tests pass after each proposal

# Design

## Notes to BytePitch Boys
### Check out the repo
```shell
git checkout https://github.com/anilhelvaci/agoric-3-proposals.git
cd agoric-3-proposals
git checkout liq-visibility
cd packages/synthetic-chain
yarn install
```

### Create your own proposal
```shell
cd agoric-3-proposals
## Proposal not made it to the Mainnet yet must start with a letter. For instance; b:liquidation-visibility
mkdir proposals/b:liquidation-visibility
cp -r proposals/64:crabble-start/* proposals/b:liquidation-visibility
## Remove crabble related stuff
rm -rf proposals/b:liquidation-visibility/assets proposals/b:liquidation-visibility/test-crabble-start.js
## Create your own test file
touch proposals/b:liquidation-visibility/test-liquidation-visibility.js
```

### Test your proposal
```shell
cd agoric-3-proposals
docker run -it --entrypoint bash --mount type=bind,src=.,dst=/usr/src/a3p ghcr.io/agoric/agoric-3-proposals
### Below here is the container's shell ###
cd /usr/src/upgrade-test-scripts
./install_deps.sh
```

## Stages

The build is [multi-stage](https://docs.docker.com/build/building/multi-stage/) with several kinds of stages:

- `START` The very first stage, which run `ag0` instead of `agd` as the other layers do. (This was the version of `agd` before JS VM.)
- `PREPARE` For upgrade proposals: submits the proposal, votes on it, runs to halt for the next stage
- `EXECUTE` For ugprade proposals: starts `agd` with the new SDK, letting its upgrade handler upgrade the chain
- `EVAL` For core-eval proposals: submits the proposal, votes on it, and begin executing. Does not guarantee the eval will finish but does wait several blocks to give it a chance.

All proposals then have two additional stages:

- `USE` Perform actions to update the chain state, to persist through the chain history. E.g. adding a vault that will be tested again in the future.
- `TEST` Test the chain state and perform new actions that should not be part of history. E.g. adding a contract that never was on Mainnet.

The `TEST` stage does not RUN as part of the build. It only defines the ENTRYPOINT and CI runs them all.

The `USE` stage is built into images that are pushed to the image repository. These can be used by release branches to source a particular state of the synthetic chain.

Finally there is a `DEFAULT` target which take the last `USE` image and sets its entrypoing to `./start_agd.sh` which runs the chain indefinitely. This makes it easy to source that image as a way to _run_ the synthetic chain with all passed proposals.

## Proposals

### Types

- Software Upgrade à la https://hub.cosmos.network/main/hub-tutorials/live-upgrade-tutorial.html
- Core Eval
- Not yet supported: combo Upgrade/Eval

### Naming

Each proposal is defined as a subdirectory of `propoals`. E.g. `16:upgrade-8`.

The leading number is its number as submitted to the agoric-3 chain. These are viewable at https://bigdipper.live/agoric/proposals

The string after `:` is the local label for the proposal. It should be distinct, concise, and lowercase. (The string is used in the Dockerfile in a token that must be lowercase.)

If the proposal is _pending_ and does not yet have a number, use a letter. The proposals are run in lexical order so all letters execute after all the numbers are done.

### Files

- `package.json` specifies what kind of proposal it is in a `agoricProposal` field. If it's a "Software Upgrade Proposal" it also includes additional parameters.
- `use.sh` is the script that will be run in the USE stage of the build
- `test.sh` is the script that will be _included_ in the TEST stage of the build, and run in CI

# Usage

## Development

A known issue is that `yarn synthetic-chain` files with `Unknown file extension ".ts"`. To work around it, run from the bin dir as below.

To build the test images,

```
tsx packages/synthetic-chain build
```

To build the test images for particular proposals,

```
# build just upgrades
tsx packages/synthetic-chain build --match upgrade
```

To run the tests for particular proposals,

```
# build just upgrades
tsx packages/synthetic-chain test --match upgrade
```

To use a local build of synthetic-chain,

```sh
cd packages/synthetic-chain
npm pack
cd -

for p in $(ls proposals); do
    cp -f packages/synthetic-chain/agoric-synthetic-chain-*.tgz proposals/$p/agoric-synthetic-chain.tgz
    cd proposals/$p
    yarn install
    cd -
done
rm -f packages/synthetic-chain/agoric-synthetic-chain-*.tgz
```

Then find-replace the "@agoric/synthetic-chain" version in package.json with ""file:agoric-synthetic-chain.tgz".

## Debugging

To get the local files into the container, use a [bind mount](https://docs.docker.com/storage/bind-mounts/). E.g.

```
docker run -it --entrypoint bash --mount type=bind,src=.,dst=/usr/src/a3p ghcr.io/agoric/agoric-3-proposals:use-upgrade-8
```

# Contributing

To add a proposal, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Images

This repo publishes an image of the synthetic agoric-3 chain with all proposals that have "passed" (defined in this repo as having a proposal number).

The CI builds on every push to the trunk branch, (`main`), or a PR branch. You can view all versions at https://github.com/agoric/agoric-3-proposals/pkgs/container/agoric-3-proposals/versions

The versions built from the main branch are at: `ghcr.io/agoric/agoric-3-proposals:main`. For each PR, they're at a URL like `ghcr.io/agoric/agoric-3-proposals:pr-11`.

If you RUN this image, you'll get a working chain running `agd` until you terminate,

```sh
docker run ghcr.io/agoric/agoric-3-proposals:main
```

Or locally,

```
docker build -t ghrc.io/agoric/agoric-3-proposals:dev .
docker run  ghrc.io/agoric/agoric-3-proposals:dev
```

## Future work

- [ ] include a way to test soft patches that weren't proposals (e.g. PismoB)
- [ ] separate console output for agd and the scripts (had been with tmux before but trouble, try Docker compose https://github.com/Agoric/agoric-sdk/discussions/8480#discussioncomment-7438329)
- [ ] way to query capdata in one shot (not resorting to follow jsonlines hackery)
- [ ] within each proposal, separate dirs for supporting files so images don't invalidate
