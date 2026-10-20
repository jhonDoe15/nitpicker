import { spawn, spawnSync } from 'node:child_process';

const GRACE_MS = 500;
const REAP_MS = 1_000;

function signalGroup(child, signal, errors) {
  if (child.pid === undefined) {
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') {
      errors.set('signal', { message: error.message, code: error.code });
    }
  }
}

function forceStop(child, state, finish) {
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      timeout: REAP_MS,
    });
    if (result.error !== undefined) {
      child.kill('SIGKILL');
    }
  } else {
    signalGroup(child, 'SIGKILL', state.errors);
  }
  state.termination = setTimeout(() => {
    child.stdout.destroy();
    child.stderr.destroy();
    child.unref();
    finish(child.exitCode, child.signalCode);
  }, REAP_MS);
}

function createController(child, { command, timeout }, resolve) {
  const state = { errors: new Map(), termination: undefined, settled: false };
  const deadline = setTimeout(() => {
    terminate({ message: `spawnSync ${command} ETIMEDOUT`, code: 'ETIMEDOUT' });
  }, timeout);
  function finish(status, signal) {
    if (state.settled) {
      return;
    }
    state.settled = true;
    clearTimeout(deadline);
    clearTimeout(state.termination);
    for (const [signal, handler] of handlers) {
      process.removeListener(signal, handler);
    }
    resolve({ status, signal, error: errorOf(state.errors) });
  }
  function terminate(error) {
    if (state.errors.has('termination')) {
      return;
    }
    state.errors.set('termination', error);
    clearTimeout(deadline);
    stopTree(child, state, finish);
  }
  child.on('error', (error) => {
    state.errors.set('child', { message: `spawnSync ${command} ${error.code}`, code: error.code });
  });
  child.on('close', (status, signal) => {
    if (state.errors.has('termination') && process.platform !== 'win32') {
      signalGroup(child, 'SIGKILL', state.errors);
    }
    finish(status, signal);
  });
  const handlers = shutdownHandlers(terminate);
  return { terminate };
}

function errorOf(errors) {
  return errors.get('termination') ?? errors.get('child') ?? errors.get('signal');
}

function stopTree(child, state, finish) {
  if (process.platform === 'win32') {
    forceStop(child, state, finish);
  } else {
    signalGroup(child, 'SIGTERM', state.errors);
    state.termination = setTimeout(() => {
      forceStop(child, state, finish);
    }, GRACE_MS);
  }
}

function shutdownHandlers(terminate) {
  return ['SIGINT', 'SIGTERM'].map((signal) => {
    function handler() {
      terminate({ message: `Gradle interrupted by ${signal}`, code: 'EINTR' });
    }
    process.on(signal, handler);
    return [signal, handler];
  });
}

function collectOutput(child, maxBuffer, terminate) {
  const output = { stdout: [], stderr: [], bytes: 0 };
  function collect(stream) {
    return (chunk) => {
      output.bytes += chunk.length;
      if (output.bytes > maxBuffer) {
        terminate({ message: 'Gradle output exceeded maxBuffer (ENOBUFS)', code: 'ENOBUFS' });
        return;
      }
      output[stream].push(chunk);
    };
  }
  child.stdout.on('data', collect('stdout'));
  child.stderr.on('data', collect('stderr'));
  return output;
}

export function executeGradle({ command, args, options }) {
  const { timeout, maxBuffer, ...launchOptions } = options;
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      ...launchOptions,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const controller = createController(child, { command, timeout }, (result) => {
      resolve({
        ...result,
        stdout: Buffer.concat(output.stdout).toString('utf8'),
        stderr: Buffer.concat(output.stderr).toString('utf8'),
      });
    });
    const output = collectOutput(child, maxBuffer, controller.terminate);
  });
}
