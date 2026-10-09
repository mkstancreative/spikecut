import { serve } from '@hono/node-server'
import { app } from './app'

const port = Number(process.env.API_PORT ?? 8787)
serve({ fetch: app.fetch, port }, () => console.log(`API ready on http://localhost:${port}/api/health`))
