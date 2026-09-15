// ─────────────────────────────────────────────────────────────
// format-response.ts — Combine schedule + protection guard
// results into a single pre-flight check that the chat agent
// (or a human reviewer) can read.
// ─────────────────────────────────────────────────────────────

import type {
  BookingRequest,
  PreFlightResult,
} from './types.js';
import { evaluateSchedule } from './schedule-guard.js';
import { checkProtectionPlan } from './protection-guard.js';

/**
 * Run all pre-flight checks on a booking request.
 *
 * @param request  The booking request from the chat.
 * @param now      Current time (injectable for testing).
 * @returns        Combined evaluation with customer messages.
 */
export function runPreFlight(
  request: BookingRequest,
  now: Date = new Date(),
): PreFlightResult {
  const schedule = evaluateSchedule(
    request.moveInDate,
    request.serviceType,
    now,
  );
  const protection = checkProtectionPlan(request.protectionPlanTier);

  const customerMessagesVi: string[] = [];
  const customerMessagesEn: string[] = [];

  // Schedule violations (already ordered by precedence)
  for (const v of schedule.violations) {
    customerMessagesVi.push(v.messageVi);
    customerMessagesEn.push(v.messageEn);
  }

  // Protection plan
  if (!protection.isResolved) {
    customerMessagesVi.push(protection.messageVi);
    customerMessagesEn.push(protection.messageEn);
  }

  const readyToBook =
    schedule.canIssuePaymentLink &&
    schedule.canConfirmSchedule &&
    protection.isResolved;

  return {
    schedule,
    protection,
    readyToBook,
    customerMessagesVi,
    customerMessagesEn,
  };
}
