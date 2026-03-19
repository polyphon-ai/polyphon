/**
 * Branded type for encrypted database column values.
 * The `EncryptedField` type makes it a TypeScript compile error to assign a plain
 * `string` to an encrypted column or pass an `EncryptedField` where a plain `string`
 * is expected. Only `encryptField()` can produce an `EncryptedField`; only
 * `decryptField()` can consume one.
 */
export type EncryptedField = string & { readonly __encrypted: unique symbol };

export {
  DECRYPTION_FAILED_SENTINEL,
  initFieldEncryption,
  _resetForTests,
} from '../security/fieldEncryption';

import {
  encryptField as _encryptField,
  decryptField as _decryptField,
} from '../security/fieldEncryption';

export function encryptField(value: string): EncryptedField {
  return _encryptField(value) as EncryptedField;
}

export function decryptField(value: EncryptedField | null): string | null {
  return _decryptField(value);
}
