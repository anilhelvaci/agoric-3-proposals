// This is generated by writeCoreProposal; please edit!
/* eslint-disable */

const manifestBundleRef = {bundleID:"b1-7a5b067832fe1e968aca362ad713126737c3f0289dba7b527e0d23648b9419395c16399eed9358d5c555d29d2724561c12902dc2c960eca1bc4f0deee373a5c8"};
const getManifestCall = harden([
  "getManifestVaultsUpgrade",
  {
    vaultFactoryRef: {
      bundleID: "b1-6874b3846d9b293af2e687b168ac825dc19e027f949b10e9c766507db604246c90866428581b94e068779f4dabbf6dd9da5b4161e483a50c6525c8a53edc3025",
    },
  },
]);
const customManifest = {
  upgradeVaultsLiquidationVisibility: {
    consume: {
      vaultFactoryKit: "to upgrade vaultFactory using its adminFacet",
    },
  },
};

// Make a behavior function and "export" it by way of script completion value.
// It is constructed by an anonymous invocation to ensure the absence of a global binding
// for makeCoreProposalBehavior, which may not be necessary but preserves behavior pre-dating
// https://github.com/Agoric/agoric-sdk/pull/8712 .
const behavior = (({
  manifestBundleRef,
  getManifestCall: [manifestGetterName, ...manifestGetterArgs],
  customManifest,
  E,
  log = console.info,
  customRestoreRef,
}) => {
  const { entries, fromEntries } = Object;

  // deeplyFulfilled is a bit overkill for what we need.
  const shallowlyFulfilled = async obj => {
    if (!obj) {
      return obj;
    }
    const ents = await Promise.all(
      entries(obj).map(async ([key, valueP]) => {
        const value = await valueP;
        return [key, value];
      }),
    );
    return fromEntries(ents);
  };

  const makeRestoreRef = (vatAdminSvc, zoe) => {
    /** @type {(ref: import\('./externalTypes.js').ManifestBundleRef) => Promise<Installation<unknown>>} */
    const defaultRestoreRef = async bundleRef => {
      // extract-proposal.js creates these records, and bundleName is
      // the optional name under which the bundle was installed into
      // config.bundles
      const bundleIdP =
        'bundleName' in bundleRef
          ? E(vatAdminSvc).getBundleIDByName(bundleRef.bundleName)
          : bundleRef.bundleID;
      const bundleID = await bundleIdP;
      const label = bundleID.slice(0, 8);
      return E(zoe).installBundleID(bundleID, label);
    };
    return defaultRestoreRef;
  };

  /** @param {ChainBootstrapSpace & BootstrapPowers & { evaluateBundleCap: any }} powers */
  const coreProposalBehavior = async powers => {
    // NOTE: `powers` is expected to match or be a superset of the above `permits` export,
    // which should therefore be kept in sync with this deconstruction code.
    // HOWEVER, do note that this function is invoked with at least the *union* of powers
    // required by individual moduleBehaviors declared by the manifest getter, which is
    // necessary so it can use `runModuleBehaviors` to provide the appropriate subset to
    // each one (see ./writeCoreProposal.js).
    // Handle `powers` with the requisite care.
    const {
      consume: { vatAdminSvc, zoe, agoricNamesAdmin },
      evaluateBundleCap,
      installation: { produce: produceInstallations },
      modules: {
        utils: { runModuleBehaviors },
      },
    } = powers;

    // Get the on-chain installation containing the manifest and behaviors.
    log('evaluateBundleCap', {
      manifestBundleRef,
      manifestGetterName,
      vatAdminSvc,
    });
    let bcapP;
    if ('bundleName' in manifestBundleRef) {
      bcapP = E(vatAdminSvc).getNamedBundleCap(manifestBundleRef.bundleName);
    } else if ('bundleID' in manifestBundleRef) {
      bcapP = E(vatAdminSvc).getBundleCap(manifestBundleRef.bundleID);
    } else {
      const keys = Reflect.ownKeys(manifestBundleRef).map(key =>
        typeof key === 'string' ? JSON.stringify(key) : String(key),
      );
      const keysStr = `[${keys.join(', ')}]`;
      throw Error(
        `bundleRef must have own bundleName or bundleID, missing in ${keysStr}`,
      );
    }
    const bundleCap = await bcapP;

    const proposalNS = await evaluateBundleCap(bundleCap);

    // Get the manifest and its metadata.
    log('execute', {
      manifestGetterName,
      bundleExports: Object.keys(proposalNS),
    });
    const restoreRef = customRestoreRef || makeRestoreRef(vatAdminSvc, zoe);
    const {
      manifest,
      options: rawOptions,
      installations: rawInstallations,
    } = await proposalNS[manifestGetterName](
      harden({ restoreRef }),
      ...manifestGetterArgs,
    );

    // Await references in the options or installations.
    const [options, installations] = await Promise.all(
      [rawOptions, rawInstallations].map(shallowlyFulfilled),
    );

    // Publish the installations for our dependencies.
    const installationEntries = entries(installations || {});
    if (installationEntries.length > 0) {
      const installAdmin = E(agoricNamesAdmin).lookupAdmin('installation');
      await Promise.all(
        installationEntries.map(([key, value]) => {
          produceInstallations[key].resolve(value);
          return E(installAdmin).update(key, value);
        }),
      );
    }

    // Evaluate the manifest.
    return runModuleBehaviors({
      // Remember that `powers` may be arbitrarily broad.
      allPowers: powers,
      behaviors: proposalNS,
      manifest: customManifest || manifest,
      makeConfig: (name, _permit) => {
        log('coreProposal:', name);
        return { options };
      },
    });
  };

  return coreProposalBehavior;
})({ manifestBundleRef, getManifestCall, customManifest, E });
behavior;