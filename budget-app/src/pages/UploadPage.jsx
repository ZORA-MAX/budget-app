import React, { useState, useRef, useCallback } from 'react';
import { parseCSV } from '../lib/csvParser';
import { saveTransactions } from '../lib/storage';
import { readFileAsText } from '../lib/utils';

export default function UploadPage({ onImport, existingCount }) {
  const [files, setFiles] = useState([]);     // { name, source, count, txs }
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const inputRef = useRef();

  const handleFiles = useCallback(async (fileList) => {
    setError('');
    for (const file of fileList) {
      if (!file.name.endsWith('.csv')) {
        setError('请上传 CSV 文件');
        continue;
      }
      try {
        const text = await readFileAsText(file);
        const { source, txs } = parseCSV(text, file.name);
        if (txs.length === 0) {
          setError(`"${file.name}" 无法解析，请确认是微信或支付宝导出的 CSV 账单`);
          continue;
        }
        setFiles(prev => [...prev.filter(f => f.source !== source), {
          name: file.name, source, count: txs.length, txs
        }]);
      } catch (e) {
        setError('文件读取失败：' + e.message);
      }
    }
  }, []);

  const handleDrop = useCallback(e => {
    e.preventDefault(); setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleSubmit = async () => {
    setImporting(true);
    const allTxs = files.flatMap(f => f.txs);
    await saveTransactions(allTxs);
    onImport(allTxs);
    setImporting(false);
  };

  const removeFile = (source) => {
    setFiles(prev => prev.filter(f => f.source !== source));
  };

  return (
    <div className="pt-6">
      <h1 className="text-2xl font-semibold tracking-tight">月度账单分析</h1>
      <p className="text-sm text-gray-500 mt-1">导入微信 + 支付宝 CSV 账单，自动生成消费报告</p>

      {existingCount > 0 && (
        <div className="mt-4 bg-brand-50 rounded-xl px-4 py-3 text-sm text-brand-600">
          已有 {existingCount} 笔历史记录，新导入的数据会自动合并
        </div>
      )}

      {/* Drop zone */}
      <div
        className={`mt-6 border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
          ${dragging ? 'border-brand-400 bg-brand-50 drag-pulse' : 'border-surface-200 bg-white hover:border-brand-400'}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current.click()}
      >
        <div className="text-4xl mb-3">{dragging ? '📂' : '📄'}</div>
        <p className="font-medium">点击选择或拖拽 CSV 文件</p>
        <p className="text-sm text-gray-400 mt-1">支持同时导入微信和支付宝账单</p>
        <input ref={inputRef} type="file" accept=".csv" multiple className="hidden"
          onChange={e => handleFiles(e.target.files)} />
      </div>

      {error && (
        <div className="mt-3 bg-red-50 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          {files.map(f => (
            <div key={f.source} className="flex items-center justify-between bg-green-50 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">{f.source === 'wechat' ? '💬' : '🔵'}</span>
                <div>
                  <p className="text-sm font-medium">{f.name}</p>
                  <p className="text-xs text-gray-500">{f.source === 'wechat' ? '微信' : '支付宝'} · {f.count} 笔支出</p>
                </div>
              </div>
              <button onClick={() => removeFile(f.source)}
                className="text-gray-400 hover:text-red-500 text-lg px-2">✕</button>
            </div>
          ))}

          <button onClick={handleSubmit} disabled={importing}
            className="w-full mt-3 py-3.5 bg-brand-500 text-white rounded-2xl font-medium
              hover:bg-brand-600 disabled:bg-brand-100 disabled:cursor-not-allowed transition-colors">
            {importing ? '正在导入...' : `导入并生成报告 →`}
          </button>
        </div>
      )}

      {/* Guide */}
      {files.length === 0 && (
        <div className="mt-6 bg-white rounded-2xl p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">如何导出账单</p>
          {[
            { num: '1', title: '微信账单', desc: '微信 → 我 → 支付 → 钱包 → 账单 → 右上角菜单 → 下载账单 → 选择月份 → 导出 CSV' },
            { num: '2', title: '支付宝账单', desc: '支付宝 → 首页搜索"账单" → 所有交易 → 筛选月份 → 导出账单 → CSV 格式' },
            { num: '3', title: '导入分析', desc: '两份 CSV 可以一起拖入，系统自动识别来源并合并去重' },
          ].map(s => (
            <div key={s.num} className="flex gap-3 py-3 border-b border-surface-100 last:border-0">
              <span className="w-6 h-6 bg-brand-500 text-white rounded-full text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">{s.num}</span>
              <div>
                <p className="text-sm font-medium">{s.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
