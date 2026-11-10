import { useEffect, useRef, useState } from 'react'
import { createCloudSyncController, getConflictBackup, listConflictBackups } from '../lib/cloud-sync'

const CLOUD_LEDGER_URL = 'https://budget-app-nu-wheat.vercel.app/#/history'
const initialState = { status: 'connecting', lastSyncedAt: null, conflict: null }
const buttonClass = 'rounded-xl px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

function formatSyncTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function VersionSummary({ title, summary }) {
  const months = summary?.monthKeys || summary?.months || []
  const monthKeys = Array.isArray(months)
    ? months.map(month => typeof month === 'string' ? month : month.monthKey).filter(Boolean).sort()
    : []
  const monthCount = summary?.monthCount ?? (summary && Array.isArray(months) ? monthKeys.length : null)
  const transactionCount = summary?.transactionCount ?? summary?.totalTransactions

  return (
    <div className="min-w-0 rounded-lg bg-white/70 dark:bg-gray-900/40 p-3">
      <div className="text-xs font-medium text-ink dark:text-white">{title}</div>
      <div className="text-sm text-ink dark:text-white mt-1">
        {monthCount ?? '—'} 个月 · {transactionCount ?? '—'} 笔
      </div>
      <div className="text-[11px] text-ink-secondary mt-1 break-words leading-relaxed">
        {monthKeys.length ? monthKeys.join('、') : monthCount === 0 ? '暂无账单月份' : '月份信息待读取'}
      </div>
    </div>
  )
}

