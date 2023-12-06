/* eslint-disable no-undef */
const upgradeCrabble = async ({
  consume: {
    agoricNames,
    governedContractKits: governedContractKitsP,
    instancePrivateArgs: instancePrivateArgsP,
  },
}) => {
  const logger = (log) => {
    console.log('[UPGRADE_CRABBLE_CORE_EVAL]', log);
  };

  const crabbleV2 =
    '041f3c030f3a93166304411a3fbe1b54cb2acc7f7124e4b963cd4a43d7ea2ad1c4a2bcc64491799f30eadee31104bf2b10bac4e3a158afff234a4c0e37707651';
  const [governedContractKits, instancePrivateArgs, crabbleInstance] =
    await Promise.all([
      governedContractKitsP,
      instancePrivateArgsP,
      E(agoricNames).lookup('instance', 'Crabble'),
    ]);

  logger('Getting Crabble Info...');
  const [crabbleKit, crabblePrivateArgs] = await Promise.all([
    E(governedContractKits).get(crabbleInstance),
    E(instancePrivateArgs).get(crabbleInstance),
  ]);

  logger('CRABBLE_INFO');
  logger({ crabbleKit, crabblePrivateArgs });

  const upgradeResult = await E(crabbleKit.adminFacet).upgradeContract(
    `b1-${crabbleV2}`,
    crabblePrivateArgs,
  );
  logger({ upgradeResult });
};

harden(upgradeCrabble);
upgradeCrabble;
