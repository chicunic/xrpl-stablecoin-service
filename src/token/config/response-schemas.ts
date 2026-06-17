import { z } from "@hono/zod-openapi";

// Firestore Timestamp fields are converted to ISO strings by serializeTimestamps before responding,
// so every timestamp below is modeled as z.string().

const KycStatusSchema = z.enum(["none", "approved"]);

export const UserResponseSchema = z
  .object({
    uid: z.string(),
    email: z.string(),
    name: z.string(),
    fiatBalance: z.number(),
    kycStatus: KycStatusSchema,
    createdAt: z.string(),
    hasWallet: z.boolean(),
    hasVirtualAccount: z.boolean(),
    walletAddress: z.string().optional(),
  })
  .meta({ id: "UserResponse" });

export const WalletAddressResponseSchema = z.object({ address: z.string() }).meta({ id: "WalletAddressResponse" });

export const VirtualAccountSchema = z
  .object({
    bankCode: z.string(),
    branchCode: z.string(),
    accountNumber: z.string(),
    accountHolder: z.string(),
    label: z.string(),
    createdAt: z.string(),
  })
  .meta({ id: "VirtualAccount" });

export const FiatBalanceSchema = z.object({ balance: z.number() }).meta({ id: "FiatBalance" });

const MptBalanceSchema = z.object({ mptIssuanceId: z.string(), value: z.string() });

export const MptBalancesResponseSchema = z
  .object({ address: z.string(), balances: z.array(MptBalanceSchema) })
  .meta({ id: "MptBalancesResponse" });

export const FiatTransactionSchema = z
  .object({
    transactionId: z.string(),
    type: z.enum(["deposit", "withdrawal", "exchange_in", "exchange_out", "refund"]),
    amount: z.number(),
    balance: z.number(),
    description: z.string(),
    relatedOrderId: z.string().optional(),
    createdAt: z.string(),
  })
  .meta({ id: "FiatTransaction" });

export const MptTransactionSchema = z
  .object({
    transactionId: z.string(),
    tokenId: z.string(),
    type: z.enum(["deposit", "withdrawal", "exchange_in", "exchange_out", "invoice_payment"]),
    amount: z.number(),
    description: z.string(),
    relatedOrderId: z.string().optional(),
    txHash: z.string().optional(),
    createdAt: z.string(),
  })
  .meta({ id: "MptTransaction" });

export const MptAuthorizationSchema = z
  .object({ mptIssuanceId: z.string(), createdAt: z.string() })
  .meta({ id: "MptAuthorization" });

export const TokenAuthorizationStatusSchema = z
  .object({
    tokenId: z.string(),
    name: z.string(),
    issuerAddress: z.string(),
    mptIssuanceId: z.string(),
    hasAuthorization: z.boolean(),
  })
  .meta({ id: "TokenAuthorizationStatus" });

export const PublicTokenViewSchema = z
  .object({
    tokenId: z.string(),
    name: z.string(),
    domain: z.string(),
    issuerAddress: z.string(),
    mptIssuanceId: z.string(),
    assetScale: z.number(),
    maximumAmount: z.string(),
    transferFee: z.number(),
    permissionedDomainId: z.string().optional(),
  })
  .meta({ id: "PublicTokenView" });

export const TokenAuthorizeResponseSchema = z
  .object({ tokenId: z.string(), mptIssuanceId: z.string(), status: z.literal("ok") })
  .meta({ id: "TokenAuthorizeResponse" });

export const CredentialStatusSchema = z
  .object({ exists: z.boolean(), accepted: z.boolean(), expiration: z.number().optional() })
  .meta({ id: "CredentialStatus" });

export const CredentialAcceptResponseSchema = z
  .object({
    credentialTxHash: z.string(),
    credentialAcceptTxHash: z.string(),
    credentialStatus: z.literal("accepted"),
  })
  .meta({ id: "CredentialAcceptResponse" });

export const ExchangeOrderSchema = z
  .object({
    orderId: z.string(),
    userId: z.string(),
    tokenId: z.string(),
    direction: z.enum(["fiat_to_token", "token_to_fiat"]),
    amount: z.number(),
    status: z.enum(["pending", "fiat_debited", "token_burned", "completed", "failed"]),
    xrplTxHash: z.string().optional(),
    failureReason: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "ExchangeOrder" });

export const FiatWithdrawalResultSchema = z
  .object({
    amount: z.number(),
    destination: z.object({
      bankCode: z.string(),
      branchCode: z.string(),
      accountNumber: z.string(),
      accountHolder: z.string(),
    }),
    txReference: z.string(),
  })
  .meta({ id: "FiatWithdrawalResult" });

export const MptWithdrawalResultSchema = z
  .object({
    tokenId: z.string(),
    amount: z.number(),
    destinationAddress: z.string(),
    xrplTxHash: z.string(),
  })
  .meta({ id: "MptWithdrawalResult" });

export const ParsedInvoiceDataSchema = z
  .object({
    tokenId: z.string(),
    amount: z.number(),
    recipientAddress: z.string(),
    recipientName: z.string(),
    description: z.string(),
    dueDate: z.string().optional(),
    invoiceId: z.string().optional(),
  })
  .meta({ id: "ParsedInvoiceData" });

export const InvoiceSchema = z
  .object({
    invoiceId: z.string(),
    userId: z.string(),
    type: z.enum(["send", "pay"]),
    tokenId: z.string(),
    amount: z.number(),
    recipientAddress: z.string(),
    recipientName: z.string(),
    description: z.string(),
    dueDate: z.string().optional(),
    status: z.enum(["pending", "paid", "failed", "cancelled"]),
    xrplTxHash: z.string().optional(),
    failureReason: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    paidAt: z.string().optional(),
    paymentId: z.string().optional(),
  })
  .meta({ id: "Invoice" });

export const WhitelistAddressSchema = z
  .object({ address: z.string(), label: z.string(), createdAt: z.string() })
  .meta({ id: "WhitelistAddress" });

export const BankWhitelistEntrySchema = z
  .object({
    bankCode: z.string(),
    branchCode: z.string(),
    accountNumber: z.string(),
    accountHolder: z.string(),
    label: z.string(),
    createdAt: z.string(),
  })
  .meta({ id: "BankWhitelistEntry" });

export const KycInfoSchema = z
  .object({
    fullName: z.string(),
    phoneNumber: z.string(),
    postalCode: z.string(),
    prefecture: z.string(),
    city: z.string(),
    town: z.string(),
    address: z.string(),
    status: KycStatusSchema,
    submittedAt: z.string(),
    credentialTxHash: z.string().optional(),
    credentialAcceptTxHash: z.string().optional(),
    credentialStatus: z.enum(["issued", "accepted", "failed"]).optional(),
  })
  .meta({ id: "KycInfo" });

export const StatusOkSchema = z.object({ status: z.literal("ok") }).meta({ id: "StatusOk" });

/** Async-handler acknowledgement returned by pubsub/eventarc push endpoints. */
export const AckSchema = z
  .object({
    status: z.enum(["ok", "skipped"]).optional(),
    reason: z.string().optional(),
    error: z.string().optional(),
  })
  .meta({ id: "Ack" });
