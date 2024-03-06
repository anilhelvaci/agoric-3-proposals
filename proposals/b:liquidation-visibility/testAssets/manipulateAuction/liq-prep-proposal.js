import { E } from '@endo/far';
import { makeTracer } from '@agoric/internal';

const trace = makeTracer('ManualTimer');

export const initManualTimerFaucet = async (powers, { options: { manualTimerRef } },) => {
    trace('InitManualTimerFaucet...');

    const {
        consume: { zoe },
        produce: { manualTimerKit },
        instance: {
            produce: { manualTimerInstanceNew },
        },
    } = powers;

    const SECONDS_PER_DAY = 24n * 60n * 60n;

    const terms = harden({
        startValue: 0n,
        timeStep: SECONDS_PER_DAY * 7n,
    });

    const installation = await manualTimerInstallation;
    const instanceFacets = await E(zoe).startInstance(installation, undefined, terms, undefined, 'manualTimerFaucet');

    manualTimerKit.reset();
    manualTimerKit.resolve(instanceFacets);
    manualTimerInstanceNew.reset();
    manualTimerInstanceNew.resolve(instanceFacets.instance);
    manualTimerInstallReset.reset();
    trace('Completed...');
};

export const getManifestForInitManualTimerFaucet = async ({ manualTimerRef }) =>
    harden({
        manifest: {
            [initManualTimerFaucet.name]: {
                consume: {
                    zoe: 'zoe',
                },
                produce: {
                    manualTimerKit: true,
                },
                instance: {
                    produce: {
                        manualTimerInstanceNew: true,
                    },
                },
            },
        },
        options: { manualTimerRef },
    });
