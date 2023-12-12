/* eslint-disable no-shadow */
/**
 * @file Add support for starting governed contracts to the Agoric bootstrap /
 *   CoreEval "promise space".
 */

// @ts-check
// XMPORT: { E } from '@endo/far';

// XMPORT { CONTRACT_ELECTORATE, ParamTypes } from '@agoric/governance';
const CONTRACT_ELECTORATE = 'Electorate';
const ParamTypes = /** @type {const} */ ({
  INVITATION: 'invitation',
});

const { fromEntries, entries } = Object;

/** @type { <T extends Record<string, ERef<any>>>(obj: T) => Promise<{ [K in keyof T]: Awaited<T[K]>}> } */
const allValues = async obj => {
  const es = await Promise.all(
    entries(obj).map(async ([k, v]) => [k, await v]),
  );
  return fromEntries(es);
};

const logger = (message) => {
  console.log('[PRODUCE_UPGRADABLE_STARTER]', message);
};

/**
 * @template SF @typedef
 *   {XMPORT('@agoric/zoe/src/zoeService/utils').StartResult<SF>}
 *   StartResult<SF>
 */
/**
 * @typedef {StartResult<
 *   typeof XMPORT('@agoric/governance/src/committee.js').start
 * >} CommitteeStart
 */

/**
 * Like startGovernedInstance but with parameterized committeeCreatorFacet
 *
 * @template {GovernableStartFn} SF
 * @param {{
 *   zoe: ERef<ZoeService>;
 *   governedContractInstallation: ERef<Installation<SF>>;
 *   issuerKeywordRecord?: IssuerKeywordRecord;
 *   terms: Record<string, unknown>;
 *   privateArgs: any; // TODO: connect with Installation type
 *   label: string;
 * }} zoeArgs
 * @param {{
 *   governedParams: Record<string, unknown>;
 *   timer: ERef<XMPORT('@agoric/time/src/types').TimerService>;
 *   contractGovernor: ERef<Installation>;
 *   governorTerms: Record<string, unknown>;
 *   committeeCreatorFacet: CommitteeStart['creatorFacet'];
 * }} govArgs
 * @returns {Promise<GovernanceFacetKit<SF>>}
 */
const startMyGovernedInstance = async (
  {
    zoe,
    governedContractInstallation,
    issuerKeywordRecord,
    terms,
    privateArgs,
    label,
  },
  {
    governedParams,
    timer,
    contractGovernor,
    governorTerms,
    committeeCreatorFacet,
  },
) => {
  const logger = (message) => {
    console.log('[START_GOVERNED_INSTANCE]', message);
  };

  logger('Getting poser invitation...');
  const poserInvitationP = E(committeeCreatorFacet).getPoserInvitation();
  const [initialPoserInvitation, electorateInvitationAmount] =
    await Promise.all([
      poserInvitationP,
      E(E(zoe).getInvitationIssuer()).getAmountOf(poserInvitationP),
    ]);

  logger('Fulfilling governor terms...');
  const fullGovernorTerms = await allValues({
    timer,
    governedContractInstallation,
    governed: {
      terms: {
        ...terms,
        governedParams: {
          [CONTRACT_ELECTORATE]: {
            type: ParamTypes.INVITATION,
            value: electorateInvitationAmount,
          },
          ...governedParams,
        },
      },
      issuerKeywordRecord,
      label,
    },
    ...governorTerms,
  });

  logger('Starting governor...');
  const governorFacets = await E(zoe).startInstance(
    contractGovernor,
    {},
    fullGovernorTerms,
    harden({
      economicCommitteeCreatorFacet: committeeCreatorFacet,
      governed: await allValues({
        ...privateArgs,
        initialPoserInvitation,
      }),
    }),
    `${label}-governor`,
  );

  logger('Getting facets...');
  const [instance, publicFacet, creatorFacet, adminFacet] = await Promise.all([
    E(governorFacets.creatorFacet).getInstance(),
    E(governorFacets.creatorFacet).getPublicFacet(),
    E(governorFacets.creatorFacet).getCreatorFacet(),
    E(governorFacets.creatorFacet).getAdminFacet(),
  ]);
  /** @type {GovernanceFacetKit<SF>} */
  const facets = harden({
    instance,
    publicFacet,
    governor: governorFacets.instance,
    creatorFacet,
    adminFacet,
    governorCreatorFacet: governorFacets.creatorFacet,
    governorAdminFacet: governorFacets.adminFacet,
  });
  return facets;
};

/**
 * @param {BootstrapSpace & {
 *   produce: {
 *     startMyGovernedUpgradable: Producer<Function>;
 *   };
 * }} powers
 */
const produceStartMyGovernedUpgradable = async ({
  consume: { chainTimerService, governedContractKits, diagnostics, zoe },
  produce, // startMyGovernedUpgradable
}) => {
  logger('Producing governed upgradable...');
  /**
   * @template {GovernableStartFn} SF
   * @param {StartGovernedUpgradableOpts<SF> & {
   *   committeeCreatorFacet: CommitteeStart['creatorFacet'];
   *   contractGovernor: ERef<Installation>;
   *   governorTerms: Record<string, unknown>;
   * }} opts
   */
  const startGovernedUpgradable = async ({
    installation,
    issuerKeywordRecord,
    committeeCreatorFacet,
    contractGovernor,
    governorTerms,
    governedParams,
    terms,
    privateArgs,
    label,
  }) => {
    const contractKits = await governedContractKits;
    logger('Init startMyGovernedInstance...');
    const facets = await startMyGovernedInstance(
      {
        zoe,
        governedContractInstallation: installation,
        issuerKeywordRecord,
        terms,
        privateArgs,
        label,
      },
      {
        governedParams,
        timer: chainTimerService,
        contractGovernor,
        committeeCreatorFacet,
        governorTerms,
      },
    );
    logger('Updating contractKits...');
    const kit = harden({ ...facets, label });
    contractKits.init(facets.instance, kit);

    logger('Updating diagnostics...');
    await E(diagnostics).savePrivateArgs(kit.instance, privateArgs);
    await E(diagnostics).savePrivateArgs(kit.governor, {
      committeeCreatorFacet: await committeeCreatorFacet,
    });

    return facets;
  };

  produce.startMyGovernedUpgradable.resolve(harden(startGovernedUpgradable));
  logger('Done.');
};
harden(produceStartMyGovernedUpgradable);

// script completion value
produceStartMyGovernedUpgradable;
