import { describe, expect, test } from 'vitest'
import { ApiError } from './api'
import { isNetworkError } from './networkError'

describe('isNetworkError', () => {
  test('returns true for TypeError', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
  })

  test('returns false for ApiError', () => {
    expect(isNetworkError(new ApiError(404, 'Not Found'))).toBe(false)
  })

  test('returns false for plain Error', () => {
    expect(isNetworkError(new Error('something'))).toBe(false)
  })

  test('returns false for null', () => {
    expect(isNetworkError(null)).toBe(false)
  })
})
