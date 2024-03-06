import { makeHelpers } from '@agoric/deploy-script-support';
import { getManifestForInitManualTimerFaucet } from '../src/proposals/liq-prep-proposal.js';

export const defaultProposalBuilder = async ({ publishRef, install }) => {
    return harden({
        sourceSpec: '../src/proposals/liq-prep-proposal.js',
        getManifestCall: [
            getManifestForInitManualTimerFaucet.name,
            {
                manualTimerTef: publishRef(install('./manualTimerFaucet.js')),
            },
        ],
    });
};

export default async (homeP, endowments) => {
    const { writeCoreProposal } = await makeHelpers(homeP, endowments);
    await writeCoreProposal('startManualTimer', defaultProposalBuilder);
};
