# Mid-Term PbBL Evaluation Presentation Outline

This is a new presentation outline authored from the project requirements. It does not reuse the existing `presentation/DBMS.pptx`.

## Slide 1 — Title
**Charity Donation & Beneficiary Portal**  
DBMS (CSL0311) · B.Tech CSE Semester III · PbBL Mid-Evaluation  
Team names / roll numbers: [fill in]

## Slide 2 — Problem Statement
- Charity workflows track pledges, actual donations, restrictions, and payouts.
- A single campaign total does not explain what is pledged, cleared, restricted, allocated, or disbursed.
- The database must preserve financial history and support auditability.

## Slide 3 — Project Objectives
- Record donor, organization, campaign, pledge, donation, beneficiary, and disbursement records.
- Enforce campaign eligibility, positive amounts, unique payment references, beneficiary verification, and purpose-limited payouts.
- Preserve originals while logging refunds and reversals.

## Slide 4 — Requirements and Business Rules
Show the ten rules from the project brief grouped as:
1. Identity and campaign lifecycle
2. Donation and receipt integrity
3. Fund accounting and beneficiary controls
4. Refunds and auditability

## Slide 5 — Conceptual ER Model
Use the diagram in `docs/er-model.md`. Explain main entities and cardinalities. Note the extra Fund Restriction, Donation Restriction, and Fund Ledger Entry entities required to represent the detailed fund-flow rules.

## Slide 6 — Logical Relational Schema
Show tables with PK/FK notation from `docs/relational-schema.md`. Explain why a many-to-many donation-to-restriction assignment uses an associative table.

## Slide 7 — Normalization
Use the scenarios from `docs/normalization-worksheet.md`:
- 1NF: eliminate repeating groups
- 2NF: remove partial dependencies from composite-key relationships
- 3NF: separate organization attributes from campaign rows

## Slide 8 — Physical Design
Summarize PostgreSQL schema choices:
- BIGINT identity primary keys
- NUMERIC(14,2) for currency amounts
- foreign keys, status checks, unique transaction/receipt references
- indexes on campaign, donor, disbursement, ledger and audit access paths

## Slide 9 — Fund Flow and Integrity
Illustrate the sequence:
Pledge (not cash) → Donation successful and cleared → Ledger inflow → Allocation/restriction → Approved verified-beneficiary disbursement → Ledger outflow. Refunds create compensating negative events; the original donation remains.

## Slide 10 — Database DevOps and Testing
- Version-controlled SQL and documentation in `pbl-mid-evaluation`
- Reproducible setup commands from `docs/database-setup-and-demo.md`
- Show actual PostgreSQL output and test evidence only if tests have really run
- Test invalid amounts, duplicate references, campaign status, beneficiary verification, and insufficient funds

## Slide 11 — Current Status and Limitations
State honestly what has been written versus tested. The proposed SQL must be executed and verified in PostgreSQL. Do not claim live payment gateway or production deployment.

## Slide 12 — Individual Contributions and Conclusion
Each member states one specific contribution and one design decision they can explain. Fill this slide with real contributions, never invented ones.

## Presenter checklist
- [ ] Confirm team names / roll numbers
- [ ] Export ER diagram to an image for slides
- [ ] Execute schema and workflow scripts in PostgreSQL
- [ ] Add genuine test evidence
- [ ] Rehearse each member's explanation
- [ ] Ignore existing `DBMS.pptx`; build the new PPT from this outline
