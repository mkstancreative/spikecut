// AES-256-GCM token encryption + HMAC-signed OAuth state. WebCrypto only, so it runs on Node and Vercel edge.
import type { SocialProvider } from './types'

const enc = new TextEncoder()
const dec = new TextDecoder()

// Binary string → bytes, typed as a plain ArrayBuffer view (what WebCrypto expects).
function toBytes(binary: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function keyBytes(): Uint8Array<ArrayBuffer> {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim()
  if (!raw) throw new Error('Missing TOKEN_ENCRYPTION_KEY — see apps/web/.env.example')
  const bytes = toBytes(atob(raw))
  if (bytes.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded')
  return bytes
}

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const unb64 = (s: string) => toBytes(atob(s))
const b64url = (s: string) => s.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const unb64url = (s: string) => s.replaceAll('-', '+').replaceAll('_', '/')

async function aesKey() {
  return crypto.subtle.importKey('raw', keyBytes(), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encrypt(plain: string | null | undefined): Promise<string | null> {
  if (!plain) return null
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(), enc.encode(plain))
  return `${b64(iv)}.${b64(ct)}`
}

export async function decrypt(value: string | null | undefined): Promise<string | null> {
  if (!value) return null
  const [iv, ct] = value.split('.')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(), unb64(ct))
  return dec.decode(pt)
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey('raw', keyBytes(), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(b64(await crypto.subtle.sign('HMAC', key, enc.encode(`oauth-state:${data}`))))
}

export type OAuthState = { workspaceId: string; userId: string; provider: SocialProvider; exp: number; nonce: string }

/** Signed, expiring state so the OAuth callback knows who started the flow and can't be forged. */
export async function signState(s: Omit<OAuthState, 'exp' | 'nonce'>): Promise<string> {
  const payload = b64url(btoa(JSON.stringify({ ...s, exp: Date.now() + 10 * 60 * 1000, nonce: crypto.randomUUID() })))
  return `${payload}.${await hmac(payload)}`
}

export async function verifyState(state: string | undefined): Promise<OAuthState> {
  const [payload, sig] = (state ?? '').split('.')
  if (!payload || !sig || sig !== (await hmac(payload))) throw new Error('Invalid sign-in state — please try connecting again')
  const s = JSON.parse(atob(unb64url(payload))) as OAuthState
  if (s.exp < Date.now()) throw new Error('That connection link expired — please try again')
  return s
}
