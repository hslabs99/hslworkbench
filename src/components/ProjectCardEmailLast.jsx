import {
  daysAgoFromIso,
  formatCardDateOnly,
  formatFolderScanAge,
  recentEmailDirectionHighlight,
} from '../commSummaryFormat.js'
import CommTypeBadge from './CommTypeBadge.jsx'

function EmailLastRow({ dir, activity, highlight, folderScanLabel, folderScanTitle }) {
  const isIn = dir === 'IN'
  const isOut = dir === 'OUT'
  const dirClass = [
    'project-card-email-dir',
    highlight === 'in' && isIn ? 'project-card-email-dir--recent-in' : '',
    highlight === 'out' && isOut ? 'project-card-email-dir--recent-out' : '',
    activity?.inInbox && isIn ? 'project-card-email-dir--unfiled' : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (!activity?.date) {
    return (
      <div className="project-card-email-row project-card-email-row--empty">
        <span className={dirClass}>{dir}</span>
        <span className="project-card-email-date">—</span>
        <span className="project-card-email-days" />
        <span className="project-card-email-type" />
        <span className="project-card-email-scan" title={folderScanTitle}>
          {isIn ? folderScanLabel : ''}
        </span>
      </div>
    )
  }

  const days = daysAgoFromIso(activity.date)

  return (
    <div className="project-card-email-row">
      <span
        className={dirClass}
        title={activity.inInbox ? 'Latest inbound still in root Inbox (not filed)' : undefined}
      >
        {dir}
      </span>
      <span className="project-card-email-date">{formatCardDateOnly(activity.date)}</span>
      <span className="project-card-email-days">({days})</span>
      <span className="project-card-email-type">
        <CommTypeBadge type={activity.type} className="comm-type-badge--card" />
      </span>
      <span className="project-card-email-scan" title={isIn ? folderScanTitle : undefined}>
        {isIn ? folderScanLabel : ''}
      </span>
    </div>
  )
}

export default function ProjectCardEmailLast({
  inbound,
  outbound,
  folderScanDays = null,
  folderScanTitle,
}) {
  const highlight = recentEmailDirectionHighlight(inbound, outbound)
  const folderScanLabel = formatFolderScanAge(folderScanDays)

  return (
    <div className="project-card-email-last">
      <EmailLastRow
        dir="IN"
        activity={inbound}
        highlight={highlight}
        folderScanLabel={folderScanLabel}
        folderScanTitle={folderScanTitle}
      />
      <EmailLastRow dir="OUT" activity={outbound} highlight={highlight} />
    </div>
  )
}
