import Papa from 'papaparse';

// 解析日期字符串
function parseDate(str) {
  if (!str) return null;
  const s = str.trim().replace(/\//g, '-');
  const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
}

// 自动检测并解析 CSV
export function parseCSV(text, filename = '') {
  // 去除 BOM
  text = text.replace(/^\uFEFF/, '');

  if (text.includes('微信支付账单明细') || text.includes('交易时间,交易类型,交易对方')) {
    return { source: 'wechat', txs: parseWechat(text) };
  }
  if (text.includes('支付宝') || text.includes('交易号') || text.includes('收/支')) {
    return { source: 'alipay', txs: parseAlipay(text) };
  }

  // 两种都试
  const wx = parseWechat(text);
  if (wx.length > 0) return { source: 'wechat', txs: wx };
  const ali = parseAlipay(text);
  if (ali.length > 0) return { source: 'alipay', txs: ali };

  return { source: 'unknown', txs: [] };
}

// 微信账单
function parseWechat(text) {
  const lines = text.split('\n');
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('交易时间') && lines[i].includes('交易对方')) {
      headerIdx = i; break;
    }
  }
  if (headerIdx < 0) return [];

  const csvText = lines.slice(headerIdx).join('\n');
  const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const rows = [];

  for (const row of result.data) {
    const typeField = row['收/支'] || '';
    if (!typeField.includes('支出')) continue;

    const amtStr = (row['金额(元)'] || '').replace(/[¥,￥\s]/g, '');
    const amount = parseFloat(amtStr);
    if (!amount || amount <= 0) continue;

    const date = parseDate(row['交易时间'] || '');
    if (!date) continue;

    const counterpart = (row['交易对方'] || '').trim();
    const product = (row['商品'] || '').trim();
    const name = product ? `${counterpart} ${product}` : counterpart;

    rows.push({
      id: `wx_${date.getTime()}_${Math.random().toString(36).slice(2, 6)}`,
      date,
      name,
      amount,
      source: 'wechat',
      counterpart,
      product,
    });
  }
  return rows;
}

// 支付宝账单
function parseAlipay(text) {
  const lines = text.split('\n');
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i].includes('交易时间') || lines[i].includes('交易创建时间')) && lines[i].includes('交易对方')) {
      headerIdx = i; break;
    }
  }
  if (headerIdx < 0) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('付款') || lines[i].includes('金额')) { headerIdx = i; break; }
    }
  }
  if (headerIdx < 0) return [];

  const csvText = lines.slice(headerIdx).join('\n');
  const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const rows = [];

  for (const row of result.data) {
    // Normalize keys
    const r = {};
    for (const k in row) r[k.trim()] = typeof row[k] === 'string' ? row[k].trim() : row[k];

    const typeField = r['收/支'] || r['资金状态'] || '';
    if (!typeField.includes('支出') && !typeField.includes('付款')) continue;

    const status = r['交易状态'] || r['资金状态'] || '';
    if (status.includes('退款') || status.includes('关闭') || status.includes('失败')) continue;

    const amtStr = (r['金额'] || r['实际金额'] || r['金额（元）'] || '').replace(/[¥,￥\s]/g, '');
    const amount = parseFloat(amtStr);
    if (!amount || amount <= 0) continue;

    const date = parseDate(r['交易时间'] || r['交易创建时间'] || '');
    if (!date) continue;

    const counterpart = (r['交易对方'] || '').trim();
    const product = (r['商品名称'] || r['商品说明'] || '').trim();
    const name = product ? `${counterpart} ${product}` : counterpart;

    rows.push({
      id: `ali_${date.getTime()}_${Math.random().toString(36).slice(2, 6)}`,
      date,
      name,
      amount,
      source: 'alipay',
      counterpart,
      product,
    });
  }
  return rows;
}

// 按月份分组
export function groupByMonth(txs) {
  const map = {};
  for (const tx of txs) {
    const key = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, '0')}`;
    if (!map[key]) map[key] = [];
    map[key].push(tx);
  }
  return map;
}
