import { TRPCError } from "@trpc/server";
import type { InventoryError } from "./services/inventory";
import type { ServiceError } from "./services/catalogue";
import type { UserServiceError } from "./services/users";

const INVENTORY_CODES = {
  NOT_FOUND: "NOT_FOUND",
  INVALID_TRANSITION: "BAD_REQUEST",
  FORBIDDEN: "FORBIDDEN",
  REASON_REQUIRED: "BAD_REQUEST",
  INVALID_QUANTITY: "BAD_REQUEST",
  INSUFFICIENT_STOCK: "CONFLICT",
  NOT_SELLABLE: "CONFLICT",
  CONFLICT: "CONFLICT",
} as const satisfies Record<InventoryError["code"], TRPCError["code"]>;

export function inventoryError(error: InventoryError): TRPCError {
  return new TRPCError({ code: INVENTORY_CODES[error.code], message: error.message });
}

const USER_CODES = {
  NOT_FOUND: "NOT_FOUND",
  EMAIL_TAKEN: "CONFLICT",
  LAST_ADMIN: "CONFLICT",
  INVALID_TOKEN: "BAD_REQUEST",
  WEAK_PASSWORD: "BAD_REQUEST",
  INACTIVE: "BAD_REQUEST",
} as const satisfies Record<UserServiceError["code"], TRPCError["code"]>;

export function userError(error: UserServiceError): TRPCError {
  return new TRPCError({ code: USER_CODES[error.code], message: error.message });
}

const SERVICE_CODES = { NOT_FOUND: "NOT_FOUND", CONFLICT: "CONFLICT", INVALID: "BAD_REQUEST" } as const;

export function serviceError(error: ServiceError): TRPCError {
  return new TRPCError({ code: SERVICE_CODES[error.code], message: error.message });
}
