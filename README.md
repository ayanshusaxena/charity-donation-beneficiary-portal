# Charity Donation & Beneficiary Portal

A DBMS Problem-Based Learning (PBL) project for a database-driven Charity Donation & Beneficiary Portal.

## Project Overview

The system is designed to manage the complete lifecycle of charitable giving — from donor registration and campaign creation to pledges, actual donations, fund tracking, and disbursement to verified beneficiaries.

The main goal is to maintain transparency and accountability by keeping donation, fund-disbursement, refund, and audit information traceable.

## Main Entities

The database is designed around 8 main entities:

- **Donor** — stores donor information and consent status.
- **Organization** — represents the organization responsible for campaigns.
- **Campaign** — represents a fundraising campaign and tracks its target and fund status.
- **Pledge** — records a donor's promise to contribute to a campaign.
- **Donation** — records the actual payment, transaction, receipt, and refund information.
- **Beneficiary** — stores verified individuals or groups who receive funds.
- **Disbursement** — records payments made from campaign funds to beneficiaries.
- **Audit Log** — records important actions for traceability and accountability.

## Key Relationships

- Organization **manages** Campaigns — 1:N
- Donor **makes** Pledges — 1:N
- Donor **gives** Donations — 1:N
- Campaign **receives** Pledges — 1:N
- Campaign **receives** Donations — 1:N
- Pledge is **fulfilled by** Donation — 1:1
- Campaign **funds** Disbursements — 1:N
- Beneficiary **receives** Disbursements — 1:N

## Database Design

The project follows the flow:

**ER Model → Relational Schema → Database Tables**

The ER model contains the conceptual structure of the system. The relational schema converts entities into tables, attributes into columns, key attributes into primary keys, and 1:N relationships into foreign keys. M:N relationships are represented using a separate relation.

## Important Business Rules

- Every entity has a unique primary key.
- Only active/approved campaigns can receive pledges or donations.
- Donation amounts must be positive.
- Online donations maintain transaction references and receipt numbers.
- Campaigns track cleared funds and disbursed totals separately.
- Only verified beneficiaries can receive disbursements.
- Total disbursements for a campaign cannot exceed its cleared funds.
- Refunds are recorded without deleting the original donation record.
- Important system actions are recorded in the Audit Log.

## Project Presentation

The project presentation is available in the [`presentation`](./presentation) folder.

## Academic Information

- **Subject:** Database Management System (DBMS)
- **Subject Code:** CSL0311
- **Course:** B.Tech
- **Branch:** CSE
- **Semester:** 3
- **Project Type:** Problem-Based Learning (PBL)
