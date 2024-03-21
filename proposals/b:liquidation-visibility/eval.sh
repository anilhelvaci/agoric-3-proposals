#!/bin/bash

# Exit when any command fails
set -e

source /usr/src/upgrade-test-scripts/env_setup.sh

ls -al

# XXX using Ava serial to script the core-eval
# XXX move the eval to TEST phase for now
# XXX because an upgrade breaks the ATOM VM's debt limit
#yarn ava test-liquidation-visibility.js

