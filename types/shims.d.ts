/**
 * Temporary shims to allow TypeScript to compile without installed type packages.
 * Remove after installing real type packages (pnpm install).
 */

/* Next.js modules */
declare module 'next/server' {
  export const NextResponse: any;
  export type NextRequest = any;
}
declare module 'next/navigation' {
  export const useRouter: any;
}
declare module 'next/headers' {
  export const cookies: any;
}

/* Supabase SSR/SDK */
declare module '@supabase/ssr' {
  export const createBrowserClient: any;
  export const createServerClient: any;
}
declare module '@supabase/supabase-js' {
  export type User = any;
}

/* Common UI/utility libs */
declare module 'lucide-react' {
  export const Upload: any;
  export const Plus: any;
  export const Calendar: any;
  export const Edit: any;
  export const Trash2: any;
  export const Users: any;
  export const Play: any;
  export const Phone: any;
  export const Clock: any;
  export const Search: any;
}
declare module 'date-fns' {
  export const format: any;
}

/* Minimal React typings with proper SetStateAction so functional updates type-check */
declare module 'react' {
  export type ReactNode = any;

  export type SetStateAction<S> = S | ((prevState: S) => S);
  export type Dispatch<A> = (value: A) => void;

  export function useState<S = any>(
    initialState?: S | (() => S)
  ): [S, Dispatch<SetStateAction<S>>];

  export function useEffect(
    effect: (...args: any[]) => any,
    deps?: any[]
  ): void;

  export function useMemo<T = any>(
    factory: () => T,
    deps?: any[]
  ): T;

  export interface MutableRefObject<T> {
    current: T;
  }
  export function useRef<T = any>(initialValue: T | null): MutableRefObject<T | null>;

  export interface ChangeEvent<T = any> {
    target: any;
  }

  const React: any;
  export default React;
}

/* JSX namespace so TS understands JSX elements exist */
declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
  interface ElementAttributesProperty {
    props: any;
  }
  interface ElementChildrenAttribute {
    children: any;
  }
}