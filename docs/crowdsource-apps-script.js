/**
 * Google Apps Script — paste into Sheet: Extensions → Apps Script
 * Trigger: on form submit (single-street form) → fast GitHub sync
 *
 * Script properties (Project settings):
 *   GITHUB_PAT  — fine-grained PAT with contents:write on repo
 *   GITHUB_REPO — e.g. cswbrian/street-naming-map
 */

function onSingleFormSubmit() {
  triggerGithubSync_();
}

function triggerGithubSync_() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GITHUB_PAT');
  const repo = props.getProperty('GITHUB_REPO');
  if (!token || !repo) {
    console.warn('Missing GITHUB_PAT or GITHUB_REPO');
    return;
  }
  UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/dispatches', {
    method: 'post',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    payload: JSON.stringify({ event_type: 'sync-submission-tracker' }),
    muteHttpExceptions: true,
  });
}
