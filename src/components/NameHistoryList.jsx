import { resolveHostedUrl } from '../lib/resolveHostedUrl.js'

/**
 * Timeline entries in the road chip: [date + event type] / [street name] / [source].
 */
export default function NameHistoryList({ items, onNoticeClick }) {
  if (!items?.length) return null

  return (
    <ul className="name-history-list">
      {items.map((item) => {
        const noticeUrl = item.notice?.url ? resolveHostedUrl(item.notice.url) : null
        const hasHeadline = Boolean(item.date || item.eventType)
        const hasSource = Boolean(noticeUrl || item.notice?.label)
        const sourceLabel = item.pending && item.pendingLabel ? item.pendingLabel : item.notice?.label

        return (
          <li
            key={item.id}
            className={`name-history-entry${item.isCurrent ? ' name-history-entry--current' : ''}`}
          >
            {hasHeadline ? (
              <div className="name-history-entry-headline">
                {item.date ? (
                  <time className="name-history-list-date" dateTime={item.dateTime ?? undefined}>
                    {item.date}
                  </time>
                ) : null}
                {item.eventType ? (
                  <span className="name-history-entry-type">{item.eventType}</span>
                ) : null}
              </div>
            ) : null}
            {item.name ? <p className="name-history-entry-name">{item.name}</p> : null}
            {hasSource || (item.pending && item.pendingLabel) ? (
              <div className="name-history-entry-source">
                {noticeUrl ? (
                  <a
                    className="name-history-list-notice"
                    href={noticeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={item.notice.title ?? undefined}
                    onClick={onNoticeClick}
                  >
                    {sourceLabel}
                  </a>
                ) : (
                  <span
                    className={`name-history-list-notice name-history-list-notice-label${
                      item.pending ? ' name-history-list-pending' : ''
                    }`}
                  >
                    {sourceLabel}
                  </span>
                )}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
