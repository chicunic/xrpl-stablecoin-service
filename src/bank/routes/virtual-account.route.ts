import { type BankEnv, requireBankAuth } from "@bank/middleware/bank-auth.js";
import { getAccountById } from "@bank/services/account.service.js";
import {
  createVirtualAccount,
  getVirtualAccountById,
  listVirtualAccounts,
  updateVirtualAccount,
} from "@bank/services/virtual-account.service.js";
import { serializeTimestamps } from "@common/utils/json.replacer.js";
import { defaultHook, jsonError } from "@common/utils/problem.js";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";

const app = new OpenAPIHono<BankEnv>({ defaultHook: defaultHook() });

const auth = { security: [{ bearer: [] }], middleware: [requireBankAuth] };

const VirtualAccountIdParam = z.object({
  virtualAccountId: z.string().meta({ param: { name: "virtualAccountId", in: "path" } }),
});

const CreateVirtualAccountInput = z.object({ label: z.string().min(1) }).meta({ id: "CreateVirtualAccountInput" });

const PatchVirtualAccountInput = z
  .object({
    label: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .meta({ id: "PatchVirtualAccountInput" });

/** Shared corporate-account guard. */
async function requireCorporate(accountId: string): Promise<void> {
  const account = await getAccountById(accountId);
  if (account?.accountType !== "corporate") {
    throw new HTTPException(403, { message: "Invalid: only corporate accounts can manage virtual accounts" });
  }
}

app.openapi(
  createRoute({
    method: "post",
    path: "/accounts/me/virtual-accounts",
    summary: "Create a virtual account",
    tags: ["VirtualAccount"],
    ...auth,
    request: { body: { content: { "application/json": { schema: CreateVirtualAccountInput } }, required: true } },
    responses: {
      201: { content: { "application/json": { schema: z.any() } }, description: "Created" },
      400: jsonError("Validation error"),
      401: jsonError("Unauthorized"),
      403: jsonError("Corporate accounts only"),
    },
  }),
  async (c) => {
    const { accountId } = c.get("bankUser");
    await requireCorporate(accountId);
    const { label } = c.req.valid("json");
    const virtualAccount = await createVirtualAccount(accountId, label);
    return c.json(serializeTimestamps(virtualAccount), 201);
  },
);

app.openapi(
  createRoute({
    method: "get",
    path: "/accounts/me/virtual-accounts",
    summary: "List virtual accounts",
    tags: ["VirtualAccount"],
    ...auth,
    responses: {
      200: { content: { "application/json": { schema: z.any() } }, description: "Virtual accounts" },
      401: jsonError("Unauthorized"),
      403: jsonError("Corporate accounts only"),
    },
  }),
  async (c) => {
    const { accountId } = c.get("bankUser");
    await requireCorporate(accountId);
    const virtualAccounts = await listVirtualAccounts(accountId);
    return c.json(serializeTimestamps(virtualAccounts), 200);
  },
);

app.openapi(
  createRoute({
    method: "get",
    path: "/accounts/me/virtual-accounts/{virtualAccountId}",
    summary: "Get a virtual account",
    tags: ["VirtualAccount"],
    ...auth,
    request: { params: VirtualAccountIdParam },
    responses: {
      200: { content: { "application/json": { schema: z.any() } }, description: "Virtual account" },
      401: jsonError("Unauthorized"),
      403: jsonError("Corporate accounts only"),
      404: jsonError("Virtual account not found"),
    },
  }),
  async (c) => {
    const { accountId } = c.get("bankUser");
    await requireCorporate(accountId);
    const { virtualAccountId } = c.req.valid("param");
    const virtualAccount = await getVirtualAccountById(virtualAccountId);
    if (virtualAccount?.parentAccountId !== accountId) {
      throw new HTTPException(404, { message: "Virtual account not found" });
    }
    return c.json(serializeTimestamps(virtualAccount), 200);
  },
);

app.openapi(
  createRoute({
    method: "patch",
    path: "/accounts/me/virtual-accounts/{virtualAccountId}",
    summary: "Update a virtual account",
    tags: ["VirtualAccount"],
    ...auth,
    request: {
      params: VirtualAccountIdParam,
      body: { content: { "application/json": { schema: PatchVirtualAccountInput } }, required: true },
    },
    responses: {
      200: { content: { "application/json": { schema: z.any() } }, description: "Updated" },
      400: jsonError("Validation error"),
      401: jsonError("Unauthorized"),
      403: jsonError("Corporate accounts only"),
      404: jsonError("Virtual account not found"),
    },
  }),
  async (c) => {
    const { accountId } = c.get("bankUser");
    await requireCorporate(accountId);
    const { virtualAccountId } = c.req.valid("param");
    const virtualAccount = await getVirtualAccountById(virtualAccountId);
    if (virtualAccount?.parentAccountId !== accountId) {
      throw new HTTPException(404, { message: "Virtual account not found" });
    }
    const { label, isActive } = c.req.valid("json");
    const updated = await updateVirtualAccount(virtualAccountId, { label, isActive });
    return c.json(serializeTimestamps(updated), 200);
  },
);

export default app;
