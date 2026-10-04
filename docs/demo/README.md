# Demo kit (fictional data only)

Everything here is **sample data**: a fictional dental office, plan and patient. Never use real names, member IDs or health details in a demo.

| File | What it is |
| --- | --- |
| `sample-treatment-estimate.pdf` | Dentist's estimate: 2 fillings and a crown, with fees, allowed amounts, write-offs, cash prices, planned dates, and the dentist's timing window for the crown |
| `sample-benefits-summary.pdf` | Plan summary: benefit year, annual maximum, deductible, what the insurer already paid this year, and what the plan pays per service type |
| `generate-demo-docs.mjs` | Recreates both PDFs (`node docs/demo/generate-demo-docs.mjs`) |
| `check-demo-docs.mjs` | Runs both PDFs through the live system and prints what is confirmed, asked and calculated |

Each fact sits on one line, so the reader returns it whole and the assistant can quote it exactly.

## The numbers in the documents

- Fillings (tooth 14, tooth 15): $250 each, allowed $250, write-off $0, cash price $200, planned 2026-11-10 and 2026-11-11.
- Crown (tooth 30): $1,000, allowed $1,000, write-off $0, cash price $900, planned 2026-11-12. The dentist allows 2026-11-12 to 2027-01-15.
- Benefit year 2026-01-01 to 2026-12-31: annual maximum $800, already paid $500, deductible $50 (none met yet).
- Plan pays: preventive 100%, basic 80% after the deductible, major 50% after the deductible.

**Expected results (live check, 2026-10-04):**
- Six groups confirmed with quotes.
- One or two quick questions: network, and whether services count toward the maximum.
- **You pay $1,200** if everything is done this year; the plan pays $300.
- **Self-pay total $1,300.**

The **$725** "move the crown into January" option needs next year's plan terms; see *Known gap* below.

## Demo walkthrough (about 3 minutes)

1. **Sign in** with your demo account.
2. **Upload** both PDFs on the composer (or **Photo**: show the PDF on a second screen and photograph it).
3. Optionally **Speak** the voice script below; the transcript is added to the text box.
4. **Analyse.** Point out the live checklist: "Reading document 1 … Read 15 lines … Understanding your document".
5. **Is this right? · 1 of 6.** Each card shows the value, the exact quote from the document, and a one-line meaning. Choose **Yes**; on one card choose **Not right** to show nothing is used without consent, then change it back from the summary.
6. **Quick question(s)**, with the definition and "I don't know".
7. **Your estimate is ready:** $1,200. Open **options** → **Sources** (each number's origin) → **Self-pay** ($1,300 vs $1,200).
8. **Review and save** → **My plan**, reload the page, and it's still there.

Fallback if anything is slow: Home → **Try a sample case** shows the full comparison ($1,200 vs $725) instantly.

## Voice script (about 25 seconds)

> "I have dental insurance through work. My dentist recommends two fillings at two hundred fifty dollars each and a crown for one thousand dollars. My plan pays eighty percent for fillings and fifty percent for crowns after a fifty dollar deductible. The annual maximum is eight hundred dollars and insurance already paid five hundred this year. The dentist said the crown can wait until January fifteenth."

## Typed description (paste into the composer)

```
I have dental insurance. My benefit year runs 2026-01-01 to 2026-12-31. The annual maximum is $800 and insurance already paid $500 this year. My deductible is $50 and I haven't met it yet.
The plan pays 80% for basic services and 50% for major services, after the deductible. Both count toward the annual maximum.
My dentist recommends two fillings at $250 each and a crown at $1,000, all in network, and the allowed amounts equal the charges.
The fillings are planned for 2026-11-10 and 2026-11-11 and the crown for 2026-11-12. The dentist said the crown can be done any time up to 2027-01-15.
```

## Prompt for generating more test documents

Use this with any AI writing tool to create variations (keep it fictional):

> Create a fictional, clearly labeled SAMPLE dental treatment estimate and a matching SAMPLE dental plan benefits summary for a software demo. Use a made-up office, plan and patient ("SAMPLE PATIENT"); no real names, member IDs or health history. Write each fact on its own single line, in this style: "Crown, tooth 30 (D2740): fee $1,000.00, allowed $1,000.00, write-off $0.00, cash price $900.00, planned 2026-11-12". The estimate must include 2–4 procedures with CDT codes, fee, allowed amount, write-off, cash price and planned date (YYYY-MM-DD), whether the office is in network, and one sentence giving the dentist's safe timing window for one procedure (for example "The crown can safely be done any time between 2026-11-12 and 2027-01-15"). The benefits summary must include, on one line, the benefit year dates, the annual maximum and the annual deductible; on one line, how much the insurer already paid this year and how much of the deductible is met; one line per service type saying what percentage the plan pays and whether the deductible applies (preventive, basic, major); one line saying the annual maximum applies to basic and major services; and one line describing next year's benefit year dates and terms. Do not write sentences that mention limits only to say they don't apply (for example "No waiting periods apply"). Keep both documents to one page each.

## Known gap

The assistant records only the current benefit year, so the timing comparison into next year (the $725 option) isn't offered from uploaded documents yet. The calculator reports `NEXT_PLAN_YEAR_NOT_SUPPLIED`. The sample case includes next year, which is why it shows the comparison.
