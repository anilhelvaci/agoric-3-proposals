/* eslint-disable no-undef */
const startCrabble = async ({
  consume: {
    board,
    zoe,
    chainStorage: chainStorageP,
    chainTimerService,
    agoricNamesAdmin,
    agoricNames: agoricNamesP,
    namesByAddressAdmin: namesByAddressAdminP,
    contractKits: contractKitsP,
    governedContractKits,
    diagnostics,
  },
}) => {
  const logger = (log) => {
    console.log('[CRABBLE_CORE_EVAL]', log);
  };
  // vars = [crabble, governor]
  const vars = ["9ef6df6021cabaece3a53065bbc4e1f68f0e109498861b814e26077422c89a5c1f7a6717875f7c9b35197cb36ba87dd424d927ef9230c9227bb7fdf4dcd0cdf0", "cf4a0089e2d715a5c4460760cdb054d72f74b8fd330fece0bfd5e8fd82190c3c16e37eb1c31aab9734df81de9277721ce1d3dc7f5c8c7513349f5355e948978c"];
  const members = ["agoric1kupk4yyvnl3h80j753705nfm2nfxff5vktvd3z", "agoric10xh9n8qzjsxg9k5txdmvtj5kfr3092j8mptr7g", "agoric1890064p6j3xhzzdf8daknd6kpvhw766ds8flgw"];

  logger('Settling privileges...');
  const [
    namesByAddressAdmin,
    chainStorage,
    agoricNames,
    contractKits,
    timerBrand,
  ] = await Promise.all([
    namesByAddressAdminP,
    chainStorageP,
    agoricNamesP,
    contractKitsP,
    E(chainTimerService).getTimerBrand(),
  ]);

  logger({ namesByAddressAdmin, chainStorage, agoricNames, contractKits });

  const crabbleNode = await E(chainStorage).makeChildNode('crabble');

  logger('Getting nameHubs...');
  const mem1NameHub = E(
    E(namesByAddressAdmin).lookupAdmin(members[0]),
  ).readonly();
  const mem2NameHub = E(
    E(namesByAddressAdmin).lookupAdmin(members[1]),
  ).readonly();
  const mem3NameHub = E(
    E(namesByAddressAdmin).lookupAdmin(members[2]),
  ).readonly();

  const [mem1DepositFacet, mem2DepositFacet, mem3DepositFacet] =
    await Promise.all([
      E(mem1NameHub).lookup('depositFacet'),
      E(mem2NameHub).lookup('depositFacet'),
      E(mem3NameHub).lookup('depositFacet'),
    ]);

  logger('Gathering info...');
  const [
    contractInstallation,
    governorInstallation,
    binaryVoteCounterInstallation,
    committeeInstallation,
    marshaller,
    committeeNode,
    timer,
  ] = await Promise.all([
    E(zoe).installBundleID(`b1-${vars[0]}`),
    E(zoe).installBundleID(`b1-${vars[1]}`),
    E(agoricNames).lookup('installation', 'binaryVoteCounter'),
    E(agoricNames).lookup('installation', 'committee'),
    E(board).getPublishingMarshaller(),
    E(crabbleNode).makeChildNode('committee'),
    chainTimerService,
  ]).catch((err) => logger(err));

  logger({
    contractInstallation,
    governorInstallation,
    binaryVoteCounterInstallation,
    committeeInstallation,
    marshaller,
    crabbleNode,
    committeeNode,
  });

  const instanceAdminP = E(agoricNamesAdmin).lookupAdmin('instance');

  logger('Starting committee...');
  const committeeKit = await E(zoe).startInstance(
    committeeInstallation,
    {},
    {
      committeeSize: 3,
      committeeName: 'Crabble Committee',
    },
    {
      storageNode: committeeNode,
      marshaller,
    },
  );
  logger({ committeeKit });

  logger('Getting poser invitation...');
  const initialPoserInvitation = await E(
    committeeKit.creatorFacet,
  ).getPoserInvitation();
  const initialPoserInvitationAmount = await E(
    E(zoe).getInvitationIssuer(),
  ).getAmountOf(initialPoserInvitation);

  logger({ initialPoserInvitation, initialPoserInvitationAmount });

  logger('---Starting Crabble with governor---');
  const crabbleTerms = {
    governedParams: {
      Electorate: {
        type: 'invitation',
        value: initialPoserInvitationAmount,
      },
    },
    agoricNames,
  };

  const crabblePrivateArgs = {
    storageNode: crabbleNode,
    marshaller,
    timer,
    initialPoserInvitation,
  };

  logger({
    crabbleTerms,
    crabblePrivateArgs,
  });

  logger('Deeply fulfill governorTerms...');
  const governorTerms = harden({
    timerBrand,
    governedContractInstallation: contractInstallation,
    governed: {
      terms: crabbleTerms,
      issuerKeywordRecord: {},
      label: 'Crabble',
    },
    binaryVoteCounterInstallation,
  });

  logger({
    governorTerms,
  });

  logger('Starting governor...');
  const governorKit = await E(zoe).startInstance(
    governorInstallation,
    {},
    governorTerms,
    harden({
      governed: crabblePrivateArgs,
    }),
    'Crabble',
  );

  logger({
    governorKit,
  });

  logger('Getting crabbleKit...');
  const [instance, publicFacet, creatorFacet, adminFacet] = await Promise.all([
    E(governorKit.creatorFacet).getInstance(),
    E(governorKit.creatorFacet).getPublicFacet(),
    E(governorKit.creatorFacet).getCreatorFacet(),
    E(governorKit.creatorFacet).getAdminFacet(),
  ]);

  const kit = harden({
    instance,
    publicFacet,
    creatorFacet,
    adminFacet,
    governor: governorKit.instance,
    governorCreatorFacet: governorKit.creatorFacet,
    governorAdminFacet: governorKit.adminFacet,
    label: 'GovernedCrabble',
  });

  logger('Updating agoricNames with instances...');
  await Promise.all([
    E(instanceAdminP).update('Crabble', instance),
    E(instanceAdminP).update('CrabbleGovernor', governorKit.instance),
    E(instanceAdminP).update('CrabbleCommittee', committeeKit.instance),
  ]);

  logger('Updating diagnostics...');
  await E(diagnostics).savePrivateArgs(instance, crabblePrivateArgs);
  await E(diagnostics).savePrivateArgs(governorKit.instance, {
    economicCommitteeCreatorFacet: committeeKit.creatorFacet,
  });

  logger('Getting the member and voter invitations...');
  const [voterInvitations, mem1Invite, mem2Invite, mem3Invite] =
    await Promise.all([
      E(committeeKit.creatorFacet).getVoterInvitations(),
      E(governorKit.creatorFacet).makeCommitteeMemberInvitation(),
      E(governorKit.creatorFacet).makeCommitteeMemberInvitation(),
      E(governorKit.creatorFacet).makeCommitteeMemberInvitation(),
    ]);

  logger('Updating contractKits...');
  await Promise.all([
    E(governedContractKits).init(instance, kit),
    E(contractKits).init(committeeKit.instance, committeeKit),
  ]);

  logger('Sending invitations...');
  await Promise.all([
    E(mem1DepositFacet).receive(voterInvitations[0]),
    E(mem1DepositFacet).receive(mem1Invite),
    E(mem2DepositFacet).receive(voterInvitations[1]),
    E(mem2DepositFacet).receive(mem2Invite),
    E(mem3DepositFacet).receive(voterInvitations[2]),
    E(mem3DepositFacet).receive(mem3Invite),
  ]);

  logger('Done.');
};

harden(startCrabble);

startCrabble;
