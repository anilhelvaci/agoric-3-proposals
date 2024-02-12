#!/bin/bash
# Start and leave agd running

grep -qF 'env_setup.sh' /root/.bashrc || echo "source /usr/src/upgrade-test-scripts/env_setup.sh" >>/root/.bashrc
grep -qF 'printKeys' /root/.bashrc || echo "printKeys" >>/root/.bashrc

source ./env_setup.sh

# start_agd never builds an image so it's safe to include this multigigabyte logfile
export SLOGFILE=slog.slog

# don't use startAgd() because that backgrounds
echo "Starting agd in foreground"
agd start --log_level warn "$@"
