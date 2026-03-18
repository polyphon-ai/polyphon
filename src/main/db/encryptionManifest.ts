/**
 * Canonical manifest of encrypted database fields.
 * This object is the single source of truth for which columns are encrypted.
 * The manifest test (encryption.manifest.test.ts) asserts that every field listed
 * here is written as ciphertext (ENC:v1:…) and not as plaintext.
 *
 * Encryption scope:
 *   Encrypted: message bodies, conductor profile (name/pronouns/context/avatar),
 *   custom provider base URLs, system prompt template content, and per-voice
 *   system prompts and CLI args.
 *
 *   NOT encrypted (conscious choice): structural metadata such as composition names,
 *   session names, voice display names, custom provider names/slugs/default-models,
 *   template names, and tone names. These fields reveal activity patterns and personal
 *   labeling but do not contain message content, credentials, or direct PII. Encrypting
 *   them would require re-keying every row on password change and would make SQLite-level
 *   debugging and migrations significantly harder. If full metadata encryption becomes a
 *   requirement, consider whole-database encryption (SQLCipher) as a cleaner alternative
 *   to extending the field-level manifest.
 */
export const ENCRYPTED_FIELDS = {
  messages: ['content'],
  user_profile: ['conductor_name', 'pronouns', 'conductor_context', 'conductor_avatar'],
  custom_providers: ['base_url'],
  system_prompt_templates: ['content'],
  composition_voices: ['system_prompt', 'cli_args'],
  // provider_configs.cli_args is intentionally NOT encrypted. The column stores
  // standard CLI flag strings (e.g. "--model gpt-4o") for built-in provider
  // settings, not user-supplied content or credentials. Users who need to pass
  // a secret as a CLI arg should use the composition_voices.cli_args column
  // (which IS encrypted) rather than the global provider config.
} as const satisfies Record<string, readonly string[]>;
