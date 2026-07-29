export type ProviderStatus = "active" | "archived";

export type AccessType =
  | "subscription"
  | "api"
  | "free_tier"
  | "trial"
  | "open_weights"
  | "local"
  | "included"
  | null;

export type RenewalKind =
  | "subscription_renewal"
  | "trial_expiration"
  | "promotional_price_expiration"
  | "manual_review";

export interface ProviderDto {
  id: string;
  name: string;
  slug: string;
  providerType: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  colour: string | null;
  notes: string | null;
  status: ProviderStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  activePlansCount: number;
  accessibleModelsCount: number;
  monthlyTotal: number | null;
  capabilityTags: string[];
}

export interface PlanModelRef {
  id: string;
  name: string;
  slug: string;
}

export interface QuotaDto {
  id: string;
  planId: string;
  name: string;
  amount: number | null;
  amountMin: number | null;
  amountMax: number | null;
  unit: string;
  customUnit: string | null;
  period: string;
  resetBehaviour: string | null;
  remainingAmount: number | null;
  remainingUpdatedAt: string | null;
  resetsAt: string | null;
  isUnlimited: boolean;
  notes: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PlanDto {
  id: string;
  accessProviderId: string;
  name: string;
  slug: string;
  planType: string | null;
  regularPrice: number | null;
  introductoryPrice: number | null;
  currency: string | null;
  billingInterval: string | null;
  renewalDate: string | null;
  billingPeriod: string | null;
  autoRenews: boolean | null;
  actualPrice: number | null;
  notes: string | null;
  startedAt: string | null;
  cancelledAt: string | null;
  introPriceExpiresAt: string | null;
  accessType: AccessType;
  status: ProviderStatus;
  accessProvider: {
    id: string;
    name: string;
    slug: string;
  };
  monthlyCost: number | null;
  includedModels: PlanModelRef[];
  quotas: QuotaDto[];
  createdAt: string;
  updatedAt: string;
}

export interface RenewalDto {
  kind: RenewalKind;
  date: string;
  entityType: "plan" | "model";
  entityId: string;
  title: string;
  subtitle: string | null;
  amount: number | null;
  currency: string | null;
  provider: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export interface ProvidersInitialData {
  providers: ProviderDto[];
  plans: PlanDto[];
  renewals: RenewalDto[];
}

export type ProvidersTab = "providers" | "plans" | "quotas" | "renewals";
export type ProviderViewMode = "grid" | "list";
