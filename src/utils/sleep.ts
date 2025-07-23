/**
 * Utility function to pause execution for a specified duration
 * @param ms Duration to sleep in milliseconds
 * @returns Promise that resolves after the specified duration
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Waits for a condition (e.g., IAM propagation) to succeed, retrying until timeout.
 * @param checkFn An async function that returns true if the condition is met, false otherwise (or throws for fatal errors)
 * @param options.timeoutMs Maximum time to wait in milliseconds (default: 30000)
 * @param options.intervalMs Time between retries in milliseconds (default: 2000)
 * @param options.description Optional description for logging
 * @throws Error if the condition is not met within the timeout
 */
export async function waitForIamPropagation(
  checkFn: () => Promise<boolean>,
  options?: { timeoutMs?: number; intervalMs?: number; description?: string }
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 30000
  const intervalMs = options?.intervalMs ?? 2000
  const description = options?.description ?? "IAM propagation"
  const start = Date.now()
  let firstWait = true
  while (Date.now() - start < timeoutMs) {
    if (await checkFn()) {
      return
    }
    if (firstWait) {
      console.log(`Waiting for ${description} to propagate...`)
      firstWait = false
    }
    await sleep(intervalMs)
  }
  throw new Error(
    `Timed out after ${timeoutMs / 1000}s waiting for ${description} to propagate.`
  )
}
