# REDESIGN-AUDIT — debtpayoff-ai (2026-10-13)

Competitors referenced: **Undebt.it** (account list, strategy switch, pay-off-by-date, payment logging, snowflakes, balance graphs), **Undebt.it+** (deadline debts, bank sync).

## Visual gaps vs competitors
- The balance-over-time chart is a bare polyline: no gridlines, no dollar axis, no month labels, no area fill, no markers for when each debt dies. Undebt.it's balance-tracking graphs make progress tangible; this one reads as a wireframe.
- Debt rows are flat ledger lines — no payoff-order ranking, no visual "attack target" marker, no deadline urgency.
- Results stack many equal-weight cards; the single most motivating artifact (the curve + the first win) doesn't lead.

## Functional gaps vs competitors
1. **No per-debt pay-off-by-date.** Undebt.it+'s headline feature: give any debt a deadline (0% promo, BNPL, tax bill) and the plan guarantees it, showing exactly what it costs vs the plain strategy. DebtPayoff only has a global debt-free-by-date reverse calculator.
2. **No "this month's battle plan."** Undebt.it's plan tells you what to pay *this month*, per debt. DebtPayoff shows strategies and schedules but never the concrete "pay $X to Visa, minimums elsewhere = $Y total" for month one.
3. No visual payoff milestones on the chart (first-win markers).

## What this redesign does (bounded)
- **Per-debt deadlines** (engine + UI): optional "pay off by" date per debt, editable inline; the simulation guarantees the deadline with amortizing top-up payments (recomputed monthly as balances fall); debt rows show a deadline badge + required $/mo; results show the deadline commitment and its interest cost vs the no-deadline plan.
- **This month's battle plan** card: attack target, exact payment per debt this month, total — computed from the followed strategy.
- **Chart upgrade**: gridlines, $k axis, month labels, area fill under the followed strategy, payoff-milestone dots (each debt's death month) with tooltips, "you are here" start marker.
- All existing features preserved: snowball/avalanche/minimums showdown, lump sums, refinance what-if, reverse date calculator, amortization schedule + CSV, balance check-ins, min-vs-interest warnings, CSV import, print.
