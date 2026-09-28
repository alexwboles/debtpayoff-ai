# 💸 DebtPayoff AI

**Your debt-free date, calculated.** Enter your debts, pick an extra monthly payment, and watch avalanche vs. snowball strategies battle it out — with a month-by-month payoff plan and the exact interest each strategy costs you.

## The problem

Minimum payments are designed to keep you in debt: on a $5,240 balance at 24.99% APR, paying the minimum costs thousands in interest and takes over a decade. Most people have no idea what their "debt-free date" is — or how much an extra $150/month would change it.

## The solution

DebtPayoff AI runs **100% locally in your browser**:

1. **Enter your debts** — balance, APR, minimum payment. Saved in your browser.
2. **Set your attack payment** — the extra dollars above minimums, with a what-if slider ($0–$1,000/mo).
3. **Strategy showdown** — ❄️ Snowball (smallest balance first, quick wins) vs. 🏔️ Avalanche (highest APR first, cheapest). Each card shows the debt-free date, months, total interest, and total paid, with the cheapest crowned.
4. **Balance-over-time chart** — your projected balance under each strategy vs. minimums-only.
5. **Payoff journey** — motivational summary (interest saved vs. minimums, first debt you'll kill) plus a per-debt payoff timeline.

The simulator rolls freed-up minimums into the attack automatically (the real snowball/avalanche method), and warns you if your payments don't even cover the interest.

Optional: set `OPENAI_API_KEY` for AI payoff coaching in a future version — everything works fully offline without it.

## Privacy

**Nothing leaves your device.** No account, no server, no analytics. Your financial data stays in your browser's localStorage.

## Run it

No build step, no dependencies.

```bash
# any static server works:
npx serve .
# or
python3 -m http.server 8080
```

Then open http://localhost:8080 (or :3000 for `serve`). Click **"Try sample data"** to explore with 4 realistic debts.

> Note: opening `index.html` directly via `file://` works except the sample-data loader (browsers block `fetch` on `file://`). Use a local server for the full experience.

## Pricing vision

- **Free** — unlimited debts, both strategies, the core product, forever.
- **Plus ($6/mo)** — cloud sync across devices, payoff reminders, printable payoff plan PDF.

## Tests

```bash
bash test/smoke.sh   # file/syntax/logic checks
bash test/e2e.sh     # end-to-end payoff flows on the sample debts
```

## Disclaimer

General educational math, not financial advice. Talk to a professional for your situation.
