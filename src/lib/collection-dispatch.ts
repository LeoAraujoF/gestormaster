export type RetryableDispatchStatus = 'retryable' | 'failed'

export function dispatchFailureStatus(attemptsMade: number, configuredAttempts: number | undefined): RetryableDispatchStatus {
  const totalAttempts = Math.max(1, Number(configuredAttempts || 1))
  return attemptsMade + 1 >= totalAttempts ? 'failed' : 'retryable'
}
