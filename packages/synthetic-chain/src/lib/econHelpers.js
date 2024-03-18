import { agd, agops } from './cliHelper.js';
import { ATOM_DENOM, CHAINID, VALIDATORADDR } from './constants.js';
import { executeOffer } from './commonUpgradeHelpers.js';

// TODO return the id of the new vault so subsquent commands can use it
export const openVault = (address, mint, collateral, collateralBrand = "ATOM") => {
  return executeOffer(
    address,
    agops.vaults(
      'open',
      '--wantMinted',
      mint,
      '--giveCollateral',
      collateral,
      '--collateralBrand',
      collateralBrand
    ),
  );
};

export const adjustVault = (address, vaultId, vaultParams) => {
  let params = [
    'adjust',
    '--vaultId',
    vaultId,
    '--from',
    address,
    ' --keyring-backend=test',
  ];

  if ('wantCollateral' in vaultParams) {
    params = [...params, '--wantCollateral', vaultParams.wantCollateral];
  }

  if ('wantMinted' in vaultParams) {
    params = [...params, '--wantMinted', vaultParams.wantMinted];
  }

  if ('giveCollateral' in vaultParams) {
    params = [...params, '--giveCollateral', vaultParams.giveCollateral];
  }

  if ('giveMinted' in vaultParams) {
    params = [...params, '--giveMinted', vaultParams.giveMinted];
  }

  return executeOffer(address, agops.vaults(...params));
};

export const closeVault = (address, vaultId, mint) => {
  return executeOffer(
    address,
    agops.vaults(
      'close',
      '--vaultId',
      vaultId,
      '--giveMinted',
      mint,
      '--from',
      address,
      '--keyring-backend=test',
    ),
  );
};

export const mintIST = async (addr, sendValue, wantMinted, giveCollateral) => {
  await agd.tx(
    'bank',
    'send',
    'validator',
    addr,
    `${sendValue}${ATOM_DENOM}`,
    '--from',
    VALIDATORADDR,
    '--chain-id',
    CHAINID,
    '--keyring-backend',
    'test',
    '--yes',
  );
  await openVault(addr, wantMinted, giveCollateral);
};

export const getISTBalance = async (addr, denom = 'uist', unit = 1_000_000) => {
  const coins = await agd.query('bank', 'balances', addr);
  const coin = coins.balances.find(a => a.denom === denom);
  return Number(coin.amount) / unit;
};
