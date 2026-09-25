import { privateTreasuryAccountId } from '../configs/private-intents.config';

export function privateAssetIdentifier(
  assetId: string,
  treasuryAccountId = privateTreasuryAccountId,
): string {
  if (!assetId) {
    throw new Error('assetId is required to build a private asset identifier');
  }
  if (!treasuryAccountId) {
    throw new Error('treasuryAccountId is required to build a private asset identifier');
  }

  return `imt:${treasuryAccountId}:${assetId}`;
}

export function publicAssetIdentifier(
  assetId: string,
  treasuryAccountId = privateTreasuryAccountId,
): string {
  if (!assetId) {
    throw new Error('assetId is required to unwrap a private asset identifier');
  }

  if (treasuryAccountId) {
    const privatePrefix = `imt:${treasuryAccountId}:`;
    return assetId.startsWith(privatePrefix) ? assetId.slice(privatePrefix.length) : assetId;
  }

  const imtPrefix = 'imt:';
  if (!assetId.startsWith(imtPrefix)) {
    return assetId;
  }

  const publicAssetStart = assetId.indexOf(':', imtPrefix.length);
  return publicAssetStart === -1 ? assetId : assetId.slice(publicAssetStart + 1);
}
