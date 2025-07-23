import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { register } from "tsconfig-paths"

const __dirname = dirname(fileURLToPath(import.meta.url))

// Calculate the base URL from the path of the compiled file (in dist)
const baseUrl = resolve(__dirname, "..")

// Register the path aliases with tsconfig-paths
register({
  baseUrl,
  paths: {
    "@/commands/*": ["commands/*"],
    "@/providers/*": ["providers/*"],
    "@/constants/*": ["constants/*"],
    "@/utils/*": ["utils/*"],
    "@/types/*": ["types/*"],
  },
})
