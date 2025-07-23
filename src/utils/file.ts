/**
 * This file contains utility functions for file operations.
 */
import { access, constants, unlink } from "node:fs/promises"

// import * as fs from 'node:fs/promises'; // Revert import

/**
 * Helper function to check if a file exists asynchronously.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  // Revert back to original implementation using fs.access
  try {
    // console.log(`fileExists: ${filePath} exists 1`); // Revert logging
    await access(filePath, constants.R_OK | constants.W_OK)
    // console.log('fileExists: ', filePath, ' exists 2'); // Revert logging
    return true
  } catch {
    return false
  }
  // Remove finally block
}

/**
 * Helper function to delete a file if it exists.
 */
export async function deleteFile(filePath: string): Promise<void> {
  if (await fileExists(filePath)) {
    await unlink(filePath)
  }
}
