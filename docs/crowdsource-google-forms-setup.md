# Crowdsource Google Forms setup

One-time setup for single-street and batch submission forms.

## Spreadsheet

Create one Google Sheet with tabs:

- **`single`** — linked to Form A (single street)
- **`single_public`** — formulas copying street fields + `status` + timestamps; **no email** (for published CSV sync)
- **`batch`** — linked to Form B (batch uploads)

### Admin columns on `single` (not on public form)

Add columns manually (or via Apps Script on form submit default `pending`):

| Column | Values |
|--------|--------|
| `status` | `pending`, `approved`, `rejected` |
| `review_notes` | free text |
| `reviewed_at` | ISO date |
| `submission_id` | auto: `=ROW()-1` or UUID |

### Admin columns on `batch`

| Column | Values |
|--------|--------|
| `batch_id` | auto |
| `status` | `received`, `in_review`, `processed`, `rejected` |
| `review_notes` | which streets were extracted |

## Form A — Single street

1. Create form → link to Sheet tab `single`
2. Fields (see plan): street code, EN/ZH names, naming date (required), proof type dropdown, conditional URL or PDF, notice label, remarks, email (optional)
3. **Conditional logic**: show Gazette URL when proof type = URL; show file upload when proof type = PDF
4. **Confirmation message**:

   > Thank you! Your proof was received. Status on the street list usually updates within a few hours.  
   > Return: https://cswbrian.github.io/street-naming-map/en/names?filter=pending

5. Copy form ID into [`src/config/contribute.js`](../src/config/contribute.js) (`SINGLE_FORM_ID`)
6. Use "Get pre-filled link" for each field → update `SINGLE_FORM_ENTRIES` in `contribute.js`

## Form B — Batch upload

1. File upload (allow multiple files)
2. Cover note (paragraph)
3. Email (optional)
4. Link to Sheet tab `batch`
5. Update `BATCH_FORM_ID` in `contribute.js`

## Automated sync

### Option A — Published CSV (simple)

1. Build `single_public` tab with formulas from `single` (omit email)
2. File → Share → Publish `single_public` to web as CSV
3. GitHub secret `SHEET_CSV_URL` = published CSV URL

### Option B — Google Sheets API (private sheet)

1. GCP service account → JSON key
2. Share Sheet with service account email (Editor)
3. GitHub secret `GOOGLE_SERVICE_ACCOUNT_JSON` = full JSON

### Fast sync — Apps Script (recommended)

In the Sheet: Extensions → Apps Script:

```javascript
function onSingleFormSubmit() {
  triggerGithubSync();
}

function triggerGithubSync() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GITHUB_PAT');
  const repo = props.getProperty('GITHUB_REPO'); // e.g. cswbrian/street-naming-map
  if (!token || !repo) return;
  UrlFetchApp.fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'post',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
    },
    payload: JSON.stringify({ event_type: 'sync-submission-tracker' }),
    muteHttpExceptions: true,
  });
}
```

Script properties: `GITHUB_PAT` (repo scope), `GITHUB_REPO`.

Set form trigger: `onSingleFormSubmit` on form submit.
