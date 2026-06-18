import React, { useMemo, useRef, useEffect } from 'react';
import { Chart, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { groupByMonth } from '../lib/csvParser';
import { summarizeByCategory, classify } from '../lib/categories';
import { fmtMoney, fmtMonthShort, fmtMonth } from '../lib/utils';
import { exportAll, clearAll } from '../lib/storage';

Chart.register(BarElement, CategoryScale, LinearScale, Tooltip);

export default function HistoryPage({ txs }) {
  const monthlyMap = useMemo(() => groupByMonth(txs), [txs]);
  const monthKeys = useMemo(() => Object.keys(monthlyMap).sort(), [monthlyMap]);

  const monthlyTotals = useMemo(() =>
    monthKeys.map(k => ({
      key: k,
      label: fmtMonthShort(k),
      total: (monthlyMap[k] || []).reduce((s, t) => s + t.amount, 0),
      count: (monthlyMap[k] || []).length,
    }))
  , [monthKeys, monthlyMap]);

  // 趋势图
  const chartData = useMemo(() => ({
    labels: monthlyTotals.map(m => m.label),
    datasets: [{
      label: '月支出',
      data: monthlyTotals.map(m => Math.round(m.total)),
      backgroundColor: '#534ab7cc',
      borderRadius: 6,
      borderSkipped: false,
    }]
  }), [monthlyTotals]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => ` ¥${ctx.raw.toLocaleString()}` } }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 12 }, color: '#8e8e93' } },
      y: { grid: { color: '#f0f0f5' }, ticks: { font: { size: 11 }, color: '#8e8e93', callback: v => '¥' + v.toLocaleString() }, beginAtZero: true }
    }
  };

  // 汇总
  const grandTotal = monthlyTotals.reduce((s, m) => s + m.total, 0);
  const avgMonth = monthlyTotals.length > 0 ? grandTotal / monthlyTotals.length : 0;
  const maxMonth = monthlyTotals.length > 0 ? monthlyTotals.reduce((a, b) => a.total > b.total ? a : b) : null;
  const minMonth = monthlyTotals.length > 0 ? monthlyTotals.reduce((a, b) => a.total < b.total ? a : b) : null;

  // 导出 JSON
  const handleExport = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 导出 CSV
  const handleExportCSV = () => {
    const headers = ['日期', '商家', '金额', '来源', '一级分类'];
    const rows = txs.map(tx => {
      const { cat } = classify(tx.name);
      return [
        tx.date.toISOString().slice(0, 10),
        `"${tx.name}"`,
        tx.amount.toFixed(2),
        tx.source === 'wechat' ? '微信' : '支付宝',
        cat.label
      ].join(',');
    });
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 清空
  const handleClear = async () => {
    if (window.confirm('确定要清空所有本地数据吗？此操作不可恢复。')) {
      await clearAll();
      window.location.reload();
    }
  };

  if (txs.length === 0) {
    return (
      <div className="pt-20 text-center">
        <div className="text-4xl mb-3">📅</div>
        <p className="font-medium">暂无历史数据</p>
        <p className="text-sm text-gray-400 mt-1">导入账单后这里会显示月度趋势</p>
      </div>
    );
  }

  return (
    <div className="pt-6">
      <h1 className="text-2xl font-semibold tracking-tight">历史总览</h1>
      <p className="text-sm text-gray-500 mt-1">共 {monthKeys.length} 个月 · {txs.length} 笔记录</p>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-2 gap-3 mt-5">
        <div className="bg-white rounded-2xl p-4">
          <p className="text-xs text-gray-400">累计支出</p>
          <p className="text-xl font-semibold mt-1">{fmtMoney(grandTotal)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4">
          <p className="text-xs text-gray-400">月均支出</p>
          <p className="text-xl font-semibold mt-1">{fmtMoney(avgMonth)}</p>
        </div>
        {maxMonth && (
          <div className="bg-white rounded-2xl p-4">
            <p className="text-xs text-gray-400">花费最高月</p>
            <p className="text-lg font-semibold mt-1">{fmtMonth(maxMonth.key)}</p>
            <p className="text-xs text-red-500">{fmtMoney(maxMonth.total)}</p>
          </div>
        )}
        {minMonth && (
          <div className="bg-white rounded-2xl p-4">
            <p className="text-xs text-gray-400">花费最低月</p>
            <p className="text-lg font-semibold mt-1">{fmtMonth(minMonth.key)}</p>
            <p className="text-xs text-green-600">{fmtMoney(minMonth.total)}</p>
          </div>
        )}
      </div>

      {/* 趋势图 */}
      {monthlyTotals.length >= 2 && (
        <div className="bg-white rounded-2xl p-4 mt-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">月度趋势</p>
          <div className="h-48">
            <Bar data={chartData} options={chartOptions} />
          </div>
        </div>
      )}

      {/* 每月明细列表 */}
      <div className="bg-white rounded-2xl p-4 mt-3">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">各月支出</p>
        {monthlyTotals.slice().reverse().map(m => (
          <div key={m.key} className="flex justify-between items-center py-2.5 border-b border-surface-100 last:border-0">
            <div>
              <p className="text-sm font-medium">{fmtMonth(m.key)}</p>
              <p className="text-xs text-gray-400">{m.count} 笔交易</p>
            </div>
            <span className="text-sm font-semibold">{fmtMoney(m.total)}</span>
          </div>
        ))}
      </div>

      {/* 操作按钮 */}
      <div className="mt-4 space-y-2">
        <button onClick={handleExport}
          className="w-full py-3 bg-white rounded-2xl text-sm font-medium text-brand-500 border border-surface-200 hover:bg-brand-50">
          📤 导出 JSON 备份
        </button>
        <button onClick={handleExportCSV}
          className="w-full py-3 bg-white rounded-2xl text-sm font-medium text-brand-500 border border-surface-200 hover:bg-brand-50">
          📊 导出分类 CSV
        </button>
        <button onClick={handleClear}
          className="w-full py-3 bg-white rounded-2xl text-sm font-medium text-red-400 border border-surface-200 hover:bg-red-50">
          🗑️ 清空本地数据
        </button>
      </div>
    </div>
  );
}
