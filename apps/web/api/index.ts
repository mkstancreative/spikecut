import { handle } from 'hono/vercel'
import { app } from '../server/app'

// All /api/* requests are rewritten here (see vercel.json) and routed by Hono.
export const config = { runtime: 'edge' }

export default handle(app)
