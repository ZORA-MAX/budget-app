import { ICONS } from '../lib/categories'

export default function CatIcon({ iconKey, color, bg, size = 40 }) {
  const path = ICONS[iconKey] || ICONS.other
  const paths = path.split(/(?=[A-Z])/).join(' ').split(' M').map((p, i) => i === 0 ? p : 'M' + p)

  return (
    <div
      className="rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: bg }}
    >
      <svg
        width={size * 0.5}
        height={size * 0.5}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={path} />
      </svg>
    </div>
  )
}
