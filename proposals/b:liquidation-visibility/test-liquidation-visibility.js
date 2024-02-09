import anyTest from 'ava';

/** @typedef {Awaited<ReturnType<typeof makeTestContext>>} TestContext */
/** @type {import('ava').TestFn<TestContext>}} */
const test = anyTest;

test.serial(`test`, async t => {
    console.log('test');
    t.is(1, 1);
});