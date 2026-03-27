**What's New**
- The JavaScript SDK (`@polyphon-ai/js`) now has complete type coverage for all API methods and responses

**Fixed**
- SDK token module was missing from published package due to a `.gitignore` pattern conflict

**Improved**
- The `poly` CLI now uses the SDK source directly, keeping the CLI and SDK in sync
- A new CI workflow automatically publishes `@polyphon-ai/js` to npm on each version tag
