export function buildNoticeSearchHaystack(notice) {
  const parts = [
    notice.notice_stem,
    notice.gazette_notice_label_en,
    notice.gazette_notice_label_zh,
    notice.publication_date,
  ]
  for (const row of notice.streets_draft ?? []) {
    parts.push(row.street_name_en, row.street_name_zh)
  }
  for (const row of notice.linked_streets ?? []) {
    parts.push(row.street_name_en, row.street_name_zh)
  }
  return parts.filter(Boolean).join(' ').toLowerCase()
}
