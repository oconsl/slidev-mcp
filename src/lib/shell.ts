import { spawn } from "node:child_process";

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SpawnOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
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
    let settled = false;
    let timedOut = false;
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    const timer =
      options.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
            setTimeout(() => {
              if (!settled) {
                child.kill("SIGKILL");
              }
            }, 2000).unref();
          }, options.timeoutMs)
        : undefined;

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      settled = true;
      reject(new Error(`Failed to spawn "${cmd}": ${err.message}`));
    });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      settled = true;
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      resolve({
        stdout,
        stderr: timedOut
          ? `${stderr}${stderr ? "\n" : ""}Command timed out after ${options.timeoutMs}ms.`
          : stderr,
        exitCode: code ?? 1,
      });
    });
  });
}
