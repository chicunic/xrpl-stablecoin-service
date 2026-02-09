# xrpl-jpy-stablecoin

A JPY stablecoin (JPYN) platform on the XRPL. Consists of two Cloud Run services: **Bank** (simulated banking system) and **Token** (stablecoin issuance and management).

## Features

- Fiat deposit: Users transfer funds to the bank via virtual accounts; the system automatically credits their fiat balance
- Fiat withdrawal: Initiate a bank transfer from fiat balance
- Fiat-to-Token exchange: Deduct fiat balance and mint stablecoins on the XRPL (1:1)
- Token-to-Fiat exchange: Burn on-chain stablecoins and credit fiat balance (1:1)
- Token deposit: When an external wallet sends tokens to a custodial wallet, Eventarc automatically updates the token balance
- Withdrawal whitelist: Manage whitelists for bank accounts and XRPL addresses

## Architecture

- **Bank Service** — Simulated bank managing accounts, virtual accounts, and transfers. Notifies the Token service via Pub/Sub when a corporate account receives a transfer
- **Token Service** — Stablecoin core managing user wallets, balances, exchanges, and withdrawals. Authenticated via Google OAuth2
- **Eventarc** — Triggered when a new document is added to the Firestore `tokenTransactions` collection; processes on-chain XRPL token deposits
- **Pub/Sub** — Pushes bank deposit events to the Token service to automatically credit fiat balances

## Bank Service API

| Method | Path | Description |
| - | - | - |
| GET | `/health` | Health check |
| POST | `/api/v1/accounts` | Create a new bank account |
| POST | `/api/v1/accounts/login` | Login to bank account |
| GET | `/api/v1/accounts/lookup` | Lookup account by branch code and account number |
| GET | `/api/v1/accounts/me` | Get current account info |
| PATCH | `/api/v1/accounts/me` | Update current account info |
| POST | `/api/v1/accounts/me/api-token` | Generate long-lived API token (corporate only) |
| POST | `/api/v1/accounts/me/virtual-accounts` | Create a virtual account (corporate only) |
| GET | `/api/v1/accounts/me/virtual-accounts` | List virtual accounts (corporate only) |
| GET | `/api/v1/accounts/me/virtual-accounts/:id` | Get virtual account details (corporate only) |
| PATCH | `/api/v1/accounts/me/virtual-accounts/:id` | Update virtual account (corporate only) |
| POST | `/api/v1/atm/deposit` | ATM cash deposit |
| POST | `/api/v1/atm/withdrawal` | ATM cash withdrawal |
| POST | `/api/v1/transfers` | Transfer funds to another account |
| GET | `/api/v1/transactions` | List transaction history |

## Token Service API

| Method | Path | Description |
| - | - | - |
| GET | `/health` | Health check |
| GET | `/api/v1/users/me` | Get or create current user |
| POST | `/api/v1/users/me/wallet` | Set up XRP wallet |
| POST | `/api/v1/users/me/virtual-account` | Set up virtual bank account |
| GET | `/api/v1/tokens` | List stablecoins |
| GET | `/api/v1/tokens/:tokenId` | Get stablecoin details |
| POST | `/api/v1/tokens/:tokenId/trustline` | Ensure TrustLine exists |
| GET | `/api/v1/balance/fiat` | Get fiat balance |
| GET | `/api/v1/balance/xrp` | Get XRP token balances (on-chain) |
| GET | `/api/v1/balance/tokens` | Get token balances with trustline status |
| GET | `/api/v1/balance/fiat/transactions` | Fiat transaction history |
| GET | `/api/v1/balance/xrp/transactions` | XRP token transaction history |
| POST | `/api/v1/exchange/fiat-to-xrp` | Exchange fiat to token |
| POST | `/api/v1/exchange/xrp-to-fiat` | Exchange token to fiat |
| GET | `/api/v1/whitelist/xrp` | Get XRP address whitelist |
| POST | `/api/v1/whitelist/xrp` | Add XRP address to whitelist |
| DELETE | `/api/v1/whitelist/xrp/:address` | Remove XRP address from whitelist |
| GET | `/api/v1/whitelist/bank` | Get bank account whitelist |
| POST | `/api/v1/whitelist/bank` | Add bank account to whitelist |
| DELETE | `/api/v1/whitelist/bank/:id` | Remove bank account from whitelist |
| POST | `/api/v1/withdraw/fiat` | Withdraw fiat to bank account |
| POST | `/api/v1/withdraw/xrp` | Withdraw XRP token to external address |

### Internal Endpoints (not exposed via Firebase Hosting)

| Method | Path | Description |
| - | - | - |
| POST | `/api/v1/pubsub/bank/deposit` | Pub/Sub push: bank deposit events |
| POST | `/api/v1/eventarc/xrpl/deposit` | Eventarc: XRPL token deposit events |
