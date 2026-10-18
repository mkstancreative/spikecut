// fal.ai queue API (plain fetch): submit a job, poll its status, fetch the result.
// https://docs.fal.ai/model-apis/model-endpoints/queue

const QUEUE = 'https://queue.fal.run'
export const LUCY_RESTYLE = 'decart/lucy-restyle' // video-to-video restyle, sources up to 30 min, 720p, no audio

export const falEnabled = () => Boolean(process.env.FAL_KEY?.trim())

export type FalRequest = { requestId: string; statusUrl: string; responseUrl: string }
export type FalStatus = { status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED'; queuePosition?: number; logs: string[] }

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Key ${process.env.FAL_KEY!.trim()}`, 'Content-Type': 'application/json', ...init?.headers },
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const detail = json.detail ?? json.error ?? res.statusText
    throw new Error(`fal.ai: ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 300)}`)
  }
  return json as T
}

export async function falSubmit(model: string, input: Record<string, unknown>): Promise<FalRequest> {
  const r = await call<{ request_id: string; status_url: string; response_url: string }>(`${QUEUE}/${model}`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return { requestId: r.request_id, statusUrl: r.status_url, responseUrl: r.response_url }
}

export async function falStatus(req: FalRequest): Promise<FalStatus> {
  const r = await call<{ status: FalStatus['status']; queue_position?: number; logs?: { message: string }[] | null }>(
    `${req.statusUrl}?logs=1`,
  )
  return { status: r.status, queuePosition: r.queue_position, logs: r.logs?.map((l) => l.message) ?? [] }
}

/** Lucy Restyle answers with { video: { url } }. Errors surface here once the request has finished. */
export async function falResult(req: FalRequest): Promise<{ videoUrl: string }> {
  const r = await call<{ video?: { url?: string } }>(req.responseUrl)
  if (!r.video?.url) throw new Error('fal.ai finished without a video')
  return { videoUrl: r.video.url }
}
