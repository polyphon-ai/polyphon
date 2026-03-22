**What's New**
- The local database is now encrypted at the whole-database level using SQLCipher AES-256. Every byte on disk — messages, sessions, compositions, API configs, and settings — is ciphertext, not just selected fields.

**Improved**
- Replaced the previous field-level AES-256-GCM encryption with SQLCipher whole-database encryption. Indexes, metadata, and all table data are now encrypted uniformly, removing the distinction between "encrypted" and "unencrypted" columns.

**⚠️ Data Migration Notice**
- On first launch, Polyphon detects any existing unencrypted database from a prior version and replaces it with a fresh encrypted one. **Existing conversation history will not be carried over.** Back up your data directory before upgrading if you want to preserve it.
