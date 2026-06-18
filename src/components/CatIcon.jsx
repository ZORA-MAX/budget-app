// Reliable icon component using emoji in styled container
const EMOJI_MAP = {
  housing: '🏠', food: '🍜', transport: '🚌', daily: '🧴',
  fashion: '👗', digital: '💻', career: '💼', education: '📚',
  health: '💊', sport: '🏃', entertain: '🎮', travel: '✈️',
  social: '🧧', transfer: '🔄', other: '📦',
}

export default function CatIcon({ iconKey, color, bg, size = 40 }) {
  const emoji = EMOJI_MAP[iconKey] || '📦'
  const fontSize = Math.round(size * 0.45)

  return (
    <div
      className="rounded-xl flex items-center justify-center flex-shrink-0"
      style={{
        width: size, height: size,
        backgroundColor: bg,
        border: `1px solid ${color}15`,
      }}
    >
      <span style={{ fontSize, lineHeight: 1 }}>{emoji}</span>
    </div>
  )
}
