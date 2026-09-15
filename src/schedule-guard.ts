// ─────────────────────────────────────────────────────────────
// schedule-guard.ts — Evaluate booking schedule against
// MyStorage's internal BOOKING_SCHEDULE_POLICY.
//
// Key design decision: ALL date/time math is done in Vietnam
// time (UTC+7) using Intl.DateTimeFormat, NOT the server's
// local timezone. This prevents bugs when deployed on
// serverless platforms (Vercel, AWS Lambda) that run in UTC.
//
// AI-REJECTED CODE NOTE:
//   Claude Code initially generated `new Date(iso).getDay()`
//   which uses the runtime's local TZ. On Vercel (UTC),
//   21:00 Sunday VN time = 14:00 Sunday UTC — happens to be
//   the same day here, but 01:00 Monday VN time = 18:00
//   Sunday UTC, flipping the day-of-week entirely.
//   Rewrote to use explicit UTC+7 offset arithmetic.
// ─────────────────────────────────────────────────────────────

import type {
  BookingRequest,
  PolicyViolation,
  ScheduleEvaluation,
  ServiceType,
} from './types.js';

// ── Vietnam timezone helpers ────────────────────────────────

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7

/**
 * Convert any Date to its Vietnam-time components without
 * relying on the runtime's local timezone.
 */
function toVietnamParts(date: Date) {
  const vnMs = date.getTime() + VN_OFFSET_MS;
  const vnDate = new Date(vnMs);
  return {
    year: vnDate.getUTCFullYear(),
    month: vnDate.getUTCMonth(),     // 0-indexed
    day: vnDate.getUTCDate(),
    dayOfWeek: vnDate.getUTCDay(),   // 0=Sun
    hour: vnDate.getUTCHours(),
    minute: vnDate.getUTCMinutes(),
  };
}

/**
 * Format a Date as a readable Vietnam-time string.
 */
function formatVietnamTime(date: Date): string {
  const p = toVietnamParts(date);
  const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const dd = String(p.day).padStart(2, '0');
  const mm = String(p.month + 1).padStart(2, '0');
  const hh = String(p.hour).padStart(2, '0');
  const mi = String(p.minute).padStart(2, '0');
  return `${days[p.dayOfWeek]}, ${dd}/${mm}/${p.year} ${hh}:${mi} (UTC+7)`;
}

/**
 * Calendar-day difference in Vietnam time (ignoring hours).
 */
function calendarDaysAway(now: Date, target: Date): number {
  const nowParts = toVietnamParts(now);
  const tgtParts = toVietnamParts(target);
  // Build day-only UTC timestamps
  const nowDay = Date.UTC(nowParts.year, nowParts.month, nowParts.day);
  const tgtDay = Date.UTC(tgtParts.year, tgtParts.month, tgtParts.day);
  return Math.round((tgtDay - nowDay) / (24 * 60 * 60 * 1000));
}

// ── Vietnam public holidays (fixed-date, 2024-2027) ────────

const VIETNAM_HOLIDAYS: string[] = [
  // New Year
  '01-01',
  // Reunification Day
  '04-30',
  // Labour Day
  '05-01',
  // National Day
  '09-02',
  // NOTE: Lunar holidays (Tết, Hùng Kings) vary by year and
  // should be loaded from a config or API. For this prototype
  // we include the fixed-date holidays only.
];

