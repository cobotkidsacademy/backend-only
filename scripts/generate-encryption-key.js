#!/usr/bin/env node

/**
 * Generate a secure encryption key for message encryption
 * 
 * Usage: node scripts/generate-encryption-key.js
 * 
 * This will generate a 64-character hex string (32 bytes) suitable for AES-256-GCM encryption.
 * Copy this value to your .env file as MESSAGE_ENCRYPTION_KEY
 */

const crypto = require('crypto');

const key = crypto.randomBytes(32).toString('hex');

console.log('\n🔐 Message Encryption Key Generated:\n');
console.log('MESSAGE_ENCRYPTION_KEY=' + key);
console.log('\n⚠️  IMPORTANT:');
console.log('1. Copy this key to your .env file');
console.log('2. Keep this key secure and never commit it to version control');
console.log('3. Use the same key across all server instances');
console.log('4. If you change this key, old messages cannot be decrypted!\n');
