import { useEffect, useState } from 'react'
import { subscribeUnassignedQueueSettings } from '../unassignedQueue.js'

export function useUnassignedQueue() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsub = subscribeUnassignedQueueSettings(
      (data) => {
        setSettings(data)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error(err)
        setError(err.message || 'Failed to load unassigned queue settings')
        setLoading(false)
      },
    )
    return unsub
  }, [])

  return {
    leadQueueFolder: settings?.leadQueueFolder ?? null,
    scanDays: settings?.scanDays ?? 30,
    deepScan: settings?.deepScan !== false,
    forceRescan: Boolean(settings?.forceRescan),
    loading,
    error,
  }
}
