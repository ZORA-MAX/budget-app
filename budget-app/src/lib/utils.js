// 格式化金额
export function fmtMoney(n) {
  return '¥' + Math.round(n).toLocaleString('zh-CN');
}

// 月份 key 转显示文字
export function fmtMonth(key) {
  const [y, m] = key.split('-');
  return `${y}年${parseInt(m)}月`;
}

// 月份 key 转短文字
export function fmtMonthShort(key) {
  const [, m] = key.split('-');
  return `${parseInt(m)}月`;
}

// 百分比
export function pct(part, total) {
  if (!total) return '0%';
  return Math.round(part / total * 100) + '%';
}

// 读取文件为文本
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file, 'utf-8');
  });
}
