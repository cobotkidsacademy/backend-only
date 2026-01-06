/**
 * Configuration Diagnostic Utility
 * Run this to check if all required environment variables are set
 * Usage: npx ts-node src/database/config-check.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import * as fs from 'fs';

// Try to load .env file
const envPath = resolve(process.cwd(), '.env');
config({ path: envPath });

console.log('🔍 Configuration Diagnostic Tool\n');
console.log('=' .repeat(50));

// Check required variables
const requiredVars = {
  'SUPABASE_URL': process.env.SUPABASE_URL,
  'SUPABASE_SERVICE_ROLE_KEY': process.env.SUPABASE_SERVICE_ROLE_KEY,
  'JWT_SECRET': process.env.JWT_SECRET,
  'PORT': process.env.PORT || '3001',
  'NODE_ENV': process.env.NODE_ENV || 'development',
};

console.log('\n📋 Environment Variables Status:');
console.log('-'.repeat(50));

let allPresent = true;
for (const [key, value] of Object.entries(requiredVars)) {
  const isPresent = !!value;
  const status = isPresent ? '✅' : '❌';
  const displayValue = isPresent 
    ? (key.includes('KEY') || key.includes('SECRET') 
        ? `${value.substring(0, 10)}...` 
        : value)
    : 'NOT SET';
  
  console.log(`${status} ${key.padEnd(30)} ${displayValue}`);
  if (!isPresent && (key === 'SUPABASE_URL' || key === 'SUPABASE_SERVICE_ROLE_KEY')) {
    allPresent = false;
  }
}

console.log('\n' + '='.repeat(50));
console.log(`\n📁 Looking for .env file at: ${envPath}`);
const envExists = fs.existsSync(envPath);
console.log(`${envExists ? '✅' : '❌'} .env file ${envExists ? 'found' : 'NOT found'}`);

console.log(`\n📂 Current working directory: ${process.cwd()}`);
console.log(`\n🐳 Running in Docker: ${fs.existsSync('/.dockerenv') ? 'Yes' : 'No'}`);

if (!allPresent) {
  console.log('\n❌ ERROR: Missing required Supabase configuration!');
  console.log('\n💡 Solution:');
  console.log('   1. Create a .env file in the backend directory');
  console.log('   2. Copy env.example.txt to .env');
  console.log('   3. Fill in your Supabase credentials');
  console.log('\n   Or set environment variables directly:');
  console.log('   export SUPABASE_URL=your_url');
  console.log('   export SUPABASE_SERVICE_ROLE_KEY=your_key');
  process.exit(1);
} else {
  console.log('\n✅ All required configuration variables are present!');
  process.exit(0);
}

