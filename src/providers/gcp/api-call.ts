import { SetupAuthError } from "@/utils/error.js"
import axios from "axios"
import { gcpGetAuthorizationHeader } from "./auth.js"

/**
 * Make HTTP requests to GCP APIs
 */
export async function gcpCallAPI(
  url: string,
  method: string,
  data?: unknown
): Promise<unknown> {
  try {
    const response = await axios({
      url,
      method,
      data,
      headers: {
        Authorization: await gcpGetAuthorizationHeader(),
        "Content-Type": "application/json",
      },
    })

    return response.data
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      // Clean up error message to avoid showing HTML in 404 responses
      const statusCode = error.response.status
      const statusText = error.response.statusText
      let errorDetail = ""

      // For 404 errors, just show a simple message without the HTML body
      if (statusCode === 404) {
        errorDetail = `Resource not found at ${url}`
      } else if (error.response.data) {
        // Handle different error response formats
        if (typeof error.response.data === "string") {
          if (error.response.data.includes("<!DOCTYPE html>")) {
            errorDetail = "HTML error page returned"
          } else {
            errorDetail = error.response.data
          }
        } else if (typeof error.response.data === "object") {
          // Extract useful error information from GCP API response
          const errorData = error.response.data
          if (errorData.error) {
            if (typeof errorData.error === "string") {
              errorDetail = errorData.error
            } else {
              errorDetail = JSON.stringify(
                {
                  message: errorData.error.message,
                  status: errorData.error.status,
                  code: errorData.error.code,
                  details: errorData.error.details,
                },
                null,
                2
              )
            }
          } else {
            errorDetail = JSON.stringify(errorData, null, 2)
          }
        }
      }

      // Check if it's the ALREADY_EXISTS error before logging details
      const responseData = error.response?.data as unknown
      const isAlreadyExists =
        statusCode === 409 && responseData?.error?.status === "ALREADY_EXISTS"

      if (!isAlreadyExists) {
        console.error(
          `GCP API Error Details:\nURL: ${url}\nMethod: ${method}\nStatus: ${statusCode} ${statusText}\nError: ${errorDetail}\n${data ? `Request Data: ${JSON.stringify(data, null, 2)}` : ""}`
        )
      }

      // Always throw the error so the caller can handle it
      throw new SetupAuthError(
        `GCP API error: ${statusCode} ${statusText} - ${errorDetail}`,
        { cause: error }
      )
    }
    throw error
  }
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
  operation: string = "operation"
): Promise<T> {
  let retries = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastError: any

  while (retries <= maxRetries) {
    try {
      return await fn()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      lastError = error
      if (!error?.message?.includes("concurrent policy changes")) {
        throw error
      }
      if (retries === maxRetries) {
        break
      }
      retries++
      const delay = initialDelay * Math.pow(2, retries - 1)
      console.log(
        `Retrying ${operation} after ${delay}ms due to concurrent policy change (attempt ${retries}/${maxRetries})...`
      )
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw lastError
}
