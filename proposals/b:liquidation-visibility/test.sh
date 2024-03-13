#!/bin/bash

set -e

source /usr/src/upgrade-test-scripts/env_setup.sh

yarn test test-liquidation-visibility.js
yarn test post.liquidation.js
yarn test post.test.js
