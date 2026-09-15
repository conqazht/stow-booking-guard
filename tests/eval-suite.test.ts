// ─────────────────────────────────────────────────────────────
// eval-suite.test.ts — Evaluation suite proving the guard
// catches the bugs that STOW currently misses.
//
// Each test case maps to a real or realistic customer
// conversation scenario.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { evaluateSchedule } from '../src/schedule-guard.js';
import { checkProtectionPlan } from '../src/protection-guard.js';
import { runPreFlight } from '../src/format-response.js';
import type { BookingRequest } from '../src/types.js';

// Fixed "now" for deterministic tests: Mon 15 Sep 2026 22:00 VN time
// = Mon 15 Sep 2026 15:00 UTC
const NOW = new Date('2026-09-15T15:00:00Z');

// Helper to build a booking request
function makeRequest(overrides: Partial<BookingRequest> = {}): BookingRequest {
  return {
    fullName: 'Trương Công Anh',
    email: 'conganhtruongw@gmail.com',
    phone: '0372823435',
    locationSlug: '375-vo-nguyen-giap',
    customCBM: 2,
    serviceType: 'SELF_STORAGE',
    isAirConditioned: false,
    moveInDate: '2026-09-20T14:00:00+07:00', // default: Sat within hours
    storageDuration: 1,
    protectionPlanTier: 'BASIC',
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════
// TEST GROUP 1: Schedule Policy Guard
// ═════════════════════════════════════════════════════════════

describe('Schedule Policy Guard', () => {

  // ── THE REAL BUG: Exact reproduction of the actual chat ──
  it('TEST 1 — 21:00 Sunday 20/09/2026: should trigger NON_WORKING_DAY (rule #1) as HIGHEST priority', () => {
    // This is the exact scenario from the applicant's audit:
    // Customer asked: "dọn vào lúc 21h tối Chủ Nhật ngày 20/09/2026"
    // STOW only caught ">3 days" and confirmed the Sunday time.
    const result = evaluateSchedule(
      '2026-09-20T14:00:00Z', // 21:00 VN time (14:00 UTC)
      'SELF_STORAGE',
      NOW,
    );

    // Must detect Sunday
    expect(result.isSunday).toBe(true);
    // Must detect off-hours (21:00 >= 18:00)
    expect(result.isOffHours).toBe(true);
    // Must have violations
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    // FIRST violation must be NON_WORKING_DAY (highest precedence)
    expect(result.violations[0].ruleId).toBe('NON_WORKING_DAY');
    expect(result.violations[0].severity).toBe('BLOCK');
    // Must NOT allow confirming the schedule
    expect(result.canConfirmSchedule).toBe(false);
    // Must NOT allow payment link
    expect(result.canIssuePaymentLink).toBe(false);
  });

  it('TEST 2 — Wednesday 17/09/2026 10:00: normal working day within 3 days → all clear', () => {
    const result = evaluateSchedule(
      '2026-09-17T03:00:00Z', // 10:00 VN time
      'SELF_STORAGE',
      NOW,
    );

    expect(result.isSunday).toBe(false);
    expect(result.isOffHours).toBe(false);
    expect(result.calendarDaysAway).toBe(2);
    expect(result.violations).toHaveLength(0);
    expect(result.canConfirmSchedule).toBe(true);
    expect(result.canIssuePaymentLink).toBe(true);
  });

  it('TEST 3 — Tuesday 16/09/2026 20:00: off-hours on working day → WARN', () => {
    const result = evaluateSchedule(
      '2026-09-16T13:00:00Z', // 20:00 VN time
      'SELF_STORAGE',
      NOW,
    );

    expect(result.isSunday).toBe(false);
    expect(result.isOffHours).toBe(true);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].ruleId).toBe('OFF_HOURS');
    expect(result.violations[0].severity).toBe('WARN');
    // Off-hours: cannot confirm schedule (CSKH must confirm)
    expect(result.canConfirmSchedule).toBe(false);
    expect(result.canIssuePaymentLink).toBe(false);
  });

  it('TEST 4 — Saturday 26/09/2026 10:00: Self Storage > 3 days → DEFER', () => {
    const result = evaluateSchedule(
      '2026-09-26T03:00:00Z', // 10:00 VN time on Sat Sep 26, 11 days away
      'SELF_STORAGE',
      NOW,
    );

    expect(result.isSunday).toBe(false);
    expect(result.isOffHours).toBe(false);
    expect(result.calendarDaysAway).toBe(11);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].ruleId).toBe('SELF_STORAGE_GT_3D');
    expect(result.violations[0].severity).toBe('DEFER');
    // Can confirm the date (it's valid), but no payment link
    expect(result.canConfirmSchedule).toBe(true);
    expect(result.canIssuePaymentLink).toBe(false);
  });

  it('TEST 5 — Valet on Saturday 26/09/2026 10:00: > 3 days but Valet → no DEFER rule', () => {
    const result = evaluateSchedule(
      '2026-09-26T03:00:00Z', // 10:00 VN time on Sat Sep 26
      'VALET_STORAGE',
      NOW,
    );

    // Valet is exempt from the 3-day rule
    expect(result.violations).toHaveLength(0);
    expect(result.canConfirmSchedule).toBe(true);
  });

  it('TEST 6 — National Day 02/09/2026 10:00: holiday → BLOCK', () => {
    const result = evaluateSchedule(
      '2026-09-02T03:00:00Z', // 10:00 VN time on Sep 2 (National Day)
      'SELF_STORAGE',
      new Date('2026-08-31T15:00:00Z'), // "now" = Aug 31
    );

    expect(result.isHoliday).toBe(true);
    expect(result.violations[0].ruleId).toBe('NON_WORKING_DAY');
    expect(result.violations[0].severity).toBe('BLOCK');
    expect(result.canConfirmSchedule).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════
// TEST GROUP 2: Protection Plan Guard
// ═════════════════════════════════════════════════════════════

describe('Protection Plan Guard', () => {

  it('should BLOCK booking when protection plan is null (not yet asked)', () => {
    const result = checkProtectionPlan(null);
    expect(result.isResolved).toBe(false);
    expect(result.messageVi).toContain('gói bảo hiểm');
    expect(result.messageVi).toContain('Basic');
    expect(result.messageVi).toContain('Platinum');
  });

  it('should PASS when customer selected BASIC', () => {
    const result = checkProtectionPlan('BASIC');
    expect(result.isResolved).toBe(true);
  });

  it('should PASS when customer selected GOLD', () => {
    const result = checkProtectionPlan('GOLD');
    expect(result.isResolved).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════
// TEST GROUP 3: Combined Pre-Flight (end-to-end)
// ═════════════════════════════════════════════════════════════

describe('Pre-Flight Check (combined)', () => {

  it('REAL BUG SCENARIO: Sunday 21:00 + no protection → readyToBook = false with 2+ messages', () => {
    const req = makeRequest({
      moveInDate: '2026-09-20T14:00:00Z', // 21:00 Sunday VN
      protectionPlanTier: null,
    });
    const result = runPreFlight(req, NOW);

    expect(result.readyToBook).toBe(false);
    // Should have at least: NON_WORKING_DAY message + protection upsell
    expect(result.customerMessagesVi.length).toBeGreaterThanOrEqual(2);
    // First message should be about Sunday (highest priority)
    expect(result.customerMessagesVi[0]).toContain('Chủ Nhật');
  });

  it('HAPPY PATH: Wed 10:00 + BASIC protection → readyToBook = true', () => {
    const req = makeRequest({
      moveInDate: '2026-09-17T03:00:00Z', // Wed 10:00 VN
      protectionPlanTier: 'BASIC',
    });
    const result = runPreFlight(req, NOW);

    expect(result.readyToBook).toBe(true);
    expect(result.customerMessagesVi).toHaveLength(0);
  });
});
