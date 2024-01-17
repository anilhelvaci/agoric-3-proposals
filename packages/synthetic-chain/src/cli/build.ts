import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ProposalInfo } from './proposals.js';

export type AgoricSyntheticChainConfig = {
  /**
   * The agoric-3-proposals tag to build the agoric synthetic chain from.
   * If `null`, the chain is built from an ag0 genesis.
   * Defaults to `main`, which containing all passed proposals
   */
  fromTag: string | null;
};

const defaultConfig: AgoricSyntheticChainConfig = {
  // Tag of the agoric-3 image containing all passed proposals
  fromTag: 'main',
};

export function readBuildConfig(root: string): AgoricSyntheticChainConfig {
  const packageJsonPath = path.join(root, 'package.json');
  const packageJson = fs.readFileSync(packageJsonPath, 'utf-8');
  const { agoricSyntheticChain } = JSON.parse(packageJson);

  const config = { ...defaultConfig, ...agoricSyntheticChain };
  // TODO mustMatch a shape
  return config;
}

export const buildProposalSubmissions = (proposals: ProposalInfo[]) => {
  for (const proposal of proposals) {
    if (!('source' in proposal && proposal.source === 'build')) continue;

    console.log(
      'Refreshing submission for',
      proposal.proposalIdentifier,
      proposal.proposalName,
    );
    const { buildScript } = proposal;
    const proposalPath = `proposals/${proposal.proposalIdentifier}:${proposal.proposalName}`;
    const submissionPath = `${proposalPath}/submission`;
    const relativeBuildScript = path.relative(submissionPath, buildScript);

    execSync(`mkdir -p ${submissionPath}`);
    // Generate files only in submission path.
    execSync(`agoric run ${relativeBuildScript}`, {
      cwd: submissionPath,
      env: { ...process.env, HOME: '.' },
    });
    // find the one file ending in -plan.json
    // TODO error if there is more than one
    const planPath = execSync(
      `find ${submissionPath} -maxdepth 1 -type f -name '*-plan.json'`,
    )
      .toString()
      .trim();
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
    for (const { fileName } of plan.bundles) {
      // Copy the bundle into the submission path.
      execSync(`cp ${fileName} ${submissionPath}`);
    }
  }
};

/**
 * Bake images using the docker buildx bake command.
 *
 * @param matrix - The group target
 * @param [dry] - Whether to skip building and just print the build config.
 */
export const bakeImages = (matrix: 'test' | 'use', dry = false) => {
  // https://docs.docker.com/engine/reference/commandline/buildx_build/#load
  const cmd = `docker buildx bake --load ${matrix} ${dry ? '--print' : ''}`;
  console.log(cmd);
  execSync(cmd, { stdio: 'inherit' });
};
