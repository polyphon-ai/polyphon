/**
 * Canonical manifest of encrypted database fields.
 * This object is the single source of truth for which columns are encrypted.
 * The manifest test (encryption.manifest.test.ts) asserts that every field listed
 * here is written as ciphertext (ENC:v1:…) and not as plaintext.
 */
export const ENCRYPTED_FIELDS = {
  messages: ['content'],
  user_profile: ['conductor_name', 'pronouns', 'conductor_context'],
  custom_providers: ['base_url'],
  system_prompt_templates: ['content'],
  composition_voices: ['system_prompt', 'cli_args'],
} as const satisfies Record<string, readonly string[]>;
