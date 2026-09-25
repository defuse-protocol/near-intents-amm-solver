import { createHash } from 'crypto';
import {
  computeIntentHash,
  createIntentSignerNEP413,
  IntentsSDK,
  VersionedNonceBuilder,
  type MultiPayload,
} from '@defuse-protocol/intents-sdk';
import {
  AccountService,
  BalanceEntry,
  MultiPayloadNep413,
  UserAuthService,
} from '@defuse-protocol/one-click-sdk-typescript';
import { activeIntentsContract, intentsContract } from '../configs/intents.config';
import { privateIntentsContractSalt } from '../configs/private-intents.config';
import { isConfidentialMode } from '../configs/solver-mode.config';
import {
  configureOneClickApi,
  getOneClickIntentsEnv,
  getRequiredOneClickApiConfig,
} from '../configs/one-click.config';
import { NearService } from './near.service';
import { publicAssetIdentifier } from '../utils/private-assets';
import { tokens } from 'src/configs/tokens.config';

type OneClickUserToken = {
  accessToken: string;
  expiresAtMs: number;
};

export type SignedIntent = Extract<MultiPayload, { standard: 'nep413' }>;

const authTokenRefreshSkewMs = 60_000;
const oneClickAuthIntentTtlMs = 5 * 60_000;
const oneClickAuthReferral = 'near-intents-amm-solver';
// buildWithSalt() only derives a nonce from the salt when none was set explicitly,
// so the public mode passes this placeholder together with its own nonce.
const unusedSalt = new Uint8Array(4);

export class IntentsService {
  private oneClickUserToken?: OneClickUserToken;
  private oneClickApiConfigured = false;
  private sdk?: IntentsSDK;
  private signer?: ReturnType<typeof createIntentSignerNEP413>;

  public constructor(private readonly nearService: NearService) {}

  public async init(): Promise<void> {
    if (!activeIntentsContract) {
      throw new Error('Invalid intents contract');
    }

    // Verify reserves on NEAR Intents contract
    try {
      await this.getBalances(tokens);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to validate reserves on NEAR Intents contract ${activeIntentsContract}. ${errorMessage}`);
    }
  }

  public generateDeterministicNonce(input: string) {
    const hash = createHash('sha256');
    hash.update(input);
    return hash.digest('base64');
  }

  /**
   * Signs a `token_diff` intent for the contract the solver currently trades on.
   * Confidential Intents requires a versioned nonce derived from the contract
   * salt; in public mode the caller keeps providing its own nonce, so that all
   * quotes signed against the same reserves stay mutually exclusive on-chain.
   */
  public async signTokenDiff(
    diff: Record<string, string>,
    deadline: Date,
    publicNonce: string,
  ): Promise<{ signedData: SignedIntent; quoteHash: string }> {
    const builder = this.getSdk()
      .intentBuilder()
      .setSigner(this.nearService.getIntentsAccountId())
      .setVerifyingContract(activeIntentsContract)
      .setDeadline(deadline)
      .addIntent({ intent: 'token_diff', diff });

    const payload = isConfidentialMode
      ? builder.buildWithSalt(this.parsePrivateIntentsContractSalt())
      : builder.setNonce(publicNonce).buildWithSalt(unusedSalt);

    const signedData = await this.getSigner().signIntent(payload);

    return { signedData, quoteHash: await computeIntentHash(signedData) };
  }

  public async getBalances(tokenIds: string[]) {
    if (isConfidentialMode) {
      return this.getBalancesFromOneClick(tokenIds);
    }

    return this.getBalancesOnContract(tokenIds);
  }

  private async getBalancesOnContract(tokenIds: string[]) {
    const account = this.nearService.getAccount();
    const result = await account.viewFunction({
      contractId: intentsContract,
      methodName: 'mt_batch_balance_of',
      args: {
        account_id: this.nearService.getIntentsAccountId(),
        token_ids: tokenIds,
      },
    });
    const balances = result as string[];
    if (balances?.length !== tokenIds.length) {
      throw new Error(`Expected to receive ${tokenIds.length} balances, but got ${balances?.length}`);
    }
    return balances;
  }

  private async getBalancesFromOneClick(tokenIds: string[]) {
    this.configureOneClick();

    // 1Click reports private balances under the public token id, so ask for all of
    // them and select the requested assets locally.
    const { balances } = await AccountService.getBalances();

    return tokenIds.map((tokenId) => {
      const publicTokenId = publicAssetIdentifier(tokenId);
      const balance = balances.find(
        ({ tokenId: id, source }) => id === publicTokenId && source === BalanceEntry.source.PRIVATE,
      );
      return balance?.available ?? '0';
    });
  }

  private configureOneClick() {
    const config = getRequiredOneClickApiConfig();
    if (!this.oneClickApiConfigured) {
      configureOneClickApi(config, () => this.getOneClickUserToken());
      this.oneClickApiConfigured = true;
    }
  }

  private async getOneClickUserToken() {
    if (this.oneClickUserToken && this.oneClickUserToken.expiresAtMs > Date.now()) {
      return this.oneClickUserToken.accessToken;
    }

    const now = Date.now();
    const payload = await this.getSdk()
      .intentBuilder()
      .setDeadline(new Date(now + oneClickAuthIntentTtlMs))
      .setNonceRandomBytes(VersionedNonceBuilder.createTimestampedNonceBytes(new Date(now)))
      .build();
    const signed = await this.getSigner().signIntent(payload);
    // The 1Click SDK declares its own payload union; only the standard differs.
    const auth = await UserAuthService.authenticate({
      signedData: { ...signed, standard: MultiPayloadNep413.standard.NEP413 },
    });

    this.oneClickUserToken = {
      accessToken: auth.accessToken,
      expiresAtMs: Date.now() + auth.expiresIn * 1000 - authTokenRefreshSkewMs,
    };

    return this.oneClickUserToken.accessToken;
  }

  private getSigner() {
    this.signer ??= createIntentSignerNEP413({
      accountId: this.nearService.getIntentsAccountId(),
      signMessage: async (_nep413Payload, nep413Hash) => {
        const signature = await this.nearService.signMessage(nep413Hash);
        return {
          publicKey: signature.publicKey.toString(),
          signature: Buffer.from(signature.signature).toString('base64'),
        };
      },
    });

    return this.signer;
  }

  private getSdk() {
    this.sdk ??= new IntentsSDK({
      referral: oneClickAuthReferral,
      env: getOneClickIntentsEnv(),
    });

    return this.sdk;
  }

  private parsePrivateIntentsContractSalt() {
    const saltHex = privateIntentsContractSalt.trim();
    const salt = Buffer.from(saltHex, 'hex');
    if (salt.length !== 4 || salt.toString('hex') !== saltHex.toLowerCase()) {
      throw new Error(`PRIVATE_INTENTS_CONTRACT_SALT must be a 4-byte hex string`);
    }

    return salt;
  }
}
