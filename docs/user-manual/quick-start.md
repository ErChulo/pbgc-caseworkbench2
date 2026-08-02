# PBGC CaseworkBench 2.0 - Quick-Start Guide

**Version:** 1.0
**Audience:** Caseworkers, reviewers, supervisors
**Last updated:** 2026-08-02

---

## What This App Does

PBGC CaseworkBench 2.0 is a **local-first, offline evidence intake and review workbench** for terminated defined-benefit pension plan cases. It helps you:

- Create and manage controlled case identities
- Preserve submitted files and folders exactly as received
- Review files that the system flags for safety or quality issues
- Make human decisions on automated suggestions
- Export an auditable, deterministic manifest of everything you reviewed

**Key principle:** Your case data never leaves your device. The app runs entirely in your browser with no server required.

---

## Before You Start

### System Requirements

| Requirement | Details |
|-------------|---------|
| **Browser** | Chrome/Edge (latest), or Firefox/Safari with limited features |
| **File System Access** | Required for production use (select a local folder) |
| **Disk Space** | Enough for your case files + app overhead |
| **No Internet Needed** | After download, works completely offline |

### Download & Open

1. Download `pbgc-caseworkbench.html` from your approved source
2. Open it in Chrome or Edge (double-click or drag into browser)
3. You'll see the application header and compatibility check

---

## Your First Session (10-15 Minutes)

### Step 1: Verify Compatibility

When the app opens, look at the **Compatibility** panel at the top:
- **Compatible** - All features available
- **Limited** - Some features unavailable (File System Access not supported)
- **Incompatible** - Cannot use for production work

**If Limited/Incompatible:** You can still explore, but you cannot create production cases or save work durably. Contact IT for an approved browser.

### Step 2: Read the Help Panel

Expand the **Help** panel. It covers:
- Workspace selection
- Backups and recovery
- Keyboard shortcuts
- Static-origin fallback
- Local PII handling

**Read this once.** It's your reference for how the app protects your data.

### Step 3: Select a Workspace

In the **Case Creation** panel:
1. Click **Select Workspace**
2. Choose a local folder on your computer (this is where all case data will be stored)
3. Confirm the folder is correct

**Important:** This folder is the **only place** the app writes data. Back it up regularly.

### Step 4: Create or Resume a Case

Enter:
- **Your reviewer ID** (e.g., your employee ID or initials)
- **Your display name**
- **Official PBGC case number** (e.g., `PBGC-2026-001234`)

Click **Create Production Case**.

**If the case already exists:** You'll see a collision dialog. Choose:
- **Resume Existing** - Continue the existing case
- **Create Non-Production** - Make a test/training/duplicate-investigation case

### Step 5: Add Files (Package Intake)

In the **Package Intake** panel:
1. Click **Select Files** or **Select Folder**
2. Choose the evidence files/folders for this case
3. Watch the **Artifact Inventory** table populate
4. Wait for status to show **Completed** (or **Partial** if some items had issues)

**What happens:** Each file is fingerprinted (SHA-256), copied to your workspace, and preserved exactly as received. No file content is ever executed.

### Step 6: Review Blocked Items (Quarantine)

If any files triggered safety flags, they appear in the **Quarantine Queue**:
- Review each item's **Block Reason** and **Review Required**
- Enter your **Reviewer Name** and **Rationale**
- Choose an action:
  - **Release** - Allow downstream use
  - **Inherit** - Use a prior release decision for identical content
  - **Quarantine** - Permanently block
  - **Reject** - Decline to use
  - **Revoke** - Withdraw a prior release

**Tip:** Irreversible actions (Quarantine, Reject, Revoke) require confirmation.

### Step 7: Review Suggestions (Optional)

If the system made automated suggestions, check these panels:
- **Classification Review** - Category/date proposals
- **Relationship Review** - Duplicate/near-duplicate links
- **Population Review** - Detected population structures

For each: **Approve**, **Reject**, **Revoke**, or **Supersede**. These are human decisions on system suggestions only.

### Step 8: Export the Manifest

When reviews are complete, go to **Manifest Export**:
- Review the summary counts (artifacts, validations, unresolved)
- Click **Export Manifest** to save a local JSON file
- This is your auditable record of everything processed

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` / `Shift+Tab` | Move between controls |
| `Enter` | Activate buttons |
| `Space` | Toggle checkboxes/expanders |
| `Esc` | Close dialogs |

---

## Common Questions

**Q: Where are my files stored?**
A: In the workspace folder you selected. The app creates a `cases/` subfolder with one folder per case UUID.

**Q: Can I use this on a Mac?**
A: Yes, in Chrome/Edge. Firefox/Safari may run in limited mode without File System Access.

**Q: What if my browser crashes?**
A: Your workspace data is safe on disk. Reopen the app, select the same workspace, and resume the case.

**Q: Can I send case data to a colleague?**
A: No - production case data stays on your device. Use the **export manifest** for sharing review records (contains no file content).

**Q: What does "deterministic" mean?**
A: Same inputs + same rules = exactly the same output every time. The manifest hash proves this.

---

## Next Steps

- **Full Manual** - Complete step-by-step procedures for every panel
- **Technical Appendix** - Glossary, troubleshooting, advanced concepts
- **Operator Guide** (`docs/feature-009-operator-guide.md`) - Production operations reference

---

## Need Help?

- Built-in **Help Panel** (expand in app)
- **Operator Guide** in `docs/feature-009-operator-guide.md`
- Contact your PBGC technical lead for escalation

---

*This quick-start covers the happy path. For edge cases, error recovery, and detailed procedures, see the Full Manual.*
