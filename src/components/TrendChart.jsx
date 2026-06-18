import { useRef, useEffect } from 'react'
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

export default function TrendChart({ data }) {
  const canvasRef = useRef()
  const chartRef = useRef()

  useEffect(() => {
    if (!canvasRef.current || data.length < 2) return
    if (chartRef.current) chartRef.current.destroy()

    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: '支出',
          data: data.map(d => Math.round(d.total)),
          backgroundColor: '#534ab7cc',
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ¥${ctx.raw.toLocaleString()}` } },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: isDark ? '#8e8e93' : '#6e6e73', font: { size: 12 } },
          },
          y: {
            grid: { color: isDark ? '#3a3a3c' : '#f0f0f5' },
            ticks: {
              color: isDark ? '#8e8e93' : '#6e6e73',
              font: { size: 11 },
              callback: v => '¥' + v.toLocaleString(),
            },
            beginAtZero: true,
          },
        },
      },
    })

    return () => chartRef.current?.destroy()
  }, [data])

  if (data.length < 2) return null

  return (
    <div className="bg-white dark:bg-surface-card-dark rounded-xl p-4">
      <div className="text-xs font-medium text-ink-secondary uppercase tracking-wider mb-3">月度趋势</div>
      <div style={{ height: 180 }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}
