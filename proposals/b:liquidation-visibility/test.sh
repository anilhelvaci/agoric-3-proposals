#!/bin/bash

set -e

source /usr/src/upgrade-test-scripts/env_setup.sh

yarn test:eval -m "fund user1 before the upgrade"
yarn test:post-liq
yarn test:post
