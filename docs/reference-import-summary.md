# Reference import summary

## Result

- Source repository: `https://github.com/ErChulo/pbgc-caseworkbench`
- Source commit SHA: `15842fa0bba78c41bd2c560cebbc385ac3266c26`
- Total source files reviewed: **361**
- Total imported: **359**
- Total already present with identical hash: **0**
- Total omitted: **2**
- Total conflicts: **0**
- Total failures: **0**
- Files tracked by Git LFS (`filter: lfs`): **70**
- Imported PDF/Excel files checked for Git LFS applicability: **73**
- Backup path: `/tmp/pbgc-caseworkbench-2-reference-backup-20260718T194542Z`
- Mapping authority: `docs/reference-import-mapping.md`
- Manifest: `docs/reference-import-manifest.csv`

No files were placed in `reference/canonical-v1/`. Source bytes and filenames were preserved, and bundle-relative paths were retained for `d3-force-with-labels` and `pbgc-436-webapp-v0.2.0`.

## Post-import organizational adjustment

`reference/training/CASE_PROCESSING.txt` was moved to `reference/training/internal/CASE_PROCESSING.txt` to colocate the internal PBGC processing procedure with the internal processing manual. The manifest destination was updated; the file bytes and SHA-256 remain unchanged.

## Destination directory counts

| Destination directory | Files |
|---|---:|
| `reference/actuarial-workpapers/` | 1 |
| `reference/approved-v1-summaries/` | 247 |
| `reference/approved-v1-workbooks/` | 6 |
| `reference/examples/` | 8 |
| `reference/examples/d3-force-with-labels/` | 3 |
| `reference/examples/d3-force-with-labels/json-data/` | 3 |
| `reference/field-catalogs/atpbgc/` | 3 |
| `reference/field-catalogs/v1/` | 3 |
| `reference/regulations/` | 58 |
| `reference/source-materials/` | 5 |
| `reference/source-materials/pbgc-436-webapp-v0.2.0/` | 4 |
| `reference/training/` | 14 |
| `reference/training/internal/` | 2 |
| `reference/training/plan-summaries/` | 2 |

## Git LFS candidates

The following **73** imported PDF/Excel files were checked with `git check-attr filter -- <paths>`. Of these, **70** resolve to `filter: lfs`. The three uppercase `.XLSX` filenames listed below resolve to `filter: unspecified` because Git attribute patterns are case-sensitive and the approved rule is exactly lowercase `*.xlsx`:

- `reference/approved-v1-workbooks/sample-1-v1.XLSX`
- `reference/approved-v1-workbooks/sample-3-V1.XLSX`
- `reference/approved-v1-workbooks/sample-4-v1.XLSX`

The remaining files in this section resolve to `filter: lfs`:

