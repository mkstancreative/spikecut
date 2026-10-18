import { spawn } from 'node:child_process'

export class ToolError extends Error {}

/** Run a command, resolve with stdout. stderr tail is included in the error for debugging. */
type RunOpts = { cwd?: string; onStderr?: (line: string) => void; onStdout?: (line: string) => void; signal?: AbortSignal }

export function run(cmd: string, args: string[], opts: RunOpts = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new ToolError('Operation cancelled'))
    // Run each media tool in its own process group so cancellation also stops
    // helpers it launched (yt-dlp commonly starts ffmpeg while downloading).
    const grouped = process.platform !== 'win32'
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: grouped })
    let out = ''
    let err = ''
    let forceKill: NodeJS.Timeout | undefined
    child.stdout.on('data', (d: Buffer) => {
      const text = d.toString()
      out += text
      if (opts.onStdout) for (const line of text.split(/\r|\n/)) if (line.trim()) opts.onStdout(line)
    })
    child.stderr.on('data', (d: Buffer) => {
      const text = d.toString()
      err = (err + text).slice(-4000)
      if (opts.onStderr) for (const line of text.split(/\r|\n/)) if (line.trim()) opts.onStderr(line)
    })
    const abort = () => {
      if (grouped && child.pid != null) {
        try {
          process.kill(-child.pid, 'SIGTERM')
        } catch {
          // The process may have exited between the status check and signal.
        }
        forceKill = setTimeout(() => {
          try {
            process.kill(-child.pid!, 'SIGKILL')
          } catch {
            // The process group already exited.
          }
        }, 2000)
        forceKill.unref()
      } else {
        child.kill('SIGTERM')
      }
    }
    opts.signal?.addEventListener('abort', abort, { once: true })
    child.on('error', (e) => {
      if (forceKill) clearTimeout(forceKill)
      opts.signal?.removeEventListener('abort', abort)
      reject(new ToolError(opts.signal?.aborted ? 'Operation cancelled' : `${cmd} failed to start: ${e.message}`))
    })
    child.on('close', (code) => {
      if (forceKill) clearTimeout(forceKill)
      opts.signal?.removeEventListener('abort', abort)
      if (opts.signal?.aborted) reject(new ToolError('Operation cancelled'))
      else if (code === 0) resolve(out)
      else reject(new ToolError(`${cmd} exited with ${code}: ${err.trim().split('\n').slice(-3).join(' | ')}`))
    })
  })
}
