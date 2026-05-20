import { useEffect, useRef, useState } from 'react'

const INITIAL = {
  jobs: [],
  stats: { total_jobs: 0, running_jobs: 0, total_saved: 0, avg_progress: 0 },
  feed: [],
  has_proxy: true,
}

export function useWs() {
  const [data, setData] = useState(INITIAL)
  const [status, setStatus] = useState('connecting')
  const [msgCount, setMsgCount] = useState(0)
  const wsRef = useRef(null)
  const retryRef = useRef(null)

  useEffect(() => {
    function connect() {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const url = `${proto}//${location.host}/ws`
      console.log('[WS] connecting to', url)
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[WS] connected')
        setStatus('connected')
      }
      ws.onmessage = (e) => {
        console.log('[WS] message received, size:', e.data.length, e.data.slice(0, 120))
        setMsgCount(n => n + 1)
        try {
          const msg = JSON.parse(e.data)
          if (msg._ping) {
            console.log('[WS] ping received — connection confirmed')
            return
          }
          setData(msg)
        } catch (err) {
          console.error('[WS] JSON parse error:', err)
        }
      }
      ws.onclose = (e) => {
        console.log('[WS] closed, code:', e.code, 'reason:', e.reason)
        setStatus('disconnected')
        retryRef.current = setTimeout(connect, 2000)
      }
      ws.onerror = (e) => {
        console.error('[WS] error:', e)
        setStatus('error')
        ws.close()
      }
    }
    connect()
    return () => {
      clearTimeout(retryRef.current)
      wsRef.current?.close()
    }
  }, [])

  return { ...data, wsStatus: status, wsMsgCount: msgCount }
}
