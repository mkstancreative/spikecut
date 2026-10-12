import { spawn } from 'node:child_process'

export class ToolError extends Error {}

/** Run a command, resolve with stdout. stderr tail is included in the error for debugging. */
type RunOpts = { cwd?: string; onStderr?: (line: string) => void; onStdout?: (line: string) => void }

export function run(cmd: string, args: string[], opts: RunOpts = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
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
    child.on('error', (e) => reject(new ToolError(`${cmd} failed to start: ${e.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve(out)
      else reject(new ToolError(`${cmd} exited with ${code}: ${err.trim().split('\n').slice(-3).join(' | ')}`))
    })
  })
}
