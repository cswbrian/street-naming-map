import { resolveHostedUrl } from '../lib/resolveHostedUrl.js'

/**
 * Former names stacked in the chip value column; section label is top-aligned in MapView.
 */
export default function NameHistoryList({ items, onNoticeClick }) {
  if (!items?.length) return null

  return (
    <ul className="name-history-list">
      {items.map((item) => {
        const noticeUrl = item.notice?.url ? resolveHostedUrl(item.notice.url) : null

        return (
          <li key={item.id} className="name-history-entry">
            {item.date ? (
              <time className="name-history-list-date" dateTime={item.dateTime ?? undefined}>
                {item.date}
              </time>
            ) : null}
            {item.roleLabel ? (
              <span className="name-history-list-role">{item.roleLabel}</span>
            ) : null}
            <span className="name-history-list-name">{item.name}</span>
            {item.pending && item.pendingLabel ? (
              <span className="name-history-list-pending">{item.pendingLabel}</span>
            ) : null}
            {noticeUrl ? (
              <a
                className="name-history-list-notice"
                href={noticeUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onNoticeClick}
              >
                {item.notice.label}
              </a>
            ) : item.notice?.label ? (
              <span className="name-history-list-notice name-history-list-notice-label">{item.notice.label}</span>
            ) : null}
            {!item.pending && item.pendingLabel ? (
              <span className="name-history-list-evidence-tag">{item.pendingLabel}</span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
