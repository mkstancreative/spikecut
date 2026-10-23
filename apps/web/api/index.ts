import { handle } from 'hono/vercel'
import { app } from '../server/app.js'

// All /api/* requests are rewritten here (see vercel.json) and routed by Hono.
// Runs on Vercel's default Node.js runtime: the server code needs Node built-ins.
const handler = handle(app)

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const OPTIONS = handler
