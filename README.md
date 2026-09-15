# STOW Booking Policy Guard

> A pre-flight validation guard and evaluation suite enforcing business schedule policies and upsell gates for storage booking assistants.

---

## Problem Statement

When conversational agents handle live booking flows, prompt-only constraints can fail to enforce strict business rules under edge cases. 

For example, when a customer requests a move-in at **21:00 on Sunday 20/09/2026**:
- **Expected:** Rule precedence #1 (Sunday is non-working) should immediately BLOCK confirmation and route to CSKH, while Rule #2 warns of after-hours surcharges.
- **Observed in production LLMs:** The model often latches onto lower-priority rules (e.g. `> 3 calendar days`), while prematurely acknowledging the invalid Sunday date/time and skipping mandatory add-on offers (such as protection plans).

## Solution Architecture

This repository implements a deterministic pre-flight guard layered before the booking capture tool call:

| Priority | Rule | Severity | Enforcement Action |
|:---:|---|:---:|---|
| **1** | Non-working day (Sunday / holiday) | **BLOCK** | Prohibits date confirmation; triggers next-working-day callback |
| **2** | Off-hours (before 09:00 or ≥ 18:00) | **WARN** | Flags after-hours surcharge; requires CSKH schedule confirmation |
| **3** | Self Storage > 3 calendar days | **DEFER** | Suppresses automated payment link; defers to team availability check |
| **4** | Valid schedule | **OK** | Proceeds with automated booking flow |

Additionally, a **Protection Plan Guard** gates the flow until the customer explicitly selects or declines a coverage tier (Basic, Silver, Gold, Platinum).

### Timezone Integrity (UTC+7)

All calendar and time calculations use explicit Vietnam time (Asia/Ho_Chi_Minh, UTC+7) offset arithmetic. This ensures invariant behavior across cloud runtimes (e.g. AWS Lambda, Vercel Edge) that execute in UTC.

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Evaluation Suite (11 Test Cases)
```bash
npm test
```

### 3. Run Interactive Side-by-Side Web Demo
```bash
npx serve web
# Open http://localhost:3000 in your browser
```

---

## Project Structure

```
src/
  ├── types.ts              # Domain types, policy violations & severity levels
  ├── schedule-guard.ts     # Precedence-ordered schedule policy logic (UTC+7)
  ├── protection-guard.ts   # Protection plan upsell gate
  └── format-response.ts    # Consolidated pre-flight evaluation & messaging
tests/
  └── eval-suite.test.ts    # 11 automated test cases with vitest
web/
  └── index.html            # Side-by-side interactive comparison demo
```

---

## Evaluation Suite Summary

| # | Scenario | Severity | Guard Action |
|---|----------|:---:|---|
| 1 | 21:00 Sun 20/09 — Self Storage | `BLOCK` | Blocks Sunday move-in; triggers Monday CSKH callback |
| 2 | 10:00 Wed 17/09 — Self Storage | `OK` | Normal working hours within 3 days; approved |
| 3 | 20:00 Tue 16/09 — Self Storage | `WARN` | Flags after-hours surcharge; requires team confirmation |
| 4 | 10:00 Sat 26/09 — Self Storage | `DEFER` | Defers automated payment link (> 3 days); routes to Sales |
| 5 | 10:00 Sat 26/09 — Valet Storage | `OK` | Valet policy exempt from 3-day rule; schedule approved |
| 6 | 10:00 National Day 02/09 | `BLOCK` | Detects public holiday; blocks confirmation |
| 7 | Protection Plan = `null` | `GATE` | Blocks booking until customer selects/declines protection tier |
| 8 | Protection Plan = `BASIC` | `OK` | Protection resolved; allowed to proceed |
| 9 | Protection Plan = `GOLD` | `OK` | Protection resolved; allowed to proceed |
| 10 | Sun 21:00 + No Protection | `BLOCK` | Aggregates multiple violations; halts booking capture |
| 11 | Wed 10:00 + BASIC (Happy path) | `READY` | Full pre-flight passed; ready for payment link |
