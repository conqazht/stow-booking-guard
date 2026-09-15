# STOW Booking Policy Guard

> **Prototype** — Fixes a critical schedule policy precedence violation in [STOW](https://stow.mystorage.vn), MyStorage's AI personal assistant.
>
> Built for the **Product Engineering Intern (AI-Native)** application at [MyStorage](https://mystorage.vn/career/product-engineering-intern/).

---

## The Bug

When a customer requests a move-in at **21:00 on Sunday 20/09/2026**, STOW responds:

> ✅ "Thời gian dọn vào: 21:00 Chủ Nhật, ngày 20/09/2026"
> ⚠️ "...cách hiện tại hơn 3 ngày, hệ thống chưa thể xuất link thanh toán..."

**What STOW got right:** It caught the ">3 calendar days" rule and refused to issue a payment link.

**What STOW got wrong:** It completely missed two **higher-priority** violations:
1. **Sunday is a non-working day** — the policy says: *"do not confirm the date/time. Tell the customer CSKH will call back on the next working day."*
2. **21:00 is after-hours** — the policy says: *"tell the customer an after-hours surcharge applies."*

By confirming "21:00 Sunday" as the move-in time, STOW risks a customer showing up at a closed facility.

Additionally, STOW **skipped the mandatory protection plan upsell** (Step 8 in the internal booking flow requires asking the customer to choose Basic/Silver/Gold/Platinum *before* calling `captureBooking`).

## The Fix

This prototype implements a **pre-flight guard** that evaluates every booking request against MyStorage's `BOOKING_SCHEDULE_POLICY` in the correct precedence order:

| Priority | Rule | Severity | Action |
|----------|------|----------|--------|
| 1 | Non-working day (Sunday / holiday) | BLOCK | Do NOT confirm date. Route to CSKH. |
| 2 | Off-hours (before 09:00 or ≥ 18:00) | WARN | Warn about surcharge. CSKH confirms time. |
| 3 | Self Storage > 3 calendar days | DEFER | No payment link. Sales checks availability. |
| 4 | All clear | OK | Proceed with booking. |

A separate **protection plan guard** ensures the upsell step cannot be skipped.

### Key Design Decision: Timezone Handling

All date/time math uses explicit UTC+7 offset arithmetic, never `new Date().getDay()` or other runtime-local methods. This prevents timezone bugs when deployed on serverless platforms (Vercel, AWS Lambda) that run in UTC.

## Quick Start

```bash
# Install dependencies
npm install

# Run the evaluation suite (10 test cases)
npm test

# Open the interactive web demo
npx serve web
# Then open http://localhost:3000
```

## Project Structure

```
src/
  types.ts              # Shared type definitions
  schedule-guard.ts     # Schedule policy evaluation (4 rules, precedence order)
  protection-guard.ts   # Protection plan upsell gate
  format-response.ts    # Combined pre-flight check
tests/
  eval-suite.test.ts    # 10 test cases including exact reproduction of the bug
web/
  index.html            # Interactive demo (no build step needed)
```

## Evaluation Suite

| # | Scenario | Expected | What STOW does |
|---|----------|----------|----------------|
| 1 | 21:00 Sun 20/09 — Self Storage | BLOCK (Sunday) | ⚠️ Only catches ">3 days" |
| 2 | 10:00 Wed 17/09 — Self Storage | OK | ✅ |
| 3 | 20:00 Tue 16/09 — Self Storage | WARN (off-hours) | ❓ Untested |
| 4 | 10:00 Sat 27/09 — Self Storage | DEFER (>3 days) | ✅ |
| 5 | 10:00 Sat 27/09 — Valet | OK (no 3-day rule) | ✅ |
| 6 | 10:00 National Day 02/09 | BLOCK (holiday) | ❓ Untested |
| 7 | Protection = null | Block captureBooking | ⚠️ Skips entirely |
| 8 | Protection = BASIC | Allow | ✅ |
| 9 | Sun + no protection (combined) | 2+ messages, not ready | ⚠️ Fails |
| 10 | Wed 10:00 + BASIC (happy path) | Ready to book | ✅ |

## What Claude Code Produced That I Rejected

1. **Timezone bug:** Initial code used `new Date(dateString).getDay()` — this uses the runtime's local timezone. On Vercel (UTC), `21:00 Sunday Vietnam time` = `14:00 Sunday UTC` (same day by coincidence), but `01:00 Monday Vietnam` = `18:00 Sunday UTC` (flips the day). Rewrote with explicit `+07:00` offset arithmetic.

2. **Holiday check with `toLocaleDateString`:** Claude suggested using `Intl.DateTimeFormat` for holiday matching, which is locale-dependent and unreliable in CI/serverless. Replaced with simple UTC-offset string comparison.

3. **Missing precedence order:** The first draft evaluated all rules independently and returned them as a flat list. The policy explicitly defines a precedence hierarchy where higher-priority rules should suppress lower ones in the customer message. Restructured to evaluate sequentially and flag the *highest* severity.

## Hours Spent

~5 hours total (audit: ~1.5h, prototype: ~3h, documentation: ~0.5h)

## What I'd Do With Two More Hours

1. **Prompt rewrite:** Draft a replacement `BOOKING_SCHEDULE_POLICY` section for STOW's system prompt that enforces the precedence order directly in the LLM's reasoning, with explicit "check this BEFORE that" instructions.
2. **Lunar holiday support:** Integrate a Vietnamese lunar calendar API to cover Tết and Hùng Kings' Day, which are currently missing from the fixed-date holiday list.
3. **Integration test with Gemini API:** Use the Gemini SDK to simulate full booking conversations and verify the guard's output matches expected agent behavior end-to-end.

---

*Built by Trương Công Anh — September 2026*
