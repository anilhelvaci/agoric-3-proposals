import test from "ava";

test.todo('checksum from repo matches local one');
test.todo('unarchive .tar and copy content under agoric-sdk');
/**
 * Bundle hash of the vaultFactory copied from .tar must match with the one
 * used for incarnation 1.
 */
test.todo('make sure bundle hashes match');

/**
 * - copy mutated vaultFactory.js and auctioneer.js to relevant addresses
 * - agoric run on both of them
 */
test.todo('build proposal for timer upgrades');

/**
 * - ensure enough IST
 * - install bundles
 * - submit proposal
 * - vote
 * - check incarnation numbers
 *    - 1 for auctioneer, 2 for vaultFactory
 */
test.todo('deploy incarnation 2');