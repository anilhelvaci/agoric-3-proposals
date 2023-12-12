// @ts-check
// XMPORT: { E } from '@endo/far';

const fail = (msg) => {
  throw Error(msg);
};

const { fromEntries, keys, values } = Object;

/** @type {<X, Y>(xs: X[], ys: Y[]) => [X, Y][]} */
const zip = (xs, ys) => harden(xs.map((x, i) => [x, ys[+i]]));

/**
 * @type {<T extends Record<string, ERef<any>>>(
 *   obj: T,
 * ) => Promise<{ [K in keyof T]: Awaited<T[K]> }>}
 */
const allValues = async (obj) => {
  const resolved = await Promise.all(values(obj));
  // @ts-expect-error cast
  return harden(fromEntries(zip(keys(obj), resolved)));
};

const logger = (...args) => {
  console.log('[CRABBLE_CORE_EVAL]', ...args);
};

/**
 * @template T
 * @typedef {{
 *   resolve: (v: ERef<T>) => void;
 *   reject: (r: unknown) => void;
 *   reset: (reason?: unknown) => void;
 * }} ProducerX<T>
 */

/**
 * @param {{
 *   consume: {
 *     agoricNames: ERef<XMPORT('@agoric/vats').NameHub>;
 *     board: ERef<XMPORT('@agoric/vats').Board>;
 *     startUpgradable: Promise<Function>;
 *     namesByAddressAdmin: ERef<XMPORT('@agoric/vats').NameAdmin>;
 *   };
 *   instance: { produce: Record<'CrabbleCommittee', ProducerX<Instance>> }
 * }} powers
 * @param {*} config
 * @param {ERef<StorageNode>} crabbleNode
 */
const startCommittee = async (
  {
    consume: {
      board,
      // namesByAddress should suffice, but...
      // https://github.com/Agoric/agoric-sdk/issues/8113
      namesByAddressAdmin,
      startUpgradable,
    },
    installation: {
      consume: { committee: committeeInstallationP },
    },
    instance: { produce: produceInstance },
  },
  config,
  crabbleNode,
) => {
  const committeeSize = 3;
  const committeeName = "CrabbleCommittee";
  const members = ["agoric1ag5a8lhn00h4u9h2shpfpjpaq6v4kku54zk69m","agoric140y0mqnq7ng5vvxxwpfe67988e5vqar9whg309","agoric1wqfu6hu5q2qtey9jtjapaae4df9zd492z4448k"];

  logger('Getting nameHubs, depositFacets...');
  const getDepositFacet = async (address) => {
    const hub = E(E(namesByAddressAdmin).lookupAdmin(address)).readonly();
    return E(hub).lookup('depositFacet');
  };
  const memberDeposits = await Promise.all(members.map(getDepositFacet));

  logger('Gathering info...');
  const { committeeInstallation, marshaller, committeeNode } = await allValues({
    committeeInstallation: committeeInstallationP,
    marshaller: E(board).getPublishingMarshaller(),
    committeeNode: E(crabbleNode).makeChildNode('committee'),
  });

  logger('Starting committee...');
  const committeeKit = await E(startUpgradable)({
    installation: committeeInstallation,
    terms: { committeeSize, committeeName },
    privateArgs: { storageNode: committeeNode, marshaller },
    label: committeeName,
  });
  logger({ committeeKit });

  logger('Updating agoricNames with committee instance...');
  produceInstance.CrabbleCommittee.resolve(committeeKit.instance);

  logger('Getting the member and voter invitations...');
  const voterInvitations = await E(
    committeeKit.creatorFacet,
  ).getVoterInvitations();

  logger('Sending committeeinvitations...');
  await Promise.all(
    zip(memberDeposits, voterInvitations).map(([depositFacet, invitation]) =>
      E(depositFacet).receive(invitation),
    ),
  );

  logger('Done.');
  return { committeeCreatorFacet: committeeKit.creatorFacet, memberDeposits };
};

