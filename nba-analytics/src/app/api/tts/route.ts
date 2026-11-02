import { z } from 'zod'
import { badRequest, errorResponse, serverError } from '@/app/api/_lib/response'
import { forSpeech } from '@/lib/analytics/pronunciation'

/**
 * Text → speech through a local Ollama speech model (Phonon by default), for the In-game tab's
 * spoken play-by-play. Proxied rather than called from the browser so the page needs no CORS
 * setup and the model/host stay server config. Like the live feed, this only works where the app
 * runs on the same machine as Ollama (local dev).
 *
 *   POST /api/tts { text, voice? } → audio/wav
 */
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434'
const MODEL = process.env.OLLAMA_TTS_MODEL ?? 'phonon'
const DEFAULT_VOICE = process.env.OLLAMA_TTS_VOICE ?? 'Hugh'

const bodySchema = z.object({
  text: z.string().trim().min(1, 'Text is required').max(500, 'Text must be 500 characters or fewer'),
  voice: z.string().trim().min(1).max(60).optional(),
})

export async function POST(request: Request) {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return badRequest('Body must be JSON: { "text": "…" }')
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => i.message).join('; '))

  let res: Response
  try {
    res = await fetch(`${OLLAMA_HOST}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input: forSpeech(parsed.data.text), voice: parsed.data.voice ?? DEFAULT_VOICE }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return errorResponse('UPSTREAM_UNAVAILABLE', `Ollama isn't reachable at ${OLLAMA_HOST}. Open the Ollama app and try again.`, 503)
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200)
    const missing = res.status === 404 || /not found/i.test(detail)
    return errorResponse(
      'UPSTREAM_UNAVAILABLE',
      missing ? `The "${MODEL}" speech model isn't installed. Run: ollama pull ${MODEL}` : `Ollama speech failed (${res.status}): ${detail}`,
      502,
    )
  }

  try {
    return new Response(await res.arrayBuffer(), {
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'audio/wav', 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    console.error('POST /api/tts failed', e)
    return serverError()
  }
}
