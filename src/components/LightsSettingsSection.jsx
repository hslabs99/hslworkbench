import { ATTENTION_LEVELS } from '../attention.js'
import { attentionLabel } from '../attention.js'
import { useAttentionLights } from '../AttentionLightsContext.jsx'

const LABELS = {
  green: 'Green',
  orange: 'Orange',
  red: 'Red',
}

export default function LightsSettingsSection() {
  const { colors, tooltips, setColor, setTooltip } = useAttentionLights()

  return (
    <section className="lookup-section lights-settings-section">
      <h3 className="lookup-section-title">Lights</h3>
      <p className="lookup-section-intro muted">
        Colours and hover tooltips for the traffic-light control on project cards (attention level).
        Empty tooltip falls back to the default label for that level.
      </p>

      <div className="systems-card lights-settings-card">
        <table className="systems-table lights-settings-table">
          <thead>
            <tr>
              <th scope="col">Level</th>
              <th scope="col">Colour</th>
              <th scope="col">Tooltip (hover)</th>
            </tr>
          </thead>
          <tbody>
            {ATTENTION_LEVELS.map((level) => (
              <tr key={level}>
                <td className="lights-level-cell">
                  <span className="lights-level-name">{LABELS[level]}</span>
                  <span className="muted lights-level-hint">{attentionLabel(level)}</span>
                </td>
                <td>
                  <div className="lights-color-cell">
                    <input
                      type="color"
                      className="lights-color-input"
                      value={colors[level]}
                      onChange={(e) => setColor(level, e.target.value)}
                      aria-label={`${LABELS[level]} colour`}
                    />
                    <code className="lights-hex">{colors[level]}</code>
                  </div>
                </td>
                <td>
                  <input
                    type="text"
                    className="lights-tooltip-input"
                    value={tooltips[level]}
                    onChange={(e) => setTooltip(level, e.target.value)}
                    placeholder={`Default: ${attentionLabel(level)} — click to cycle`}
                    aria-label={`${LABELS[level]} tooltip`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