/**
 *
 * @param {{
 *   consume: {
 *     zoe: Promise<ZoeService>;
 *     board: ERef<XMPORT('@agoric/vats').Board>,
 *     startCrabbleGovernedUpgradable: Promise<Function>,
 *     chainTimerService: ERef<XMPORT('@agoric/time/src/types').TimerService>;
 *     agoricNames: ERef<XMPORT('@agoric/vats').NameHub>;
 *   },
 *   instance: { produce: Record<'Crabble' | 'CrabbleGovernor', ProducerX<Instance>>}
 * }} powers
 * @param {*} config
 * @param {ERef<StorageNode>} crabbleNode
 * @param {Promise<{
 *   committeeCreatorFacet: ERef<any>;
 *   memberDeposits: ERef<DepositFacet>[]
 * }>} committeeInfoP
 */
const startCrabble = async (powers, config, crabbleNode, committeeInfoP) => {
  const contractBundleID = "b1-3af8183538129ce433d368dc0bdb6082733fc0fa6449c18d5f212f104f971d8ea8b033074067b807bffd5eb2f17821c5e2e9b26ba312795368ae8e7446606b85";
  const governorBundleID = "b1-0bfb8a189cda652bc43c488e079e6362870e49039a247156f9430f4f0dfa054970f01c108b79c476baddc8b814546ad88578358452fe2919d11fdcc224bbe4b3";

  const {
    consume: {
      board,
      startCrabbleGovernedUpgradable,
      zoe: zoeI, // only used for installation, not for startInstance
      chainTimerService,
      agoricNames: agoricNamesP,
    },
    instance: { produce: produceInstance },
  } = powers;
  logger('Gathering info...');
  const {
    contractInstallation,
    governorInstallation,
    binaryVoteCounterInstallation,
    committeeInstallation,
    marshaller,
    timer,
    info: { committeeCreatorFacet, memberDeposits },
    agoricNames,
  } = await allValues({
    contractInstallation: E(zoeI).installBundleID(contractBundleID),
    governorInstallation: E(zoeI).installBundleID(governorBundleID),
    binaryVoteCounterInstallation: E(agoricNamesP).lookup(
      'installation',
      'binaryVoteCounter',
    ),
    committeeInstallation: E(agoricNamesP).lookup('installation', 'committee'),
    marshaller: E(board).getPublishingMarshaller(),
    timer: chainTimerService,
    info: committeeInfoP,
    agoricNames: agoricNamesP,
  });

  logger({
    contractInstallation,
    binaryVoteCounterInstallation,
    committeeInstallation,
    marshaller,
    crabbleNode,
  });

  logger('---Starting Crabble with governor---');
  const crabbleTerms = {
    agoricNames,
  };

  const crabblePrivateArgs = {
    storageNode: crabbleNode,
    marshaller,
    timer,
  };

  logger({
    crabbleTerms,
    crabblePrivateArgs,
  });

  logger('Deeply fulfill governorTerms...');
  const governorTerms = harden({
    timer, // ISSUE: TIMER IN TERMS
    governedContractInstallation: contractInstallation,
    binaryVoteCounterInstallation,
  });

  logger({
    governorTerms,
  });

  logger('Starting governor, governed...');
  const kit = await E(startCrabbleGovernedUpgradable)({
    installation: contractInstallation,
    committeeCreatorFacet,
    contractGovernor: governorInstallation,
    governorTerms,
    terms: crabbleTerms,
    privateArgs: crabblePrivateArgs,
    label: 'Crabble',
  });

  logger({
    kit,
  });

  logger('Updating agoricNames with instances...');
  produceInstance.Crabble.resolve(kit.instance);
  produceInstance.CrabbleGovernor.resolve(kit.governor);

  logger('Sending member invitations...');
  await Promise.all(
    memberDeposits.map(async (df) => {
      const inv = await E(
        kit.governorCreatorFacet,
      ).makeCommitteeMemberInvitation();
      return E(df).receive(inv);
    }),
  );

  logger('Done.');
};

harden(startCrabble);

const start = async (powers, config) => {
  const {
    consume: { chainStorage },
  } = powers;
  const crabbleNode = await E(chainStorage).makeChildNode('crabble');

  const committeeInfo = startCommittee(powers, config, crabbleNode);
  await startCrabble(powers, config, crabbleNode, committeeInfo);
};
harden(start);

start;
