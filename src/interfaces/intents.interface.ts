export enum SignStandardEnum {
  nep413 = 'nep413',
}

export interface ITokenDiff {
  intent: 'token_diff';
  diff: { [key: string]: string };
}

export type IIntent = ITokenDiff; // TODO: Add other intent types if needed

export interface IMessage {
  signer_id: string;
  deadline: string;
  intents: IIntent[];
}
