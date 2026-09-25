# AMM Solver

AMM Solver is a sample solver for the Near Intents protocol, implementing Automated Market Maker (AMM) functionality for a given pair of NEP-141 tokens.

## Prerequisites

- Node.js v20.18+ with NPM

## Installation

```bash
npm install
```

## Configuration

Parameters are configured using environment variables or `env/.env.{NODE_ENV}` files.

To use an environment file, copy the `env/.env.example` file, replacing "example" with the name of your environment. For example, copy it to `env/.env.local`, configure parameters, then specify the `NODE_ENV` variable when running the app:

> on Linux and MacOS:

```bash
NODE_ENV=local npm start
```

> on Windows:

```bat
set NODE_ENV=local && npm start
```

### Required parameters

- `AMM_TOKEN1_ID` and `AMM_TOKEN2_ID` — a pair of NEP-141 token IDs for the AMM, e.g., `usdt.tether-token.near` and `wrap.near`.

#### (1) TEE Mode

In TEE Mode, the solver pool contract owns the token reserves on the NEAR Intents contract. A key pair is generated inside the TEE (no one has access to it), and its public key is added to the solver pool contract on NEAR Intents. You only need to provide the solver registry contract and the pool ID; the solver running in the TEE will automatically register and start serving.

- `TEE_ENABLED` - set to `true` if the solver needs to be run inside TEE
- `SOLVER_REGISTRY_CONTRACT` - the solver registry contract on NEAR for the solvers to register themselves, e.g. `solver-registry.near`
- `SOLVER_POOL_ID` - the pool ID that the solver pool contract, e.g. `0`, `1`, ...
- `NEAR_NODE_URLS` - configure multiple node URLs for cross-checking results, separated by comma, e.g. `https://free.rpc.fastnear.com,https://near.lava.build`

#### (2) Non-TEE Mode

- `NEAR_ACCOUNT_ID` — the solver's account ID on Near, e.g., `solver1.near`. This account should be the owner of token reserves on the Near Intents contract (see the "Preparation" section below for details).
- `NEAR_PRIVATE_KEY` — the solver's account private key in a prefixed base-58 form, e.g. `ed25519:pR1vat3K37...`. The corresponding public key should be added to the Near Intents contract (see the "Preparation" section below for details).

### Optional parameters

- `APP_PORT` — HTTP port to listen on (default: `3000`)
- `LOG_LEVEL` — logging level: `error`, `warn`, `info`, or `debug` (default: `info`)
- `NEAR_NODE_URL` — the Near RPC node URL to use (default: `https://rpc.mainnet.near.org`)
- `RELAY_WS_URL` — solver relay URL (default: `wss://solver-relay-v2.chaindefuser.com/ws`)
- `INTENTS_CONTRACT` — ID of the Near Intents contract (default: `intents.near`)
- `MARGIN_PERCENT` — AMM margin percent, must be positive (default: `0.3`)
- `ONE_CLICK_API_ONLY` - Set to true to only allow the solver to parse requests coming from the 1Click API

## Preparation before the first run

For the AMM solver to function properly in public mode, reserves of the tokens specified in `AMM_TOKEN1_ID` and `AMM_TOKEN2_ID` must be deposited to the Near Intents contract. Additionally, the solver's public key must be registered with the contract.

Follow these steps using the Near CLI RS tool.

Install Near CLI RS tool if not yet installed:

```bash
https://github.com/near/near-cli-rs/tree/main?tab=readme-ov-file#install
```

Or run with npx:

```bash
npx near-cli-rs
```

Ensure the solver's Near account has sufficient funds in `AMM_TOKEN1_ID` and `AMM_TOKEN2_ID`.

For each token, deposit the desired amount to the Near Intents contract to form a reserve:

> replace `token1.near`, `reserve_amount_1`, and `solver1.near` with your actual values below:

```bash
npx near-cli-rs tokens solver1.near send-near solver1.near '1 yoctoNEAR' network-config mainnet sign-with-keychain send
```

Register the solver's public key with the Near Intents contract:

> replace `ed25519:pUbl1kK37...` and `solver1.near` with your actual values below:

```bash
npx near-cli-rs contract call-function as-transaction intents.near add_public_key json-args '{"public_key":"ed25519:pUbL1Ck3Y"}' prepaid-gas '100.0 Tgas' attached-deposit '1 yoctoNEAR' sign-as solver1.near network-config mainnet sign-with-keychain send
```

## Running the app

Normal mode:

```bash
npm start
```

Development mode (with automatic reload):

```bash
npm run dev
```

TEE mode:

You have multiple ways to run the solver inside TEE:

