// ─────────────────────────────────────────────────────────────
// protection-guard.ts — Ensure the protection plan step is
// completed before captureBooking is called.
//
// MyStorage's internal Step 8 states:
//   "ALWAYS proactively offer [protection] to BOTH service
//    types. Wait for the customer to pick a tier (or decline)
//    before calling captureBooking."
//
// STOW's current bug: it skips this step entirely when the
// customer is eager to book quickly.
// ─────────────────────────────────────────────────────────────

import type { ProtectionTier, ProtectionCheckResult } from './types.js';

/** Protection plan details for customer display */
export const PROTECTION_PLANS = [
  {
    tier: 'BASIC' as const,
    label: 'Basic (Miễn phí)',
    labelEn: 'Basic (Free)',
    maxCoverageVND: 10_000_000,
    monthlyVND: 0,
  },
  {
    tier: 'SILVER' as const,
    label: 'Silver',
    labelEn: 'Silver',
    maxCoverageVND: 25_000_000,
    monthlyVND: null, // quoted per-unit
  },
  {
    tier: 'GOLD' as const,
    label: 'Gold',
    labelEn: 'Gold',
    maxCoverageVND: 50_000_000,
    monthlyVND: null,
  },
  {
    tier: 'PLATINUM' as const,
    label: 'Platinum',
    labelEn: 'Platinum',
    maxCoverageVND: 100_000_000,
    monthlyVND: null,
  },
] as const;

/**
 * Check whether the customer has been asked about and selected
 * a protection plan tier.
 *
 * @param tier  The current value — `null` means not yet asked.
 * @returns     Check result with customer-facing messages.
 */
export function checkProtectionPlan(tier: ProtectionTier): ProtectionCheckResult {
  if (tier !== null) {
    const plan = PROTECTION_PLANS.find(p => p.tier === tier);
    const label = plan?.label ?? tier;
    const labelEn = plan?.labelEn ?? tier;
    return {
      isResolved: true,
      messageVi: `Gói bảo hiểm đã chọn: ${label}.`,
      messageEn: `Protection plan selected: ${labelEn}.`,
    };
  }

  // Not yet selected — generate the upsell prompt
  const optionsVi = PROTECTION_PLANS.map(p => {
    const coverage = new Intl.NumberFormat('vi-VN').format(p.maxCoverageVND);
    const cost = p.monthlyVND === 0 ? 'miễn phí' : 'có phí';
    return `• ${p.label}: bồi thường tối đa ${coverage} VNĐ (${cost})`;
  }).join('\n');

  const optionsEn = PROTECTION_PLANS.map(p => {
    const coverage = new Intl.NumberFormat('en-US').format(p.maxCoverageVND);
    const cost = p.monthlyVND === 0 ? 'free' : 'paid';
    return `• ${p.labelEn}: up to ${coverage} VND coverage (${cost})`;
  }).join('\n');

  return {
    isResolved: false,
    messageVi:
      `Trước khi chốt đơn, anh/chị vui lòng chọn gói bảo hiểm cho đồ vật lưu trữ:\n${optionsVi}\n\nAnh/chị muốn chọn gói nào ạ?`,
    messageEn:
      `Before we finalise the booking, please choose a protection plan for your stored items:\n${optionsEn}\n\nWhich tier would you like?`,
  };
}
