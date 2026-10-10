// Zero-dependency Tauri IPC bridge. In the desktop app (Tauri v2) this calls
// native Rust commands; in `npm run dev` web mode every command returns a
// graceful web fallback so the whole app still runs and is testable.

type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>

function findInvoke(): TauriInvoke | null {
  const w = window as unknown as Record<string, any>
  // Tauri v2 runtime injection (always present in the webview)
  if (w.__TAURI_INTERNALS__?.invoke) return w.__TAURI_INTERNALS__.invoke
  if (w.__TAURI__?.core?.invoke) return w.__TAURI__.core.invoke
  if (typeof w.__TAURI__?.invoke === 'function') return w.__TAURI__.invoke
  return null
}

let invokeFn: TauriInvoke | null | undefined

export function isTauri(): boolean {
  if (invokeFn === undefined) invokeFn = findInvoke()
  return invokeFn !== null
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (invokeFn === undefined) invokeFn = findInvoke()
  if (!invokeFn) throw new Error(`tauri-unavailable:${cmd}`)
  return (await invokeFn(cmd, args)) as T
}

export async function tryInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    return await invoke<T>(cmd, args)
  } catch {
    return null
  }
}

export async function listen(event: string, handler: (payload: unknown) => void): Promise<() => void> {
  const w = window as unknown as Record<string, any>
  const tauriListen = w.__TAURI__?.event?.listen
  if (tauriListen) {
    // Tauri native events (e.g. native-exited from the Rust supervisor)
    const un = await tauriListen(event, (e: { payload: unknown }) => handler(e.payload))
    return () => {
      void un()
    }
  }
  // web mode: our own code dispatches DOM events
  const wrapped = (e: Event) => {
    handler((e as CustomEvent).detail)
  }
  window.addEventListener(`meshplay:${event}`, wrapped)
  return () => window.removeEventListener(`meshplay:${event}`, wrapped)
}

/** Emit an app-level event — in web mode dispatches on window; in Tauri the Rust side uses app.emit. */
export function emitLocal(event: string, payload: unknown): void {
  window.dispatchEvent(new CustomEvent(`meshplay:${event}`, { detail: payload }))
}
