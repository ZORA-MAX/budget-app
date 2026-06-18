import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chart, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { groupByMonth } from '../lib/csvParser';
import { summarizeByCategory, summarizeByDimension, classify, DIMENSIONS } from '../lib/categories';
import { fmtMoney, fmtMonth, pct } from '../lib/utils';
import { getSummary, saveSummary } from '../lib/storage';

Chart.register(ArcElement, Tooltip, Legend);

export default function DashboardPage({ txs }) {
  const navigate = useNavigate();

  // 按月分组
  const monthlyMap = useMemo(() => groupByMonth(txs), [txs]);
  const monthKeys = useMemo(() => Object.keys(monthlyMap).sort().reverse(), [monthlyMap]);
  const [selectedMonth, setSelectedMonth] = useState(monthKeys[0] || '');

  useEffect(() => { if (monthKeys[0]) setSelectedMonth(monthKeys[0]); }, [monthKeys]);

  const monthTxs = useMemo(() => monthlyMap[selectedMonth] || [], [monthlyMap, selectedMonth]);
  const byCat = useMemo(() => summarizeByCategory(monthTxs), [monthTxs]);
  const byDim = useMemo(() => summarizeByDimension(monthTxs), [monthTxs]);
  const total = useMemo(() => monthTxs.reduce((s, t) => s + t.amount, 0), [monthTxs]);
  const count = monthTxs.length;

  // 上月对比
  const prevKey = monthKeys[monthKeys.indexOf(selectedMonth) + 1];
  const prevTotal = prevKey ? (monthlyMap[prevKey] || []).reduce((s, t) => s + t.amount, 0) : 0;
  const diff = total - prevTotal;

  // Top 支出
  const topTxs = useMemo(() => [...monthTxs].sort((a, b) => b.amount - a.amount).slice(0, 6), [monthTxs]);

  // AI 总结
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (selectedMonth) {
      getSummary(selectedMonth).then(s => setAiSummary(s?.text || ''));
    }
  }, [selectedMonth]);

  const fetchAISummary = async () => {
    setAiLoading(true);
    try {
      const monthData = {
        month: selectedMonth,
        total: Math.round(total),
        count,
        categories: byCat.map(c => ({ name: c.label, amount: Math.round(c.total), percent: pct(c.total, total) })),
        dimensions: byDim.map(d => ({ name: d.label, amount: Math.round(d.total), percent: pct(d.total, total) })),
        topExpenses: topTxs.slice(0, 5).map(t => ({ name: t.name, amount: Math.round(t.amount) })),
        prevMonthTotal: prevTotal > 0 ? Math.round(prevTotal) : null,
        diff: prevTotal > 0 ? Math.round(diff) : null,
      };

      const res = await fetch('/api/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthData })
      });

      if (!res.ok) throw new Error('API 请求失败');
      const data = await res.json();
      setAiSummary(data.summary);
      await saveSummary(selectedMonth, data.summary);
    } catch (e) {
      setAiSummary('AI 总结暂时不可用。部署到 Vercel 并配置 ANTHROPIC_API_KEY 后即可使用。');
    }
    setAiLoading(false);
  };

  // 环形图数据
  const chartData = useMemo(() => ({
    labels: byCat.map(c => c.label),
    datasets: [{
      data: byCat.map(c => Math.round(c.total)),
      backgroundColor: byCat.map(c => c.color),
      borderWidth: 2,
      borderColor: '#f5f5f7',
      hoverOffset: 6,
    }]
  }), [byCat]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => ` ¥${ctx.raw.toLocaleString()}` } }
    }
  };

  // 空状态
  if (txs.length === 0) {
    return (
      <div className="pt-20 text-center">
        <div className="text-4xl mb-3">📭</div>
        <p className="font-medium">还没有数据</p>
        <p className="text-sm text-gray-400 mt-1">先去导入页上传账单 CSV</p>
        <button onClick={() => navigate('/')}
          className="mt-4 px-6 py-2.5 bg-brand-500 text-white rounded-xl text-sm font-medium">
          去导入 →
        </button>
      </div>
    );
  }

  return (
    <div className="pt-6">
      <h1 className="text-2xl font-semibold tracking-tight">月度看板</h1>

      {/* 月份切换 */}
      {monthKeys.length > 1 && (
        <div className="flex gap-2 mt-4 overflow-x-auto pb-2 scrollbar-hide">
          {monthKeys.map(k => (
            <button key={k} onClick={() => setSelectedMonth(k)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm border transition-colors
                ${k === selectedMonth
                  ? 'border-brand-400 bg-brand-50 text-brand-600 font-medium'
                  : 'border-surface-200 text-gray-500 hover:border-brand-400'}`}>
              {fmtMonth(k)}
            </button>
          ))}
        </div>
      )}

      {/* 核心指标 */}
      <div className="grid grid-cols-2 gap-3 mt-5">
        <div className="bg-white rounded-2xl p-4">
          <p className="text-xs text-gray-400">本月总支出</p>
          <p className="text-2xl font-semibold mt-1">{fmtMoney(total)}</p>
          {prevTotal > 0 && (
            <p className={`text-xs mt-1 ${diff > 0 ? 'text-red-500' : 'text-green-600'}`}>
              {diff > 0 ? '↑' : '↓'} 比上月{diff > 0 ? '多' : '少'} {fmtMoney(Math.abs(diff))}
            </p>
          )}
        </div>
        <div className="bg-white rounded-2xl p-4">
          <p className="text-xs text-gray-400">交易笔数</p>
          <p className="text-2xl font-semibold mt-1">{count}</p>
          <p className="text-xs text-gray-400 mt-1">日均 {(count / 30).toFixed(1)} 笔</p>
        </div>
      </div>

      {/* 维度概览 */}
      <div className="flex gap-2 mt-4 flex-wrap">
        {byDim.map(d => (
          <span key={d.key} className="text-xs px-3 py-1.5 rounded-full font-medium"
            style={{ background: d.bg, color: d.color }}>
            {d.label} {pct(d.total, total)}
          </span>
        ))}
      </div>

      {/* 分类环形图 */}
      <div className="bg-white rounded-2xl p-4 mt-4">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">支出分类</p>
        <div className="h-52">
          <Doughnut data={chartData} options={chartOptions} />
        </div>

        {/* 分类明细 */}
        <div className="mt-4 space-y-3">
          {byCat.map(c => (
            <div key={c.key} className="flex items-center gap-3">
              <span className="text-lg w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: c.bg }}>{c.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-medium">{c.label}</span>
                  <span className="text-sm font-semibold">{fmtMoney(c.total)}</span>
                </div>
                <div className="h-1 bg-surface-100 rounded-full mt-1">
                  <div className="h-1 rounded-full transition-all" style={{
                    width: pct(c.total, total), backgroundColor: c.color
                  }} />
                </div>
              </div>
              <span className="text-xs text-gray-400 w-8 text-right">{pct(c.total, total)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top 支出 */}
      <div className="bg-white rounded-2xl p-4 mt-3">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">最大单笔支出</p>
        {topTxs.map((tx, i) => {
          const { cat } = classify(tx.name);
          return (
            <div key={i} className="flex items-center justify-between py-2.5 border-b border-surface-100 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate max-w-[200px]">{tx.name || '未知商家'}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-400">{tx.date.getMonth() + 1}月{tx.date.getDate()}日</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: tx.source === 'wechat' ? '#07c16018' : '#1677ff18',
                             color: tx.source === 'wechat' ? '#05a04d' : '#1060d0' }}>
                    {tx.source === 'wechat' ? '微信' : '支付宝'}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: cat.bg, color: cat.color }}>
                    {cat.emoji} {cat.label}
                  </span>
                </div>
              </div>
              <span className="text-sm font-semibold text-red-500 ml-3">-{fmtMoney(tx.amount)}</span>
            </div>
          );
        })}
      </div>

      {/* AI 总结 */}
      <div className="bg-white rounded-2xl p-4 mt-3">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">AI 消费分析</p>
          <button onClick={fetchAISummary} disabled={aiLoading}
            className="text-xs px-3 py-1 bg-brand-50 text-brand-500 rounded-full font-medium hover:bg-brand-100 disabled:opacity-50">
            {aiLoading ? '分析中...' : aiSummary ? '重新分析' : '生成分析'}
          </button>
        </div>
        {aiSummary ? (
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{aiSummary}</p>
        ) : (
          <p className="text-sm text-gray-400">点击上方按钮，AI 会根据你的消费数据生成个性化分析</p>
        )}
      </div>
    </div>
  );
}