function isVietnamHoliday(date: Date): boolean {
  const p = toVietnamParts(date);
  const mmdd = `${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  return VIETNAM_HOLIDAYS.includes(mmdd);
}

// ── Working hours ───────────────────────────────────────────

const WORK_START = 9;   // 09:00
const WORK_END   = 18;  // 18:00 (i.e. 17:59 is the last working minute)

function isOffHours(hour: number): boolean {
  return hour < WORK_START || hour >= WORK_END;
}

// ── Main evaluation function ────────────────────────────────

/**
 * Evaluate a proposed move-in date/time against MyStorage's
 * BOOKING_SCHEDULE_POLICY.
 *
 * The policy defines a strict **precedence order**:
 *   1. Non-working day (Sunday / holiday)  →  BLOCK
 *   2. Off-hours on a working day          →  WARN
 *   3. Self Storage > 3 calendar days      →  DEFER
 *   4. All clear                           →  OK
 *
 * STOW's current bug: it evaluates rule 3 first (or only),
 * so it misses rules 1 and 2 when they co-occur.
 */
export function evaluateSchedule(
  moveInDateISO: string,
  serviceType: ServiceType,
  now: Date = new Date(),
): ScheduleEvaluation {
  const moveIn = new Date(moveInDateISO);
  if (isNaN(moveIn.getTime())) {
    throw new Error(`Invalid date: "${moveInDateISO}"`);
  }

  const vnParts = toVietnamParts(moveIn);
  const isSunday = vnParts.dayOfWeek === 0;
  const holiday = isVietnamHoliday(moveIn);
  const offHours = isOffHours(vnParts.hour);
  const daysAway = calendarDaysAway(now, moveIn);

  const violations: PolicyViolation[] = [];

  // ── Rule 1 (highest priority): Non-working day ──────────
  if (isSunday || holiday) {
    const reason = isSunday ? 'Chủ Nhật' : 'ngày lễ';
    const reasonEn = isSunday ? 'Sunday' : 'a public holiday';
    violations.push({
      ruleId: 'NON_WORKING_DAY',
      severity: 'BLOCK',
      messageVi:
        `Ngày ${formatVietnamTime(moveIn)} là ${reason} — MyStorage không hoạt động. ` +
        `Bộ phận CSKH sẽ liên hệ anh/chị vào ngày làm việc tiếp theo để sắp xếp lịch phù hợp.`,
      messageEn:
        `${formatVietnamTime(moveIn)} falls on ${reasonEn} — MyStorage is closed. ` +
        `Our support team will contact you on the next working day to arrange a suitable schedule.`,
    });
  }

  // ── Rule 2: Off-hours on a working day ──────────────────
  if (!isSunday && !holiday && offHours) {
    violations.push({
      ruleId: 'OFF_HOURS',
      severity: 'WARN',
      messageVi:
        `Thời gian ${vnParts.hour}:${String(vnParts.minute).padStart(2, '0')} nằm ngoài giờ làm việc (09:00–18:00). ` +
        `Có thể phát sinh phụ phí ngoài giờ. CSKH sẽ xác nhận khung giờ chính xác và mức phụ phí cho anh/chị.`,
      messageEn:
        `The requested time ${vnParts.hour}:${String(vnParts.minute).padStart(2, '0')} is outside working hours (09:00–18:00). ` +
        `An after-hours surcharge may apply. Our team will confirm the exact time slot and surcharge.`,
    });
  }

  // ── Rule 3: Self Storage > 3 calendar days ──────────────
  if (serviceType === 'SELF_STORAGE' && daysAway > 3) {
    violations.push({
      ruleId: 'SELF_STORAGE_GT_3D',
      severity: 'DEFER',
      messageVi:
        `Ngày dọn vào còn ${daysAway} ngày nữa (trên 3 ngày), hệ thống chưa thể xuất link thanh toán tự động. ` +
        `Bộ phận CSKH/Sales sẽ kiểm tra lịch kho trống và liên hệ anh/chị sau.`,
      messageEn:
        `The move-in date is ${daysAway} days away (more than 3). The system cannot issue an automatic payment link yet. ` +
        `Our Sales team will check availability and get back to you.`,
    });
  }

  // Determine aggregate flags
  const hasBlock = violations.some(v => v.severity === 'BLOCK');
  const hasWarn  = violations.some(v => v.severity === 'WARN');
  const hasDefer = violations.some(v => v.severity === 'DEFER');

  return {
    vietnamTime: formatVietnamTime(moveIn),
    dayOfWeek: vnParts.dayOfWeek,
    hour: vnParts.hour,
    isHoliday: holiday,
    isSunday,
    isOffHours: offHours,
    calendarDaysAway: daysAway,
    violations,
    canIssuePaymentLink: !hasBlock && !hasWarn && !hasDefer,
    canConfirmSchedule: !hasBlock && !hasWarn,
  };
}
