
# AMM Solver

AMM Solver is a sample solver for the Near Intents protocol, implementing Automated Market Maker (AMM) functionality for a given pair of NEP-141 tokens.

## Prerequisites

* Node.js v20.18+ with NPM

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

* `AMM_TOKEN1_ID` and `AMM_TOKEN2_ID` — a pair of NEP-141 token IDs for the AMM, e.g., `usdt.tether-token.near` and `wrap.near`.
* `NEAR_ACCOUNT_ID` — the solver's account ID on Near, e.g., `solver1.near`. This account should be the owner of token reserves on the Near Intents contract (see the "Preparation" section below for details).
* `NEAR_PRIVATE_KEY` — the solver's account private key in a prefixed base-58 form, e.g. `ed25519:pR1vat3K37...`. The corresponding public key should be added to the Near Intents contract (see the "Preparation" section below for details).

### Optional parameters

* `APP_PORT` — HTTP port to listen on (default: `3000`)
* `LOG_LEVEL` — logging level: `error`, `warn`, `info`, or `debug` (default: `info`)
* `NEAR_NODE_URL` — the Near RPC node URL to use (default: `https://rpc.mainnet.near.org`)
* `RELAY_WS_URL` — solver relay URL (default: `wss://solver-relay-v2.chaindefuser.com/ws`)
* `RELAY_AUTH_KEY` — solver's authentication key for accessing the relay (currently unused)
* `INTENTS_CONTRACT` — ID of the Near Intents contract (default: `intents.near`)
* `MARGIN_PERCENT` — AMM margin percent, must be positive (default: `0.3`)

## Preparation before the first run

For the AMM solver to function properly, reserves of the tokens specified in `AMM_TOKEN1_ID` and `AMM_TOKEN2_ID` must be deposited to the Near Intents contract. Additionally, the solver's public key must be registered with the contract.

Follow these steps using the Near CLI tool.

Install Near CLI tool if not yet installed:
```bash
npm install near-cli -g
```

Ensure the solver's Near account has sufficient funds in `AMM_TOKEN1_ID` and `AMM_TOKEN2_ID`.

For each token, deposit the desired amount to the Near Intents contract to form a reserve:
> replace `token1.near`, `reseve_amount_1`, and `solver1.near` with your actual values below:
```bash
near call token1.near ft_transfer_call '{"receiver_id":"intents.near","amount":"reserve_amount_1","msg":""}' --accountId solver1.near --networkId mainnet --depositYocto 1 --gas 300000000000000
```

Register the solver's public key with the Near Intents contract:
> replace `ed25519:pUbl1kK37...` and `solver1.near` with your actual values below:
```bash
near call intents.near add_public_key '{"public_key":"ed25519:pUbl1kK37..."}' --accountId solver1.near --networkId mainnet --depositYocto 1
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

## Create Docker Image

### Build

From the root folder

```bash
docker buildx build --load --platform linux/amd64 -t intents-tee-amm-solver:latest -f Dockerfile .
```

## Push

```bash
export OWNER=robortyan
# add tag to build
docker tag intents-tee-amm-solver:latest ${OWNER}/intents-tee-amm-solver:latest
# push image
docker push ${OWNER}/intents-tee-amm-solver:latest
```

## Run Locally

```bash
export HOST_PORT=3000
export NEAR_NETWORK_ID=testnet
export INTENTS_CONTRACT=mock-intents.testnet
export SOLVER_REGISTRY_CONTRACT=solver-registry-dev.testnet
export SOLVER_POOL_ID=0
export AMM_TOKEN1_ID=wrap.testnet
export AMM_TOKEN2_ID=usdc.fakes.testnet

docker run --platform linux/amd64 \
    -p ${HOST_PORT}:3000 \
    -e NEAR_NETWORK_ID=${NEAR_NETWORK_ID} \
    -e INTENTS_CONTRACT=${INTENTS_CONTRACT} \
    -e SOLVER_REGISTRY_CONTRACT=${SOLVER_REGISTRY_CONTRACT} \
    -e SOLVER_POOL_ID=${SOLVER_POOL_ID} \
    -e AMM_TOKEN1_ID=${AMM_TOKEN1_ID} \
    -e AMM_TOKEN2_ID=${AMM_TOKEN2_ID} \
    intents-tee-amm-solver:latest
```
