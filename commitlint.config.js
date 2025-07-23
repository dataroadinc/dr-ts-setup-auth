export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "body-max-line-length": [2, "always", 200],
    // Enforce strict scope rules for dr-ts-setup-auth
    "scope-enum": [
      2,
      "always",
      [
        "cli",
        "core",
        "changelog",
        "versioning",
        "types",
        "docs",
        "deps",
        "build",
        "test",
        "ci",
        "project",
      ],
    ],
    "scope-case": [2, "always", "kebab-case"],
    "scope-empty": [2, "never"],
    "scope-max-length": [2, "always", 20],
    "scope-min-length": [2, "always", 2],
  },
}
