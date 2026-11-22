import React, { ComponentProps, ComponentType, Suspense, lazy } from 'react';

/**
 * Code-split a *named* component export.
 *
 *   const AdminPanel = lazyNamed(() => import('./components/AdminPanel.tsx'), 'AdminPanel');
 *
 * The returned component is a drop-in replacement: it has its own invisible Suspense
 * boundary, so opening a modal for the first time never blanks the rest of the app while
 * its code downloads.
 */
export function lazyNamed<M extends Record<string, unknown>, K extends keyof M & string>(
  loader: () => Promise<M>,
  name: K
) {
  type Comp = M[K] extends ComponentType<infer P> ? ComponentType<P> : never;
  const Lazy = lazy(async () => ({ default: (await loader())[name] as Comp }));
  const Wrapped = (props: ComponentProps<Comp>) => (
    <Suspense fallback={null}>
      {React.createElement(Lazy as unknown as ComponentType<Record<string, unknown>>, props as Record<string, unknown>)}
    </Suspense>
  );
  Wrapped.displayName = `Lazy(${name})`;
  return Wrapped;
}