export default function CloudSyncPanel() {
  const isStaticSite = typeof window !== 'undefined' && window.location.hostname.endsWith('.github.io')
  const [state, setState] = useState(initialState)
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  const [action, setAction] = useState(null)
  const [actionError, setActionError] = useState('')
  const [paused, setPaused] = useState(false)
  const [savedBackups, setSavedBackups] = useState([])
  const controllerRef = useRef(null)
  const authenticatedRef = useRef(false)

  useEffect(() => {
    if (isStaticSite) return undefined
    let active = true
    const controller = createCloudSyncController({
      onStateChange: next => {
        if (!active) return
        if (next.status === 'signed-out') authenticatedRef.current = false
        if (['synced', 'syncing', 'conflict'].includes(next.status)) authenticatedRef.current = true
        setState(next)
      },
    })
    controllerRef.current = controller
    Promise.resolve(controller.start()).catch(() => {
      if (active) setState(current => ({ ...current, status: 'error' }))
    })
    return () => {
      active = false
      controller.stop()
      controllerRef.current = null
    }
  }, [isStaticSite])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  useEffect(() => {
    if (isStaticSite) return undefined
    let active = true
    listConflictBackups().then(backups => {
      if (active) setSavedBackups(backups)
    }).catch(() => {})
    return () => { active = false }
  }, [isStaticSite, state.backupId])

  if (isStaticSite) {
    return (
      <section aria-label="云端账本入口" className="bg-white dark:bg-surface-card-dark rounded-xl p-4 mb-4 space-y-3">
        <div>
          <h2 className="text-sm font-medium text-ink dark:text-white">手机与电脑同步</h2>
          <p className="text-xs text-ink-secondary leading-relaxed mt-1">
            当前页面的账单保存在本机。打开云端账本并登录 Vercel 后，可在手机和电脑之间自动同步。
          </p>
        </div>
        <a href={CLOUD_LEDGER_URL} className={`${buttonClass} inline-block bg-brand text-white hover:bg-brand/90`}>
          打开云端账本
        </a>
        <p className="text-[11px] text-ink-tertiary leading-relaxed">
          此处的本地数据会保留。首次迁移请在「历史记录」导出完整备份，再到云端账本导入；两个网址的本机数据互不相通。
        </p>
      </section>
    )
  }

  const signedOut = state.status === 'signed-out'
  const conflict = state.status === 'conflict' && state.conflict
  const offline = !online || state.status === 'offline'
  const busy = Boolean(action) || ['connecting', 'syncing'].includes(state.status)
  const lastSynced = formatSyncTime(state.lastSyncedAt)
  const statusLabel = paused ? '自动同步已暂停'
    : offline ? (signedOut || (!authenticatedRef.current && !state.pendingChanges) ? '离线 · 数据保存在本机' : '离线待同步')
      : conflict ? '两个版本需要你选择'
        : state.status === 'connecting' ? '正在检查登录与云端数据…'
          : state.status === 'syncing' ? '同步中…'
            : state.status === 'synced' ? (state.pendingChanges ? '修改待同步' : '已同步')
              : signedOut ? '未登录 · 数据保存在本机'
                : '同步暂未完成'
  const statusColor = conflict || paused || state.pendingChanges || state.status === 'error' || offline
    ? 'bg-amber-500' : state.status === 'synced' ? 'bg-emerald-500' : 'bg-gray-400'

  const runAction = async (name, task) => {
    setAction(name)
    setActionError('')
    try {
      await task()
    } catch {
      setActionError(name.startsWith('download-') ? '备份文件下载未完成，请重试。'
        : name === 'logout'
        ? '退出未完成，请重试。自动同步已暂停，本机账单仍保留。'
        : name === 'local' || name === 'cloud'
          ? '尚未完成备份与版本选择，本机数据仍保留。请联网后重试。'
          : '同步未完成，本机数据仍保留。请联网后重试。')
    } finally {
      setAction(null)
    }
  }

  const logout = () => runAction('logout', async () => {
    controllerRef.current?.stop()
    setPaused(true)
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
    if (!response.ok) throw new Error('logout_failed')
    authenticatedRef.current = false
    setPaused(false)
    setState({ status: 'signed-out', lastSyncedAt: null, conflict: null })
  })

  const downloadBackup = (id, version) => runAction(`download-${version}`, async () => {
    const saved = await getConflictBackup(id)
    const backup = saved?.[version]
    if (!backup) throw new Error('backup_missing')
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `budget-conflict-${version}-${String(saved.createdAt || '').slice(0, 10)}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  })

  return (
    <section aria-label="私有云同步" className="bg-white dark:bg-surface-card-dark rounded-xl p-4 mb-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-ink dark:text-white">私有云同步</h2>
          <div role="status" aria-live="polite" className="flex items-center gap-1.5 mt-1.5 text-xs text-ink-secondary">
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full flex-none ${statusColor}`} />
            {statusLabel}
          </div>
          {lastSynced && <p className="text-[11px] text-ink-tertiary mt-1">上次同步：{lastSynced}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {signedOut && online && (
            <a href="/api/auth/login" className={`${buttonClass} bg-brand text-white hover:bg-brand/90`}>登录 Vercel</a>
          )}
          {!signedOut && !conflict && !paused && (
            <button type="button" disabled={busy || offline} onClick={() => runAction('sync', () => controllerRef.current?.syncNow())}
              className={`${buttonClass} bg-brand/10 text-brand hover:bg-brand/20`}>
              {busy ? '同步中…' : '重新同步'}
            </button>
          )}
          {(authenticatedRef.current || paused) && (
            <button type="button" disabled={Boolean(action)} onClick={logout}
              className={`${buttonClass} border border-gray-200 dark:border-gray-700 text-ink-secondary hover:bg-gray-50 dark:hover:bg-gray-800`}>
              {action === 'logout' ? '正在退出…' : '退出登录'}
            </button>
          )}
        </div>
      </div>

      {signedOut ? (
        <p className="text-xs text-ink-tertiary leading-relaxed">在手机和电脑使用同一个 Vercel 账户登录。登录后，账单与分类会自动同步；首次遇到不同版本会先请你选择。</p>
      ) : !conflict && (
        <p className="text-xs text-ink-tertiary leading-relaxed">
          {offline ? '离线修改保存在本机，联网后会继续同步。'
            : paused ? '退出完成后，本机账单会继续保留。'
              : state.status === 'error' ? '当前修改仍保存在本机，确认同步成功后再切换设备。'
                : '账单、分类和贷款记录自动同步。退出登录后，本机账单会保留。'}
        </p>
      )}

      {conflict && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-3">
          <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-100">
            本机与云端内容不同，尚未覆盖任何一份。请先核对月份和笔数；选择后会先保留两份备份，再将选中的版本用于手机和电脑。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <VersionSummary title="本机版本" summary={state.conflict.localSummary} />
            <VersionSummary title="云端版本" summary={state.conflict.cloudSummary} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button type="button" disabled={Boolean(action) || offline} onClick={() => runAction('local', () => controllerRef.current?.resolveConflict('local'))}
              className={`${buttonClass} bg-brand text-white hover:bg-brand/90`}>
              {action === 'local' ? '正在备份并同步…' : '备份两份后，使用本机版本'}
            </button>
            <button type="button" disabled={Boolean(action) || offline} onClick={() => runAction('cloud', () => controllerRef.current?.resolveConflict('cloud'))}
              className={`${buttonClass} border border-brand/30 text-brand hover:bg-brand/5`}>
              {action === 'cloud' ? '正在备份并同步…' : '备份两份后，使用云端版本'}
            </button>
          </div>
          <p className="text-[11px] text-ink-secondary leading-relaxed">笔数相同也可能有不同的分类或贷款记录。暂不选择时可继续查看，本次同步会等待你的选择。</p>
        </div>
      )}
      {actionError && <p role="alert" className="text-xs rounded-lg px-3 py-2 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300">{actionError}</p>}
      {savedBackups.length > 0 && (
        <details className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <summary className="text-xs text-brand cursor-pointer">下载同步前保留的版本（{savedBackups.length} 组）</summary>
          <p className="text-[11px] text-ink-tertiary leading-relaxed mt-2">两份备份保存在这台设备，可分别下载。需要恢复时，在「历史记录 → 文件备份与恢复」导入对应文件。</p>
          <div className="space-y-2 mt-2 max-h-72 overflow-y-auto">
            {savedBackups.map(backup => (
              <div key={backup.id} className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
                <div className="text-[11px] text-ink-secondary mb-2">{formatSyncTime(backup.createdAt) || '同步前备份'}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button type="button" disabled={Boolean(action)} onClick={() => downloadBackup(backup.id, 'local')}
                    className={`${buttonClass} bg-brand/10 text-brand hover:bg-brand/20`}>下载当时的本机版本</button>
                  <button type="button" disabled={Boolean(action) || backup.hasCloud === false} onClick={() => downloadBackup(backup.id, 'cloud')}
                    className={`${buttonClass} border border-brand/30 text-brand hover:bg-brand/5`}>
                    {backup.hasCloud === false ? '当时云端尚无账本' : '下载当时的云端版本'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}
