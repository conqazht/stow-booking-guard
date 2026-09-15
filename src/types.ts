// ─────────────────────────────────────────────────────────────
// types.ts — Shared type definitions for STOW Booking Guard
// ─────────────────────────────────────────────────────────────

/** Service type offered by MyStorage */
export type ServiceType = 'SELF_STORAGE' | 'VALET_STORAGE';

/** Protection plan tiers (Basic is free, others are paid) */
export type ProtectionTier = 'BASIC' | 'SILVER' | 'GOLD' | 'PLATINUM' | null;

/** A booking request as it would arrive from the chat agent */
export interface BookingRequest {
  /** Customer full name */
  fullName: string;
  /** Customer email */
  email: string;
  /** Customer phone */
  phone: string;
  /** Location slug, e.g. "375-vo-nguyen-giap" */
  locationSlug: string;
  /** Cubic metres requested */
  customCBM: number;
  /** Self Storage or Valet */
  serviceType: ServiceType;
  /** Whether the unit is air-conditioned */
  isAirConditioned: boolean;
  /** Desired move-in date+time as ISO-8601 string */
  moveInDate: string;
  /** Rental duration in months */
  storageDuration: number;
  /** Customer's chosen protection tier (null = not yet asked) */
  protectionPlanTier: ProtectionTier;
}

// ── Schedule Policy evaluation ──────────────────────────────

/** Which policy rule was triggered */
export type PolicyRuleId =
  | 'NON_WORKING_DAY'      // Sunday or configured holiday
  | 'OFF_HOURS'            // Before 09:00 or >= 18:00 on a working day
  | 'SELF_STORAGE_GT_3D'   // Self Storage move-in > 3 calendar days away
  | 'PASSED';              // All checks passed

/** Severity mirrors the precedence order in the internal policy */
export type PolicySeverity = 'BLOCK' | 'WARN' | 'DEFER' | 'OK';

/** Result of evaluating one policy rule */
export interface PolicyViolation {
  ruleId: PolicyRuleId;
  severity: PolicySeverity;
  /** Human-readable explanation (Vietnamese) */
  messageVi: string;
  /** Human-readable explanation (English) */
  messageEn: string;
}

/** Full evaluation result */
export interface ScheduleEvaluation {
  /** The move-in datetime interpreted in Vietnam time (UTC+7) */
  vietnamTime: string;
  /** Day of week in Vietnam time (0=Sun, 6=Sat) */
  dayOfWeek: number;
  /** Hour in Vietnam time (0-23) */
  hour: number;
  /** Whether the date falls on a configured Vietnam holiday */
  isHoliday: boolean;
  /** Whether the date is Sunday */
  isSunday: boolean;
  /** Whether the time is outside 09:00–17:59 */
  isOffHours: boolean;
  /** Calendar days from `now` to move-in (in Vietnam time) */
  calendarDaysAway: number;
  /** All triggered violations, ordered by precedence (highest first) */
  violations: PolicyViolation[];
  /** Whether AI may issue a payment link */
  canIssuePaymentLink: boolean;
  /** Whether AI may confirm the move-in date/time to the customer */
  canConfirmSchedule: boolean;
}

// ── Protection Plan guard ───────────────────────────────────

export interface ProtectionCheckResult {
  /** true if the customer has been asked & answered */
  isResolved: boolean;
  /** Explanation */
  messageVi: string;
  messageEn: string;
}

// ── Combined pre-flight check ───────────────────────────────

export interface PreFlightResult {
  schedule: ScheduleEvaluation;
  protection: ProtectionCheckResult;
  /** true only when BOTH guards pass */
  readyToBook: boolean;
  /** Consolidated customer-facing messages (Vietnamese) */
  customerMessagesVi: string[];
  /** Consolidated customer-facing messages (English) */
  customerMessagesEn: string[];
}
