import {
  type BankEnv,
  generateApiToken,
  generateToken,
  rejectApiToken,
  requireBankAuth,
} from "@bank/middleware/bank-auth.js";
import {
  changePin,
  createAccount,
  getAccountById,
  login,
  lookupAccount,
  updateAccount,
} from "@bank/services/account.service.js";
import { serializeTimestamps } from "@common/utils/json.replacer.js";
import { defaultHook, jsonError } from "@common/utils/problem.js";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";

const app = new OpenAPIHono<BankEnv>({ defaultHook: defaultHook() });

const PinSchema = z.string().regex(/^[0-9]{4}$/, "pin must be 4 digits");

const protectedRoute = { security: [{ bearer: [] }], middleware: [requireBankAuth, rejectApiToken] };

const CreateAccountInput = z
  .object({
    pin: PinSchema,
    accountHolder: z.string().min(1),
    accountType: z.enum(["personal", "corporate"]).optional().default("personal"),
  })
  .meta({ id: "CreateAccountInput" });

const LoginInput = z
  .object({
    branchCode: z.string().min(1),
    accountNumber: z.string().min(1),
    pin: PinSchema,
  })
  .meta({ id: "BankLoginInput" });

const PatchAccountInput = z
  .object({
    accountHolder: z.string().min(1).optional(),
    pin: PinSchema.optional(),
    oldPin: PinSchema.optional(),
    pubsubEnabled: z.boolean().optional(),
  })
  .meta({ id: "PatchAccountInput" });

app.openapi(
  createRoute({
    method: "post",
    path: "/accounts",
    summary: "Create a bank account",
    tags: ["Account"],
    request: { body: { content: { "application/json": { schema: CreateAccountInput } }, required: true } },
    responses: {
      201: { content: { "application/json": { schema: z.any() } }, description: "Account created" },
      400: jsonError("Validation error"),
    },
  }),
  async (c) => {
    const { pin, accountHolder, accountType } = c.req.valid("json");
    const account = await createAccount(pin, accountHolder, accountType);
    return c.json(serializeTimestamps(account), 201);
  },
);

app.openapi(
  createRoute({
    method: "post",
    path: "/accounts/login",
    summary: "Log in to a bank account",
    tags: ["Account"],
    request: { body: { content: { "application/json": { schema: LoginInput } }, required: true } },
    responses: {
      200: { content: { "application/json": { schema: z.any() } }, description: "Logged in" },
      400: jsonError("Invalid credentials"),
    },
  }),
  async (c) => {
    const { branchCode, accountNumber, pin } = c.req.valid("json");
    const account = await login(branchCode, accountNumber, pin);
    const token = generateToken(account.accountId);
    const { pin: _pin, ...safeAccount } = account;
    void _pin;
    return c.json(serializeTimestamps({ token, account: safeAccount }), 200);
  },
);

app.openapi(
  createRoute({
    method: "post",
    path: "/accounts/logout",
    summary: "Log out (client-side token clear)",
    tags: ["Account"],
    responses: {
      200: { content: { "application/json": { schema: z.object({ message: z.string() }) } }, description: "OK" },
    },
  }),
  (c) => c.json({ message: "Logged out" }, 200),
);

app.openapi(
  createRoute({
    method: "get",
    path: "/accounts/lookup",
    summary: "Look up an account by branch and account number",
    tags: ["Account"],
    request: {
      query: z.object({
        branchCode: z
          .string()
          .min(1)
          .meta({ param: { name: "branchCode", in: "query" } }),
        accountNumber: z
          .string()
          .min(1)
          .meta({ param: { name: "accountNumber", in: "query" } }),
      }),
    },
    responses: {
      200: { content: { "application/json": { schema: z.any() } }, description: "Account" },
      400: jsonError("Validation error"),
      404: jsonError("Account not found"),
    },
  }),
  async (c) => {
    const { branchCode, accountNumber } = c.req.valid("query");
    const result = await lookupAccount(branchCode, accountNumber);
    if (!result) {
      throw new HTTPException(404, { message: "Account not found" });
    }
    return c.json(serializeTimestamps(result), 200);
  },
);

app.openapi(
  createRoute({
    method: "get",
    path: "/accounts/me",
    summary: "Get the current account",
    tags: ["Account"],
    ...protectedRoute,
    responses: {
      200: { content: { "application/json": { schema: z.any() } }, description: "Account" },
      401: jsonError("Unauthorized"),
      404: jsonError("Account not found"),
    },
  }),
  async (c) => {
    const { accountId } = c.get("bankUser");
    const account = await getAccountById(accountId);
    if (!account) {
      throw new HTTPException(404, { message: "Account not found" });
    }
    const { pin: _pin, ...safeAccount } = account;
    void _pin;
    return c.json(serializeTimestamps(safeAccount), 200);
  },
);

app.openapi(
  createRoute({
    method: "post",
    path: "/accounts/me/api-token",
    summary: "Generate an API token (corporate only)",
    tags: ["Account"],
    ...protectedRoute,
    responses: {
      200: { content: { "application/json": { schema: z.object({ token: z.string() }) } }, description: "Token" },
      401: jsonError("Unauthorized"),
      403: jsonError("Corporate accounts only"),
      404: jsonError("Account not found"),
    },
  }),
  async (c) => {
    const { accountId } = c.get("bankUser");
    const account = await getAccountById(accountId);
    if (!account) {
      throw new HTTPException(404, { message: "Account not found" });
    }
    if (account.accountType !== "corporate") {
      throw new HTTPException(403, { message: "API token generation is only available for corporate accounts" });
    }
    return c.json({ token: generateApiToken(accountId) }, 200);
  },
);

app.openapi(
  createRoute({
    method: "patch",
    path: "/accounts/me",
    summary: "Update the current account",
    tags: ["Account"],
    ...protectedRoute,
    request: { body: { content: { "application/json": { schema: PatchAccountInput } }, required: true } },
    responses: {
      200: { content: { "application/json": { schema: z.any() } }, description: "Updated" },
      400: jsonError("Validation error"),
      401: jsonError("Unauthorized"),
      403: jsonError("Corporate accounts only"),
    },
  }),
  async (c) => {
    const { accountId } = c.get("bankUser");
    const { accountHolder, pin, oldPin, pubsubEnabled } = c.req.valid("json");

    if (pin !== undefined) {
      if (!oldPin) {
        throw new HTTPException(400, { message: "Invalid: oldPin is required to change PIN" });
      }
      await changePin(accountId, oldPin, pin);
    }

    if (pubsubEnabled !== undefined) {
      const account = await getAccountById(accountId);
      if (account?.accountType !== "corporate") {
        throw new HTTPException(403, { message: "Pub/Sub notifications are only available for corporate accounts" });
      }
    }

    if (accountHolder !== undefined || pubsubEnabled !== undefined) {
      const updated = await updateAccount(accountId, { accountHolder, pubsubEnabled });
      return c.json(serializeTimestamps(updated), 200);
    }

    if (pin !== undefined) {
      return c.json({ message: "PIN updated successfully" }, 200);
    }

    throw new HTTPException(400, { message: "Invalid: no update fields provided" });
  },
);

export default app;