- `reference/training/4022(c) Allocation Presentation 2020.pdf`
- `reference/regulations/4022(c) Amounts.pdf`
- `reference/regulations/Abandoned Sufficient Plans.pdf`
- `reference/regulations/Aggregate Limit on Benefits Payable from PBGC Funds.pdf`
- `reference/regulations/Allocation of Assets - Priority Category 3.pdf`
- `reference/regulations/Annuity Benefit Forms.pdf`
- `reference/regulations/Annuity Starting Dates.pdf`
- `reference/training/Asset Allocation Under ERISA 4044 2020.pdf`
- `reference/regulations/Assignment and Alienation of Benefits.pdf`
- `reference/field-catalogs/atpbgc/BCV ATPBGC (Add-ins).pdf`
- `reference/regulations/Beneficiaries.pdf`
- `reference/regulations/Benefit Corrections.pdf`
- `reference/regulations/Benefit Liabilities - Priority Category 6.pdf`
- `reference/regulations/Benefit Limitations Under PPA 2006 - Section 436.pdf`
- `reference/regulations/Benefit Payments Prior to Trusteeship.pdf`
- `reference/training/Benefit Statement Guidance_Intro Training_2020.pdf`
- `reference/regulations/Benefits Requiring Employer Consent.pdf`
- `reference/regulations/Black Lung Benefits Offsets.pdf`
- `reference/regulations/Cash Balance Plans (Pre-PPA 2006).pdf`
- `reference/regulations/Computation and Netting of Post-DOPT Overpayments and Underpayments.pdf`
- `reference/regulations/current-policies.pdf`
- `reference/regulations/Disability Benefits.pdf`
- `reference/regulations/Disqualified Plans.pdf`
- `reference/regulations/Due and Unpaid Employer Contributions (DUEC) Recovery.pdf`
- `reference/regulations/Earliest PBGC Retirement Date.pdf`
- `reference/regulations/Earnings-Offset Provisions.pdf`
- `reference/training/EBAAM - Actuarial Training 2020.pdf`
- `reference/regulations/ERISAfication.pdf`
- `reference/regulations/Erroneous Commencement.pdf`
- `reference/regulations/Excess Assets in Trusteed Sufficient Plans.pdf`
- `reference/regulations/Frequency of Benefit Payments.pdf`
- `reference/examples/general-samples.pdf`
- `reference/regulations/Guardianships and Conservatorships.pdf`
- `reference/regulations/Interim Trusteeship of Plans.pdf`
- `reference/regulations/Late Retirement Benefits.pdf`
- `reference/regulations/Limited Scope Benefit Determinations.pdf`
- `reference/regulations/Lump Sum Benefit Payments.pdf`
- `reference/regulations/Marriage Requirements.pdf`
- `reference/regulations/Military Service - Treatment of Benefits Earned During.pdf`
- `reference/regulations/Missing Participants Locators of Lost Funds.pdf`
- `reference/regulations/Missing Participants Program, Expanded in 2018.pdf`
- `reference/regulations/Missing Participants Program, Original.pdf`
- `reference/regulations/Paying and Converting Complex Benefit Forms.pdf`
- `reference/regulations/Plan File Types.pdf`
- `reference/regulations/Plan Loans.pdf`
- `reference/regulations/Plan Recoveries - Valuation and Allocation.pdf`
- `reference/regulations/Plant Shutdown.pdf`
- `reference/regulations/Power of Attorney.pdf`
- `reference/regulations/PPA Bankruptcy.pdf`
- `reference/regulations/Priority Category 2 Benefits Calculation.pdf`
- `reference/regulations/Priority Category 2 Benefits Payment.pdf`
- `reference/regulations/Qualified Domestic Relations Orders (QDRO).pdf`
- `reference/regulations/Qualified Preretirement Survivor Annuities - Plans terminating on and after August 23, 1984.pdf`
- `reference/regulations/Re-evaluations.pdf`
- `reference/regulations/Recoupment, Recovery and Administrative Correction.pdf`
- `reference/regulations/Required Beginning Dates.pdf`
- `reference/approved-v1-workbooks/sample-2-v1.xlsm`
- `reference/approved-v1-workbooks/sample-v1-5.xlsx`
- `reference/approved-v1-workbooks/sample-v1-6.xlsx`
- `reference/regulations/Signature by Mark.pdf`
- `reference/regulations/Small Benefit Payments.pdf`
- `reference/regulations/Spousal Consent.pdf`
- `reference/regulations/Statutory Hybrid Plans.pdf`
- `reference/regulations/Survivor Annuities - Plans Terminated before August 23, 1984.pdf`
- `reference/regulations/Treatment of Plan Liability for Premiums.pdf`
- `reference/regulations/Underpayment Reimbursement and Interest Payments.pdf`
- `reference/regulations/Withholding from Benefit Payments.pdf`
- `reference/training/XRD and V1 Programming.pdf`
- `reference/actuarial-workpapers/24884900PF.v0.7.13.xlsx`
- `reference/training/internal/processing-manual.pdf`

## Conflicts

None.

## Failures

None.

## Approved omissions

- `reference/pbgc-mock-population-module-main/borra.txt`: Approved omission: non-substantive placeholder.
- `reference/raw-approved-v1-engines/.gitkeep`: Approved omission: source directory placeholder.