1. use the [TEE solver server](https://github.com/Near-One/tee-solver/tree/main/server)
2. follow the [Phala Cloud](https://docs.phala.com/phala-cloud/cvm/overview) docs

## Confidential Mode

Set `SOLVER_MODE=confidential` to run the same AMM sample against private liquidity in confidential Intents.

In confidential mode:

- `AMM_TOKEN1_ID` and `AMM_TOKEN2_ID` are still configured as public token IDs;
- the solver quotes their confidential asset identifiers: `imt:<PRIVATE_TREASURY_ACCOUNT_ID>:nep141:<token>`;
- the solver connects to `PRIVATE_RELAY_WS_URL`;
- the solver signs `token_diff` intents for `PRIVATE_INTENTS_CONTRACT`;
- the solver signs private quote responses with versioned nonces;
- the solver sends quote responses the same way it does in public mode and confirms received quote status updates.

Required confidential env vars:

```env
SOLVER_MODE=confidential
PRIVATE_RELAY_WS_URL=wss://f3x8k2m9a7.chaindefuser.com/ws
PRIVATE_INTENTS_CONTRACT=intents.far
PRIVATE_INTENTS_CONTRACT_SALT=e110f317
PRIVATE_TREASURY_ACCOUNT_ID=51e8f94d77b5e90dc9852ca6113771e11e8382ce69473a75e313e41665de7cbe
ONE_CLICK_BASE_URL=https://1click.chaindefuser.com
SOLVER_INSTANCE_ID=amm-solver-1
PARTNER_JWT=...
```

`PRIVATE_RELAY_WS_URL`, `PRIVATE_INTENTS_CONTRACT`, `PRIVATE_INTENTS_CONTRACT_SALT`, `PRIVATE_TREASURY_ACCOUNT_ID`, and `ONE_CLICK_BASE_URL` are production constants shared by solver operators. `SOLVER_INSTANCE_ID` is a stable identifier for the running solver instance. `PARTNER_JWT` is the solver-specific credential from the Partners dashboard at `https://partners.near-intents.org` and is used for both 1Click API requests and private relay authentication.

`PRIVATE_INTENTS_CONTRACT` identifies the confidential Intents contract used in signed quote payloads.

`ONE_CLICK_BASE_URL` also selects the public Intents environment used for 1Click authentication: the `1click.chaindefuser.com` host uses production, and other hosts use stage. Public quote signing does not require `PARTNER_JWT`.

### Quote status acknowledgements

The relay supports an acknowledgement mechanism for guaranteed delivery of quote status updates. It is enabled by providing an `instance_id` in the websocket URL, which the solver takes from `SOLVER_INSTANCE_ID`. Every running solver instance needs its own value.

The solver acknowledges an event only after processing it, so an event is redelivered instead of being lost if the solver stops while handling it. Redelivery also means the same event can arrive more than once; here that is harmless, because processing it only refreshes the quoter state.

This sample keeps signed quotes in memory, so after a restart it can no longer match a redelivered status update with the quote that produced it. A solver that acts on settlements should persist the quote context before sending the quote response.

### Depositing and withdrawing private liquidity with 1Click

Solver operators can use the 1Click API to deposit liquidity into confidential Intents and withdraw it back to public Intents.

For the AMM solver to function properly in confidential mode, private reserves of both tokens specified in `AMM_TOKEN1_ID` and `AMM_TOKEN2_ID` must be deposited for the solver account. Ensure the solver account has sufficient funds on public Intents for both AMM tokens, then use the deposit example once for each token.

Use 1Click asset IDs in `originAsset` and `destinationAsset`, such as `nep141:wrap.near`. `NEAR_ACCOUNT_ID` is used as the Intents account for `refundTo` and `recipient`.

- deposit/shield into confidential Intents: `depositType=INTENTS`, `recipientType=CONFIDENTIAL_INTENTS`, `refundType=INTENTS`;
- withdraw/unshield back to public Intents: `depositType=CONFIDENTIAL_INTENTS`, `recipientType=INTENTS`, `refundType=CONFIDENTIAL_INTENTS`.

These requests intentionally use the same asset as both `originAsset` and `destinationAsset`. They deposit or withdraw liquidity; they are not AMM price swaps.

The runnable example is in `src/examples/one-click-confidential-liquidity.ts`. It performs the regular 1Click flow: quote, generate intent, sign, submit intent, and poll execution status. Its config lives in `src/configs/one-click-confidential-liquidity.config.ts`.

Configure `NEAR_ACCOUNT_ID`, `NEAR_PRIVATE_KEY`, `ONE_CLICK_BASE_URL`, and `PARTNER_JWT`, then deposit each AMM reserve:

```bash
NODE_ENV=local \
ONE_CLICK_ASSET_ID=nep141:wrap.near \
ONE_CLICK_AMOUNT=100000000000000000000000 \
npm run one-click:deposit-confidential

NODE_ENV=local \
ONE_CLICK_ASSET_ID=nep141:usdt.tether-token.near \
ONE_CLICK_AMOUNT=1000000 \
npm run one-click:deposit-confidential
```

Replace the asset IDs and amounts with the pair and reserve sizes you want to run. Amounts are in the token's smallest unit. To withdraw liquidity back to public Intents, run the withdraw example with the asset and amount you want to withdraw:

```bash
NODE_ENV=local \
ONE_CLICK_ASSET_ID=nep141:wrap.near \
ONE_CLICK_AMOUNT=100000000000000000000000 \
npm run one-click:withdraw-confidential
```

After both reserves are deposited, start the solver with the same environment file:

```bash
NODE_ENV=local npm start
```
