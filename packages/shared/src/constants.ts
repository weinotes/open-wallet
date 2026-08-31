/**
 * Application-wide constants.
 */

/** Current vault encryption schema version */
export const VAULT_VERSION = 1;

/** PBKDF2 iterations for key derivation (OWASP 2023 recommendation) */
export const PBKDF2_ITERATIONS = 200_000;

/** AES key size in bytes (AES-256) */
export const AES_KEY_SIZE = 32;

/** GCM IV size in bytes */
export const GCM_IV_SIZE = 12;

/** GCM authentication tag size in bytes */
export const GCM_TAG_SIZE = 16;

/** Salt size in bytes */
export const SALT_SIZE = 16;

/** Default derivation account index */
export const DEFAULT_ACCOUNT_INDEX = 0;

/** App display name */
export const APP_NAME = 'OpenWallet';

/** Default language */
export const DEFAULT_LANGUAGE = 'en' as const;

/** Default theme */
export const DEFAULT_THEME = 'dark' as const;
