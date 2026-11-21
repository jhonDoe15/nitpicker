import { createReactRuleTester, filename } from '../test-support/tester.mts';
import { rule } from './react-no-leaked-effect-resource.mts';

const tester = createReactRuleTester();

function inPanel(body: string, extra = '') {
  return `import { useEffect, useLayoutEffect, useRef } from 'react';
${extra}
export function Panel({ url, onMessage, node }) {
  const socketRef = useRef(null);
  ${body}
  return <div />;
}`;
}

function closed(body: string, resource: string, close: string, extra?: string) {
  return {
    filename,
    code: inPanel(body, extra),
    errors: [{ messageId: 'neverClosed' as const, data: { resource, close } }],
  };
}

function looping(body: string) {
  return { filename, code: inPanel(body), errors: [{ messageId: 'endlessFrameLoop' as const }] };
}

tester.run('react-no-leaked-effect-resource', rule, {
  valid: [
    'useEffect(() => { const socket = new WebSocket(url); socket.onmessage = onMessage; return () => { socket.close(); }; }, [url]);',
    'useEffect(() => { const socket = new WebSocket(url); return () => socket.close(); }, [url]);',
    'useEffect(() => { const socket = new WebSocket(url); socketRef.current = socket; }, [url]);',
    'useEffect(() => { socketRef.current = new WebSocket(url); }, [url]);',
    'useEffect(() => { const socket = new WebSocket(url); register(socket); }, [url]);',
    'useEffect(() => { const socket = new WebSocket(url); return () => { release(socket); }; }, [url]);',
    'useEffect(() => { const worker = new Worker(url); worker.onmessage = () => { worker.terminate(); }; }, [url]);',
    'useEffect(() => { const worker = new SharedWorker(url); return () => { worker.port.close(); }; }, [url]);',
    'useEffect(() => { const observer = new MutationObserver(onMessage); observer.observe(node); return () => observer.disconnect(); }, [node]);',
    'useEffect(() => { const connect = () => { const socket = new WebSocket(url); socket.onmessage = onMessage; }; connect(); }, [url]);',
    'useEffect(() => { button.onclick = () => { const channel = new BroadcastChannel("auth"); channel.postMessage("out"); }; }, []);',
    'useEffect(() => { new WebSocket(url).close(); }, [url]);',
    'useEffect(() => { const socket = new WebSocket(url); socket["close"](); }, [url]);',
    'useEffect(() => { const socket = new WebSocket(url); const key = "close"; return () => socket[key](); }, [url]);',
    'useEffect(() => { const socket = new WebSocket(url); return () => socket?.close(); }, [url]);',
    'useEffect(() => { const id = navigator.geolocation.watchPosition(onMessage); return () => { navigator.geolocation.clearWatch(id); }; }, []);',
    'useEffect(() => { const id = navigator.geolocation.watchPosition(onMessage); socketRef.current = id; }, []);',
    'useEffect(() => { navigator.geolocation.getCurrentPosition(onMessage); }, []);',
    'useEffect(() => { const frame = requestAnimationFrame(() => { onMessage(1); }); return () => cancelAnimationFrame(frame); }, []);',
    'useEffect(() => { requestAnimationFrame(() => { onMessage(1); }); }, []);',
    'useEffect(() => { let frame = 0; const tick = () => { onMessage(1); frame = requestAnimationFrame(tick); }; frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame); }, []);',
    'useEffect(() => { let active = true; const tick = () => { if (!active) { return; } onMessage(1); requestAnimationFrame(tick); }; tick(); return () => { active = false; }; }, []);',
    'useEffect(() => { const tick = () => { onMessage(1); if (node.offsetTop < 10) { requestAnimationFrame(tick); } }; requestAnimationFrame(tick); }, []);',
    'useEffect(() => { requestAnimationFrame(tick); }, []);',
    'function attach() { const socket = new WebSocket(url); socket.onmessage = onMessage; }',
    'useOther(() => { const socket = new WebSocket(url); socket.onmessage = onMessage; }, [url]);',
    'useEffect(() => { const socket = new Connection(url); socket.onmessage = onMessage; }, [url]);',
  ]
    .map((body) => ({ filename, code: inPanel(body) }))
    .concat([
      {
        filename,
        code: inPanel(
          'useEffect(() => { const socket = new WebSocket(url); socket.onmessage = onMessage; }, [url]);',
          "import { WebSocket } from './fake-socket';",
        ),
      },
      {
        filename,
        code: inPanel(
          'useEffect(() => { const socket = new WebSocket(url); socket.onmessage = onMessage; }, []);',
          "import { createRoot } from 'react-dom/client';\ncreateRoot(document.body).render(<Panel />);",
        ),
      },
      {
        filename,
        code: inPanel(
          'useEffect(() => { const socket = new WebSocket(url); socket.onmessage = onMessage; }, []);',
          "import { hydrateRoot } from 'react-dom/client';\nhydrateRoot(document.body, <Panel />);",
        ),
      },
      {
        filename,
        code: inPanel(
          'useEffect(() => { const socket = new WebSocket(url); socket.onmessage = onMessage; }, []);',
          "import ReactDOM from 'react-dom';\nReactDOM.render(<Panel />, document.body);",
        ),
      },
      {
        filename,
        code: inPanel(
          'useEffect(() => { const socket = new WebSocket(url); socket.onmessage = onMessage; }, []);',
          "import { AppRegistry } from 'react-native';\nAppRegistry.registerComponent('app', () => Panel);",
        ),
      },
    ]),
  invalid: [
    closed(
      'useEffect(() => { const socket = new WebSocket(url); socket.onmessage = (event) => onMessage(event.data); }, [url, onMessage]);',
      'new WebSocket(...)',
      'handle.close()',
    ),
    closed(
      'useEffect(() => { const socket = new WebSocket(url); socket.onmessage = onMessage; return () => { onMessage(null); }; }, [url]);',
      'new WebSocket(...)',
      'handle.close()',
    ),
    closed(
      'useLayoutEffect(() => { const source = new window.EventSource(url); source.addEventListener("message", onMessage); }, [url]);',
      'new EventSource(...)',
      'handle.close()',
    ),
    closed(
      'useEffect(() => { new MutationObserver(onMessage).observe(node, { childList: true }); }, [node]);',
      'new MutationObserver(...)',
      'handle.disconnect()',
    ),
    closed(
      'useEffect(() => { const worker = new Worker(url); worker.postMessage(1); worker.onmessage = onMessage; }, [url]);',
      'new Worker(...)',
      'handle.terminate()',
    ),
    closed(
      'useEffect(() => { const channel = new BroadcastChannel("auth"); channel.onmessage = onMessage; }, []);',
      'new BroadcastChannel(...)',
      'handle.close()',
    ),
    closed(
      'useEffect(() => { const socket = new WebSocket(url); socket.onmessage = onMessage; }, []);',
      'new WebSocket(...)',
      'handle.close()',
    ),
    closed(
      'useEffect(() => { navigator.geolocation.watchPosition(onMessage); }, []);',
      'navigator.geolocation.watchPosition(...)',
      'navigator.geolocation.clearWatch(id)',
    ),
    closed(
      'useEffect(() => { const id = window.navigator.geolocation.watchPosition(onMessage); }, []);',
      'navigator.geolocation.watchPosition(...)',
      'navigator.geolocation.clearWatch(id)',
    ),
    closed(
      'useEffect(() => { const observer = new PerformanceObserver(onMessage); observer.observe({ type: "paint" }); }, []);',
      'new PerformanceObserver(...)',
      'handle.disconnect()',
    ),
    closed(
      'useEffect(() => { const observer = new globalThis.ReportingObserver(onMessage); observer.observe(); }, []);',
      'new ReportingObserver(...)',
      'handle.disconnect()',
    ),
    closed(
      'useEffect(() => { navigator.geolocation?.watchPosition(onMessage); }, []);',
      'navigator.geolocation.watchPosition(...)',
      'navigator.geolocation.clearWatch(id)',
    ),
    looping(
      'useEffect(() => { const tick = () => { onMessage(1); requestAnimationFrame(tick); }; tick(); tick(); }, []);',
    ),
    looping(
      'useEffect(() => { const tick = () => { onMessage(performance.now()); requestAnimationFrame(tick); }; requestAnimationFrame(tick); }, []);',
    ),
    looping(
      'useEffect(() => { function tick() { onMessage(1); window.requestAnimationFrame(tick); } tick(); return () => { onMessage(null); }; }, []);',
    ),
  ],
});
