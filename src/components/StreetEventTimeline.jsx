import { resolveHostedUrl } from '../lib/resolveHostedUrl.js'
import { formatNoticeLabel } from '../lib/formatNoticeLabel.js'
import { getEvidenceKindBadge } from '../lib/evidenceKindBadge.js'

const normalize = (value) => String(value ?? '').trim()

function DetailSection({ title, children }) {
  if (!children) return null
  return (
    <section className="street-event-detail-section">
      <h4 className="street-event-detail-heading">{title}</h4>
      {children}
    </section>
  )
}

function DetailRow({ label, value }) {
  if (!value) return null
  return (
    <div className="street-event-detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function NoticeLink({ notice, onNoticeClick }) {
  if (!notice?.label) return null
  const url = notice.url ? resolveHostedUrl(notice.url) : null
  const className = notice.kind
    ? `pending-evidence-badge${url ? ' pending-evidence-link' : ''} pending-evidence-${notice.kind}`
    : 'street-event-notice street-event-notice-label'

  if (url) {
    return (
      <a
        className={className}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={notice.title ?? undefined}
        onClick={onNoticeClick}
      >
        {notice.label}
      </a>
    )
  }
  return <span className={className}>{notice.label}</span>
}

function DerivedFromList({ items, locale, t }) {
  if (!Array.isArray(items) || !items.length) return null
  return (
    <ul className="street-event-derived-list">
      {items.map((item, index) => {
        const cited = item.cited_notice_label ?? item.notice_label
        const citedLabel =
          cited && locale === 'zh'
            ? formatNoticeLabel(cited, 'zh') || cited
            : cited
              ? formatNoticeLabel(cited, 'en') || cited
              : null
        const url = resolveHostedUrl(
          locale === 'zh'
            ? item.government_notice_url_zh || item.government_notice_url_en
            : item.government_notice_url_en || item.government_notice_url_zh,
        )
        return (
          <li key={`derived-${index}`}>
            {citedLabel ? <span>{citedLabel}</span> : null}
            {item.kind ? <span className="street-event-derived-kind">{item.kind}</span> : null}
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer">
                {t('timelinesDetailViewNotice')}
              </a>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function SupplementaryList({ items, locale }) {
  if (!Array.isArray(items) || !items.length) return null
  return (
    <ul className="street-event-derived-list">
      {items.map((item, index) => {
        const label =
          locale === 'zh'
            ? item.publisher_zh || item.publisher || item.document_label
            : item.publisher || item.document_label
        const url = resolveHostedUrl(
          item.document_url || item.government_notice_url_en || item.government_notice_url_zh,
        )
        return (
          <li key={`supp-${index}`}>
            {label ? <span>{label}</span> : null}
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer">
                {url}
              </a>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function DescriptionBlock({ text, className = '' }) {
  if (!text) return null
  return <p className={`street-event-description${className ? ` ${className}` : ''}`}>{text}</p>
}

function EventDetail({ entry, locale, t }) {
  const noticeEn = entry.notice_label_en
    ? formatNoticeLabel(entry.notice_label_en, 'en') || entry.notice_label_en
    : null
  const noticeZh = entry.notice_label_zh
    ? formatNoticeLabel(entry.notice_label_zh, 'zh') || entry.notice_label_zh
    : null
  const noticeUrlEn = entry.notice_url_en ? resolveHostedUrl(entry.notice_url_en) : null
  const noticeUrlZh = entry.notice_url_zh ? resolveHostedUrl(entry.notice_url_zh) : null
  const evidenceBadge = getEvidenceKindBadge(entry.evidence_kind, t)
  const evidenceLabel = evidenceBadge?.label ?? normalize(entry.evidence_kind)

  const descriptionEn = normalize(entry.gazette_location?.description_raw_en)
  const descriptionZh = normalize(entry.gazette_location?.description_raw_zh)
  const hasDescription = Boolean(descriptionEn || descriptionZh)

  const descriptionSection = hasDescription ? (
    <div className="street-event-description-block">
      {descriptionEn ? (
        <DescriptionBlock
          text={descriptionEn}
          className={locale === 'zh' && descriptionZh ? 'street-event-description--secondary' : ''}
        />
      ) : null}
      {descriptionZh ? (
        <DescriptionBlock
          text={descriptionZh}
          className={locale === 'en' && descriptionEn ? 'street-event-description--secondary' : ''}
        />
      ) : null}
    </div>
  ) : null

  const namesSection = (
    <div className="street-event-detail-dl">
      <DetailRow label={t('timelinesDetailNameEn')} value={normalize(entry.name_en)} />
      <DetailRow label={t('timelinesDetailNameZh')} value={normalize(entry.name_zh)} />
      <DetailRow label={t('timelinesDetailPreviousEn')} value={normalize(entry.previous_name_en)} />
      <DetailRow label={t('timelinesDetailPreviousZh')} value={normalize(entry.previous_name_zh)} />
    </div>
  )

  const hasNoticeSection =
    noticeEn ||
    noticeZh ||
    noticeUrlEn ||
    noticeUrlZh ||
    entry.evidence_kind ||
    entry.evidence_kind_note ||
    (entry.derived_from?.length ?? 0) > 0 ||
    (entry.supplementary_evidence?.length ?? 0) > 0

  const noticeSection = hasNoticeSection ? (
    <div className="street-event-detail-dl">
      <DetailRow label={t('timelinesDetailNoticeEn')} value={noticeEn} />
      <DetailRow label={t('timelinesDetailNoticeZh')} value={noticeZh} />
      {noticeUrlEn ? (
        <div className="street-event-detail-row">
          <dt>{t('timelinesDetailNoticeUrlEn')}</dt>
          <dd>
            <a href={noticeUrlEn} target="_blank" rel="noopener noreferrer">
              {noticeUrlEn}
            </a>
          </dd>
        </div>
      ) : null}
      {noticeUrlZh ? (
        <div className="street-event-detail-row">
          <dt>{t('timelinesDetailNoticeUrlZh')}</dt>
          <dd>
            <a href={noticeUrlZh} target="_blank" rel="noopener noreferrer">
              {noticeUrlZh}
            </a>
          </dd>
        </div>
      ) : null}
      <DetailRow label={t('timelinesDetailEvidenceKind')} value={evidenceLabel} />
      <DetailRow label={t('timelinesDetailEvidenceNote')} value={normalize(entry.evidence_kind_note)} />
      {(entry.derived_from?.length ?? 0) > 0 ? (
        <div className="street-event-detail-row">
          <dt>{t('timelinesDetailDerivedFrom')}</dt>
          <dd>
            <DerivedFromList items={entry.derived_from} locale={locale} t={t} />
          </dd>
        </div>
      ) : null}
      {(entry.supplementary_evidence?.length ?? 0) > 0 ? (
        <div className="street-event-detail-row">
          <dt>{t('timelinesDetailSupplementary')}</dt>
          <dd>
            <SupplementaryList items={entry.supplementary_evidence} locale={locale} />
          </dd>
        </div>
      ) : null}
    </div>
  ) : null

  const remarksSection = normalize(entry.submitter_remarks) ? (
    <p className="street-event-remarks">{entry.submitter_remarks}</p>
  ) : null

  const technicalSection = (
    <div className="street-event-detail-dl">
      <DetailRow label={t('timelinesDetailChangeKind')} value={normalize(entry.change_kind)} />
      <DetailRow label={t('timelinesDetailEventRole')} value={normalize(entry.event_role)} />
      <DetailRow label={t('timelinesDetailSource')} value={normalize(entry.source)} />
      {entry.is_declaration_event != null ? (
        <DetailRow
          label={t('timelinesDetailDeclaration')}
          value={entry.is_declaration_event ? t('timelinesDetailYes') : t('timelinesDetailNo')}
        />
      ) : null}
    </div>
  )

  const hasNames =
    normalize(entry.name_en) ||
    normalize(entry.name_zh) ||
    normalize(entry.previous_name_en) ||
    normalize(entry.previous_name_zh)

  return (
    <div className="street-event-detail" id={`street-event-detail-${entry._key}`}>
      {hasNames ? <DetailSection title={t('timelinesDetailSectionNames')}>{namesSection}</DetailSection> : null}
      {hasDescription ? (
        <DetailSection title={t('timelinesDetailSectionDescription')}>{descriptionSection}</DetailSection>
      ) : null}
      {hasNoticeSection ? (
        <DetailSection title={t('timelinesDetailSectionNotice')}>{noticeSection}</DetailSection>
      ) : null}
      {remarksSection ? <DetailSection title={t('timelinesDetailSectionRemarks')}>{remarksSection}</DetailSection> : null}
      <DetailSection title={t('timelinesDetailSectionTechnical')}>{technicalSection}</DetailSection>
    </div>
  )
}

function RenameLine({ line }) {
  return (
    <span className="street-event-rename-line">
      <span className="street-event-rename-previous">{line.previous}</span>
      <span className="street-event-rename-arrow" aria-hidden="true">
        {' '}
        →{' '}
      </span>
      <span className="street-event-rename-current">{line.current}</span>
    </span>
  )
}

function TimelineSummaryContent({ meta, t, onNoticeClick, undatedLabel }) {
  const renameLines = meta.renameLines?.length ? meta.renameLines : null

  return (
    <span className="street-event-summary-main">
      <span className="street-event-summary-headline">
        {meta.date ? (
          <time className="street-event-date" dateTime={meta.dateTime ?? undefined}>
            {meta.date}
          </time>
        ) : (
          <span className="street-event-date">{undatedLabel}</span>
        )}
        {meta.eventType ? <span className="street-event-type">{meta.eventType}</span> : null}
      </span>
      {renameLines ? (
        <span className="street-event-renames">
          {renameLines.map((line, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <RenameLine key={index} line={line} />
          ))}
        </span>
      ) : meta.name ? (
        <span className="street-event-name">{meta.name}</span>
      ) : null}
      <span className="street-event-source">
        {meta.pending && meta.pendingLabel ? (
          <span className="street-event-pending">{meta.pendingLabel}</span>
        ) : null}
        {meta.notice ? <NoticeLink notice={meta.notice} onNoticeClick={onNoticeClick} /> : null}
      </span>
    </span>
  )
}

export default function StreetEventTimeline({
  items,
  variant = 'table',
  expandable = false,
  locale,
  t,
  expandedEventKey,
  onToggleEvent,
  onNoticeClick,
  emptyLabel,
}) {
  const undatedLabel = emptyLabel === undefined ? t('timelinesUndated') : emptyLabel

  if (!items?.length) {
    return variant === 'table' ? (
      <span className="street-event-empty">{t('timelinesNoEvents')}</span>
    ) : null
  }

  const rootClass = `street-event-timeline street-event-timeline--${variant}`

  return (
    <ul className={rootClass}>
      {items.map((item) => {
        const meta = item.meta ?? item
        const isExpanded = expandable && expandedEventKey === item.id
        const itemClass = `street-event-item${meta.isCurrent ? ' is-current' : ''}${isExpanded ? ' is-expanded' : ''}`
        const summaryId = `street-event-summary-${item.id}`
        const entryWithKey = item.entry ? { ...item.entry, _key: item.id } : null

        if (expandable && item.entry) {
          return (
            <li key={item.id} className={itemClass}>
              <button
                type="button"
                id={summaryId}
                className="street-event-summary"
                aria-expanded={isExpanded}
                aria-controls={`street-event-detail-${item.id}`}
                onClick={() => onToggleEvent?.(item.id)}
              >
                <TimelineSummaryContent meta={meta} t={t} undatedLabel={undatedLabel} />
                <span className="street-event-chevron" aria-hidden="true">
                  {isExpanded ? '▾' : '▸'}
                </span>
              </button>
              {isExpanded && entryWithKey ? (
                <EventDetail entry={entryWithKey} locale={locale} t={t} />
              ) : null}
            </li>
          )
        }

        return (
          <li key={item.id} className={itemClass}>
            <div className="street-event-summary street-event-summary--static">
              <TimelineSummaryContent meta={meta} t={t} onNoticeClick={onNoticeClick} undatedLabel={undatedLabel} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
