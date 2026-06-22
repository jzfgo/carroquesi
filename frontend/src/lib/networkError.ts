export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError
}
