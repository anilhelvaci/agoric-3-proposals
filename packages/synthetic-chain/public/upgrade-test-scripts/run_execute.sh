#!/bin/bash

# figlet -f cyberlarge Execute upgrade
echo -e '
 _______ _     _ _______ _______ _     _ _______ _______
 |______  \___/  |______ |       |     |    |    |______
 |______ _/   \_ |______ |_____  |_____|    |    |______

 _     _  _____   ______  ______ _______ ______  _______
 |     | |_____] |  ____ |_____/ |_____| |     \ |______
 |_____| |       |_____| |    \_ |     | |_____/ |______
'
echo "Execute the upgrade in consensus"

source ./env_setup.sh

startAgd

echo "Run several blocks for the upgrade to settle, then exit"
waitForBlock 5
killAgd
