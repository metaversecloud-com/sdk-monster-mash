import { ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * App-wide "an action is in flight" flag. Any button that fires a server
 * request (or that would misbehave if pressed twice) should
 *   const { isBusy, run } = useBusy();
 *   <button disabled={isBusy} onClick={() => run(async () => ...)}>...
 *
 * `run` is a counter — nested / overlapping calls are tolerated; `isBusy`
 * flips false only when the LAST outstanding action resolves. This lets a
 * server call that internally triggers another server call (e.g. delete →
 * refresh) keep everything disabled until the whole sequence finishes.
 */
interface BusyContextValue {
  isBusy: boolean;
  run: <T>(fn: () => Promise<T>) => Promise<T>;
}

const noopContext: BusyContextValue = {
  isBusy: false,
  run: async (fn) => fn(),
};

const BusyContext = createContext<BusyContextValue>(noopContext);

export const BusyProvider = ({ children }: { children: ReactNode }) => {
  const [count, setCount] = useState(0);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setCount((c) => c + 1);
    try {
      return await fn();
    } finally {
      setCount((c) => c - 1);
    }
  }, []);
  const value = useMemo<BusyContextValue>(() => ({ isBusy: count > 0, run }), [count, run]);
  return <BusyContext.Provider value={value}>{children}</BusyContext.Provider>;
};

export const useBusy = (): BusyContextValue => useContext(BusyContext);
