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
    installation: { consume: { committee: committeeInstallationP } },
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
 *     startMyGovernedUpgradable: Promise<Function>,
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
  // eslint-disable-next-line
  const contractBundleID = "b1-46f82a8b8348f7c2dcae1ddc1ace085f5f489d493f7df24ce8f2334199b21eeb9ed848de5e2814f200ba47470ff3bd83b08d74055da2a454f94c2a0c565bf557";
  // eslint-disable-next-line
  const governorBundleID = "b1-bde789b8f6623f2352dc2d4a781f39066bbb63366602ac3c70943760418a9c7e63b8d9cfad6c8601e418ec5dfd29f1b62b2419bd2cd7f5907f59a62aff37e332";

  const {
    consume: {
      board,
      startMyGovernedUpgradable,
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
  const kit = await E(startMyGovernedUpgradable)({
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
