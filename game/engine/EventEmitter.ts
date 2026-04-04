// Lightweight typed event emitter — no Vue, no Node.js EventEmitter dependency.

type Handler<T> = (data: T) => void
type Unsubscribe = () => void

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class TypedEventEmitter<Events extends Record<string, any>> {
  private handlers = new Map<keyof Events, Set<Handler<unknown>>>()

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): Unsubscribe {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    const set = this.handlers.get(event)!
    set.add(handler as Handler<unknown>)
    return () => set.delete(handler as Handler<unknown>)
  }

  off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    this.handlers.get(event)?.delete(handler as Handler<unknown>)
  }

  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    this.handlers.get(event)?.forEach(h => h(data))
  }

  clear(): void {
    this.handlers.clear()
  }
}
