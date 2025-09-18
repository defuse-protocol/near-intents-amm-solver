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
- `RELAY_AUTH_KEY` — solver's authentication key for accessing the relay (currently unused)
- `INTENTS_CONTRACT` — ID of the Near Intents contract (default: `intents.near`)
- `MARGIN_PERCENT` — AMM margin percent, must be positive (default: `0.3`)
- `ONE_CLICK_API_ONLY` - Set to true to only allow the solver to parse requests coming from the 1Click API

## Preparation before the first run

For the AMM solver to function properly, reserves of the tokens specified in `AMM_TOKEN1_ID` and `AMM_TOKEN2_ID` must be deposited to the Near Intents contract. Additionally, the solver's public key must be registered with the contract.

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

> replace `token1.near`, `reseve_amount_1`, and `solver1.near` with your actual values below:

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
