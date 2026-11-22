/**
 * Safely read a message from whatever was thrown in a `catch (err)` block.
 * Returns '' when there is none, so `errMessage(err) || 'Fallback text'` works as expected.
 */
export function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return '';
}
