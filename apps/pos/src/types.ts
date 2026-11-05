import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@ffa/api-types";

// One place that derives every shape from the API, so the app can't drift from it.
type Outputs = inferRouterOutputs<AppRouter>;
type Inputs = inferRouterInputs<AppRouter>;

export type Catalog = Outputs["pos"]["catalog"];
export type Piece = Catalog["pieces"][number];
export type PosEvent = Catalog["events"][number];
export type SaleResult = Outputs["sales"]["record"];
export type SaleDetail = SaleResult["sale"];
export type SaleSummary = Outputs["sales"]["today"]["sales"][number];
export type DaySummary = Outputs["sales"]["today"]["summary"];
export type SaleRequest = Inputs["sales"]["record"];
export type CustomerHit = Outputs["customers"]["search"][number];
export type NewCustomer = NonNullable<SaleRequest["newCustomer"]>;
