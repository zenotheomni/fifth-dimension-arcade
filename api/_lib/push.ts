import webpush from 'web-push'
import { getPushEnv } from './config.js'
import { getSupabase } from './supabase.js'

type QueueItem = {
  alert_id: number
  kind: string
  title: string
  body: string
  url: string
  subscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[]
}

type SendResult = {
  alert_id: number
  subscription_id: string
  status: 'sent' | 'failed' | 'gone' | 'dry_run'
  http_status?: number
  error?: string
}

let vapidReady = false

/**
 * Drain pending push alerts (created by RPCs) and send them with Web Push.
 * Bounded: one dequeue batch, 4s overall budget, never throws.
 */
export async function flushPush(reason: string): Promise<{ sent: number; failed: number; items: number; skipped?: string }> {
  const env = getPushEnv()
  if (!env) {
    console.log('[arcade-push] skipped (push env not configured)', reason)
    return { sent: 0, failed: 0, items: 0, skipped: 'not_configured' }
  }
  const dryRun = process.env.ARCADE_PUSH_DRY_RUN === '1'
  try {
    if (!vapidReady) {
      webpush.setVapidDetails(env.subject, env.publicKey, env.privateKey)
      vapidReady = true
    }
    const supabase = getSupabase()
    const { data, error } = await supabase.rpc('arcade_push_dequeue', {
      p_server_key: env.serverKey,
      p_limit: 20,
    })
    if (error) {
      console.error('[arcade-push] dequeue failed', error.message)
      return { sent: 0, failed: 0, items: 0, skipped: 'dequeue_failed' }
    }
    const items = ((data as { items?: QueueItem[] })?.items ?? []) as QueueItem[]
    const results: SendResult[] = []
    const deadline = Date.now() + 4000
    await Promise.all(
      items.flatMap((item) =>
        item.subscriptions.map(async (sub) => {
          const payload = JSON.stringify({
            title: item.title,
            body: item.body,
            url: item.url,
            tag: `arcade-${item.kind}-${item.alert_id}`,
            kind: item.kind,
          })
          if (dryRun) {
            results.push({ alert_id: item.alert_id, subscription_id: sub.id, status: 'dry_run' })
            return
          }
          try {
            const timeout = Math.max(500, deadline - Date.now())
            const r = await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload,
              { TTL: 60 * 60, urgency: 'high', timeout },
            )
            results.push({ alert_id: item.alert_id, subscription_id: sub.id, status: 'sent', http_status: r.statusCode })
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode
            results.push({
              alert_id: item.alert_id,
              subscription_id: sub.id,
              status: status === 404 || status === 410 ? 'gone' : 'failed',
              http_status: status,
              error: String((e as Error).message ?? e).slice(0, 200),
            })
          }
        }),
      ),
    )
    if (results.length) {
      const { error: repErr } = await supabase.rpc('arcade_push_report', {
        p_server_key: env.serverKey,
        p_results: results,
      })
      if (repErr) console.error('[arcade-push] report failed', repErr.message)
    }
    const sent = results.filter((r) => r.status === 'sent' || r.status === 'dry_run').length
    const failed = results.length - sent
    console.log('[arcade-push]', reason, JSON.stringify({ items: items.length, sent, failed, dryRun }))
    return { sent, failed, items: items.length }
  } catch (e) {
    console.error('[arcade-push] flush error', (e as Error).message)
    return { sent: 0, failed: 0, items: 0, skipped: 'error' }
  }
}
