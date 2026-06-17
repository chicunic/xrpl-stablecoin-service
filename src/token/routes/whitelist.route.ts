import { serializeTimestamps } from "@common/utils/json.replacer.js";
import { defaultHook, jsonError } from "@common/utils/problem.js";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { BankWhitelistEntrySchema, WhitelistAddressSchema } from "@token/config/response-schemas.js";
import { BankAccountFields, XRPL_ADDRESS_REGEX } from "@token/config/schemas.js";
import { type AuthEnv, requireAuth, requireKyc, requireMfa, requireOperationMfa } from "@token/middleware/auth.js";
import {
  addBankWhitelist,
  addXrplWhitelist,
  getBankWhitelist,
  getXrplWhitelist,
  removeBankWhitelist,
  removeXrplWhitelist,
} from "@token/services/whitelist.service.js";
import { HTTPException } from "hono/http-exception";

const app = new OpenAPIHono<AuthEnv>({ defaultHook: defaultHook() });

const readAuth = { security: [{ session: [] }], middleware: [requireAuth] };
const writeAuth = {
  security: [{ session: [] }],
  middleware: [requireAuth, requireKyc, requireMfa, requireOperationMfa],
};

const XrplWhitelistInput = z
  .object({
    address: z.string().regex(XRPL_ADDRESS_REGEX, "address must be a valid XRPL address"),
    label: z.string().min(1),
  })
  .meta({ id: "XrplWhitelistInput" });

const BankWhitelistInput = z
  .object({
    ...BankAccountFields,
    label: z.string().min(1),
  })
  .meta({ id: "BankWhitelistInput" });

app.openapi(
  createRoute({
    method: "get",
    path: "/whitelist/xrpl",
    summary: "List XRPL whitelist addresses",
    tags: ["Whitelist"],
    ...readAuth,
    responses: {
      200: {
        content: { "application/json": { schema: z.array(WhitelistAddressSchema) } },
        description: "XRP whitelist",
      },
      401: jsonError("Unauthorized"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    return c.json(serializeTimestamps(await getXrplWhitelist(uid)), 200);
  },
);

app.openapi(
  createRoute({
    method: "post",
    path: "/whitelist/xrpl",
    summary: "Add an XRPL whitelist address",
    tags: ["Whitelist"],
    ...writeAuth,
    request: { body: { content: { "application/json": { schema: XrplWhitelistInput } }, required: true } },
    responses: {
      201: { content: { "application/json": { schema: WhitelistAddressSchema } }, description: "Added" },
      400: jsonError("Validation error"),
      401: jsonError("Unauthorized"),
      403: jsonError("KYC/MFA required"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const { address, label } = c.req.valid("json");
    const entry = await addXrplWhitelist(uid, address, label);
    return c.json(serializeTimestamps(entry), 201);
  },
);

app.openapi(
  createRoute({
    method: "delete",
    path: "/whitelist/xrpl/{address}",
    summary: "Remove an XRPL whitelist address",
    tags: ["Whitelist"],
    ...writeAuth,
    request: { params: z.object({ address: z.string().meta({ param: { name: "address", in: "path" } }) }) },
    responses: {
      200: {
        content: { "application/json": { schema: z.object({ status: z.literal("ok") }) } },
        description: "Removed",
      },
      401: jsonError("Unauthorized"),
      403: jsonError("KYC/MFA required"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const { address } = c.req.valid("param");
    await removeXrplWhitelist(uid, address);
    return c.json({ status: "ok" as const }, 200);
  },
);

app.openapi(
  createRoute({
    method: "get",
    path: "/whitelist/bank",
    summary: "List bank whitelist accounts",
    tags: ["Whitelist"],
    ...readAuth,
    responses: {
      200: {
        content: { "application/json": { schema: z.array(BankWhitelistEntrySchema) } },
        description: "Bank whitelist",
      },
      401: jsonError("Unauthorized"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    return c.json(serializeTimestamps(await getBankWhitelist(uid)), 200);
  },
);

app.openapi(
  createRoute({
    method: "post",
    path: "/whitelist/bank",
    summary: "Add a bank whitelist account",
    tags: ["Whitelist"],
    ...writeAuth,
    request: { body: { content: { "application/json": { schema: BankWhitelistInput } }, required: true } },
    responses: {
      201: { content: { "application/json": { schema: BankWhitelistEntrySchema } }, description: "Added" },
      400: jsonError("Validation error"),
      401: jsonError("Unauthorized"),
      403: jsonError("KYC/MFA required"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const bankAccount = c.req.valid("json");
    const entry = await addBankWhitelist(uid, bankAccount);
    return c.json(serializeTimestamps(entry), 201);
  },
);

app.openapi(
  createRoute({
    method: "delete",
    path: "/whitelist/bank/{id}",
    summary: "Remove a bank whitelist account",
    tags: ["Whitelist"],
    ...writeAuth,
    request: { params: z.object({ id: z.string().meta({ param: { name: "id", in: "path" } }) }) },
    responses: {
      200: {
        content: { "application/json": { schema: z.object({ status: z.literal("ok") }) } },
        description: "Removed",
      },
      400: jsonError("Invalid id format"),
      401: jsonError("Unauthorized"),
      403: jsonError("KYC/MFA required"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const { id } = c.req.valid("param");
    const [branchCode, accountNumber] = id.split("-");
    if (!branchCode || !accountNumber) {
      throw new HTTPException(400, { message: "Invalid: id must be in format branchCode-accountNumber" });
    }
    await removeBankWhitelist(uid, branchCode, accountNumber);
    return c.json({ status: "ok" as const }, 200);
  },
);

export default app;
