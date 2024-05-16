#!/bin/bash

set -e

source /usr/src/upgrade-test-scripts/env_setup.sh

YARN_IGNORE_NODE=1 yarn ava test-defaultParams.js