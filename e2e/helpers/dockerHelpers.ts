import { execSync, spawnSync, spawn } from 'child_process';
import type { ChildProcess } from 'child_process';

export const OLLAMA_CONTAINER = 'polyphon-e2e-ollama';
export const OLLAMA_IMAGE = 'ollama/ollama:0.6.5';
export const OLLAMA_PORT = 11434;
export const OLLAMA_BASE_URL = `http://localhost:${OLLAMA_PORT}/v1`;
export const OLLAMA_MODEL = 'qwen2.5:0.5b';
export const OLLAMA_VOLUME = 'polyphon-e2e-ollama-models';

// Tracks a native `ollama serve` process we started ourselves so we can stop it after tests.
// If Ollama was already running before the tests, we leave it running.
let nativeOllamaProcess: ChildProcess | null = null;

function run(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }).trim();
}

function isDockerAvailable(): boolean {
  const result = spawnSync('docker', ['info'], { encoding: 'utf8', stdio: 'pipe' });
  return result.status === 0;
}

function isContainerRunning(name: string): boolean {
  try {
    const out = run(`docker inspect --format '{{.State.Running}}' ${name}`);
    return out.trim() === 'true';
  } catch {
    return false;
  }
}

function isNativeOllamaInstalled(): boolean {
  const result = spawnSync('which', ['ollama'], { encoding: 'utf8', stdio: 'pipe' });
  return result.status === 0;
}

async function isOllamaApiReady(): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${OLLAMA_PORT}/`);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForOllamaReady(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isOllamaApiReady()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Ollama did not become ready in time');
}

// ── Native Ollama (Metal GPU on macOS) ────────────────────────────────────────

async function startNativeOllama(): Promise<void> {
  if (await isOllamaApiReady()) {
    // Already running (e.g. brew service or the macOS app) — just pull the model
    console.log('Native Ollama already running, pulling model...');
    execSync(`ollama pull ${OLLAMA_MODEL}`, { stdio: 'inherit' });
    return;
  }

  console.log('Starting native Ollama (Metal GPU)...');
  nativeOllamaProcess = spawn('ollama', ['serve'], {
    detached: false,
    stdio: 'ignore',
  });

  await waitForOllamaReady();
  console.log('Pulling model...');
  execSync(`ollama pull ${OLLAMA_MODEL}`, { stdio: 'inherit' });
}

async function stopNativeOllama(): Promise<void> {
  if (nativeOllamaProcess) {
    nativeOllamaProcess.kill();
    nativeOllamaProcess = null;
  }
  // If Ollama was already running before we started, leave it running
}

// ── Docker Ollama (CPU fallback) ──────────────────────────────────────────────

async function startDockerOllama(): Promise<void> {
  if (!isDockerAvailable()) {
    throw new Error(
      'Neither native Ollama nor Docker is available.\n' +
      'Install Ollama (https://ollama.com) for Metal GPU acceleration, or install Docker Desktop.',
    );
  }

  if (isContainerRunning(OLLAMA_CONTAINER)) {
    return;
  }

  try { run(`docker rm -f ${OLLAMA_CONTAINER}`); } catch { /* not running */ }

  console.log('Starting Docker Ollama (CPU — install native Ollama for Metal GPU)...');
  run(
    `docker run -d --name ${OLLAMA_CONTAINER} ` +
    `--cpus=4 ` +
    `-p ${OLLAMA_PORT}:${OLLAMA_PORT} ` +
    `-v ${OLLAMA_VOLUME}:/root/.ollama ` +
    `${OLLAMA_IMAGE}`,
  );

  await waitForOllamaReady();
  run(`docker exec ${OLLAMA_CONTAINER} ollama pull ${OLLAMA_MODEL}`);
}

async function stopDockerOllama(): Promise<void> {
  try {
    run(`docker stop ${OLLAMA_CONTAINER}`);
    run(`docker rm ${OLLAMA_CONTAINER}`);
  } catch { /* ignore */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function startOllama(): Promise<void> {
  if (isNativeOllamaInstalled()) {
    await startNativeOllama();
  } else {
    await startDockerOllama();
  }
}

export async function stopOllama(): Promise<void> {
  if (isNativeOllamaInstalled()) {
    await stopNativeOllama();
  } else {
    await stopDockerOllama();
  }
}

export function isOllamaRunning(): boolean {
  return isContainerRunning(OLLAMA_CONTAINER);
}
