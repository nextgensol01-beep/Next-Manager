import { EMAIL_DELIVERY_SECURITY_DEFAULTS, type DeliveryPolicy } from "./email-delivery-security";

export const DELIVERY_POLICY_KEYS = Object.keys(EMAIL_DELIVERY_SECURITY_DEFAULTS) as Array<keyof DeliveryPolicy>;

/** Compare policy fields only, with stable ordering and defaults for older responses. */
export function normalizeDeliveryPolicy(value: Partial<DeliveryPolicy>): DeliveryPolicy {
  return Object.fromEntries(DELIVERY_POLICY_KEYS.map(key => {
    const fallback = EMAIL_DELIVERY_SECURITY_DEFAULTS[key];
    const raw = value[key] ?? fallback;
    return [key, typeof fallback === "number" ? Number(raw) : raw];
  })) as DeliveryPolicy;
}

export function changedDeliveryPolicyKeys(saved: Partial<DeliveryPolicy>, draft: Partial<DeliveryPolicy>) {
  const baseline = normalizeDeliveryPolicy(saved), current = normalizeDeliveryPolicy(draft);
  return DELIVERY_POLICY_KEYS.filter(key => baseline[key] !== current[key]);
}

/** A separate PIN/email update must not overwrite edits to normal policy controls. */
export function rebaseDeliveryPolicy(saved: Partial<DeliveryPolicy>, draft: Partial<DeliveryPolicy>, incoming: Partial<DeliveryPolicy>) {
  const modified = changedDeliveryPolicyKeys(saved, draft);
  const current = normalizeDeliveryPolicy(draft);
  const next = normalizeDeliveryPolicy(incoming);
  return Object.fromEntries(DELIVERY_POLICY_KEYS.map(key => [key, modified.includes(key) ? current[key] : next[key]])) as DeliveryPolicy;
}
