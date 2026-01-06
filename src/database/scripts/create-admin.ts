/**
 * Script to create an admin user in the database
 * 
 * Usage: 
 * npx ts-node src/database/scripts/create-admin.ts <email> <password>
 * 
 * Example:
 * npx ts-node src/database/scripts/create-admin.ts admin@example.com mypassword123
 */

import * as bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createAdmin(email: string, password: string) {
  try {
    // Hash the password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert admin user
    const { data, error } = await supabase
      .from('admins')
      .insert({
        email,
        password_hash: passwordHash,
        role: 'admin',
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        console.error(`Error: Admin with email ${email} already exists`);
      } else {
        console.error('Error creating admin:', error.message);
      }
      process.exit(1);
    }

    console.log('✅ Admin user created successfully!');
    console.log('Email:', data.email);
    console.log('ID:', data.id);
    console.log('Role:', data.role);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: npx ts-node create-admin.ts <email> <password>');
  process.exit(1);
}

const [email, password] = args;

if (!email || !password) {
  console.error('Error: Email and password are required');
  process.exit(1);
}

createAdmin(email, password);








