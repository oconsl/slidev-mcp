import { spawn } from "node:child_process";

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SpawnOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Promisified wrapper around child_process.spawn.
 * Collects stdout and stderr, resolves with the result regardless of exit code.
 * Rejects only on spawn errors (e.g., command not found at OS level).
 */
export function spawnAsync(
  cmd: string,
  args: string[],
  options: SpawnOptions
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn "${cmd}": ${err.message}`));
    });

    child.on("close", (code) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode: code ?? 1,
      });
    });
  });
}
