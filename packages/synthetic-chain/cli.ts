#!/usr/bin/env tsx

import { execSync } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';
import chalk from 'chalk';
import {
  bakeTarget,
  buildProposalSubmissions,
  readBuildConfig,
} from './src/cli/build.js';
import {
  writeBakefileProposals,
  writeDockerfile,
} from './src/cli/dockerfileGen.js';
import { runDoctor } from './src/cli/doctor.js';
import {
  imageNameForProposal,
  matchOneProposal,
  readProposals,
} from './src/cli/proposals.js';
import { debugTestImage, runTestImage } from './src/cli/run.js';

const { positionals, values } = parseArgs({
  options: {
    match: { short: 'm', type: 'string' },
    dry: { type: 'boolean' },
    debug: { type: 'boolean' },
  },
  allowPositionals: true,
});

const root = path.resolve('.');
const buildConfig = readBuildConfig(root);
const allProposals = readProposals(root);

const { match } = values;
const proposals = match
  ? allProposals.filter(p => p.proposalName.includes(match))
  : allProposals;

const [cmd] = positionals;

// TODO consider a lib like Commander for auto-gen help
const USAGE = `USAGE:
prepare-build   - generate Docker build configs

build           - build the synthetic-chain "use" images

test [--debug]  - build the "test" images and run them
test -m <name>  - target a particular proposal by substring match

doctor          - diagnostics and quick fixes
`;

const EXPLAIN_MULTIPLATFORM = `
ERROR: docker exporter does not currently support exporting manifest lists

Multiple platforms are configured but Docker does not support multiplatform in one builder.
Until https://github.com/docker/roadmap/issues/371, attempting it will error as above.

Instead use a builder that supports multiplatform such as depot.dev.
`;

/**
 * Put into places files that building depends upon.
 */
const prepareDockerBuild = () => {
  const cliPath = new URL(import.meta.url).pathname;
  // copy and generate files of the build context that aren't in the build contents
  execSync(`cp -r ${path.resolve(cliPath, '..', 'docker-bake.hcl')} .`);
  writeDockerfile(allProposals, buildConfig.fromTag);
  writeBakefileProposals(allProposals, buildConfig.platforms);
  // copy and generate files to include in the build
  execSync(`cp -r ${path.resolve(cliPath, '..', 'upgrade-test-scripts')} .`);
  buildProposalSubmissions(proposals);
  // set timestamp of build content to zero to avoid invalidating the build cache
  // (change in contents will still invalidate)
  execSync(
    'find upgrade-test-scripts -type f -exec touch -t 197001010000 {} +',
  );
};

switch (cmd) {
  case 'prepare-build':
    prepareDockerBuild();
    break;
  case 'build': {
    prepareDockerBuild();
    // do not encapsulate running Depot. It's a special case which the user should understand.
    if (buildConfig.platforms) {
      console.error(EXPLAIN_MULTIPLATFORM);
      process.exit(1);
    }
    bakeTarget('use', values.dry);
    break;
  }
  case 'test':
    // Always rebuild all test images to keep it simple. With the "use" stages
    // cached, these are pretty fast building doesn't run agd.
    prepareDockerBuild();

    if (values.debug) {
      const proposal = matchOneProposal(proposals, match!);
      console.log(chalk.yellow.bold(`Debugging ${proposal.proposalName}`));
      bakeTarget(imageNameForProposal(proposal, 'test').target, values.dry);
      debugTestImage(proposal);
      // don't bother to delete the test image because there's just one
      // and the user probably wants to run it again.
    } else {
      for (const proposal of proposals) {
        console.log(chalk.cyan.bold(`Testing ${proposal.proposalName}`));
        const image = imageNameForProposal(proposal, 'test');
        bakeTarget(image.target, values.dry);
        runTestImage(proposal);
        // delete the image to reclaim disk space. The next build
        // will use the build cache.
        execSync('docker system df', { stdio: 'inherit' });
        execSync(`docker rmi ${image.name}`, { stdio: 'inherit' });
        execSync('docker system df', { stdio: 'inherit' });
      }
    }
    break;
  case 'doctor':
    runDoctor(allProposals);
    break;
  default:
    console.log(USAGE);
}