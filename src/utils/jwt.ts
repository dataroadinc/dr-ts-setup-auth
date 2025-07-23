// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function decodeJWT(token: string): { [key: string]: any } | undefined {
  try {
    const base64Payload = token.split(".")[1] // Extract the middle part of the JWT
    const decodedPayload = Buffer.from(base64Payload, "base64").toString(
      "utf-8"
    )
    return JSON.parse(decodedPayload)
  } catch (error) {
    console.error("Failed to decode JWT:", error)
    return undefined
  }
}

/**
 * Generate a random secret for OAuth client
 */
export function generateRandomSecret(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
  let result = ""
  const length = 32

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }

  return result
}
