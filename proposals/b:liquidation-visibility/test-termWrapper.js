import test from "ava";
import { termsWrapper } from "./termsWrapper.js";

test('wrapper-overrides-terms', t => {
  const terms = {
    timer: {
      src: 'chainTimerService',
    },
    issuers: { Moola: {}, Simolean: {} },
    brands: { Moola: {}, Simolean: {} },
  };

  const privateArgs = {
    storageNode: {},
    marshaller: {},
    electorateInvitation: {},
    timer: {
      src: 'manualTimerService',
    },
  };

  const overridenTerms = termsWrapper(terms, privateArgs);
  t.log(overridenTerms);

  t.deepEqual(overridenTerms, {
    ...terms,
    timer: { src: 'manualTimerService' }
  });
});