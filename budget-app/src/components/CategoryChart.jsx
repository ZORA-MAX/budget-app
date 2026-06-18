import { useRef, useEffect } from 'react'
import { Chart, DoughnutController, ArcElement, Tooltip } from 'chart.js'

Chart.register(DoughnutController, ArcElement, Tooltip)

export default function CategoryChart({ byCat }) {
  const canvasRef = useRef()
  const chartRef = useRef()

  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) chartRef.current.destroy()

    const cats = byCat.filter(c => c.total > 0)
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches

    chartRef.current = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels: cats.map(c => c.cat.label),
        datasets: [{
          data: cats.map(c => Math.round(c.total)),
          backgroundColor: cats.map(c => c.cat.color),
          borderWidth: 2,
          borderColor: isDark ? '#2c2c2e' : '#ffffff',
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: ctx => ` ¥${ctx.raw.toLocaleString()}` }
          },
        },
      },
    })

    return () => chartRef.current?.destroy()
  }, [byCat])

  return (
    <div className="relative w-full" style={{ height: 200 }}>
      <canvas ref={canvasRef} />
    </div>
  )
}
