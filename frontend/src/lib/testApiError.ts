import { ApiError } from './api'

/**
 * An `ApiError` a test can actually read the status off.
 *
 * `vi.mock('../lib/api')` is an automock: it keeps the class — so
 * `instanceof ApiError` still passes and the branch under test is entered —
 * but stubs the constructor body, leaving `status` **undefined**. Anything
 * reading it then sees `undefined`, and an assertion about a 404 or a 500
 * passes or fails for a reason that has nothing to do with the status.
 *
 * That has now cost this codebase four tests that passed against broken code,
 * or asserted a control for a status they never set. Constructing them here is
 * what makes the fifth impossible rather than merely unlikely.
 */
export function apiError(status: number, detail = 'boom'): ApiError {
  const err = new ApiError(status, detail)
  err.status = status
  return err
}
