/**
 * Password Change Script
 * 
 * This script allows administrators to change user passwords from the
 * command line. This is useful when users forget their passwords or
 * during initial setup.
 * 
 * Usage:
 *   npm run password:change
 *   
 * The script will prompt for:
 * 1. Username
 * 2. New password
 * 3. Confirmation
 * 
 * After changing the password, all existing sessions for that user
 * will be invalidated, requiring them to log in again.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as readline from 'readline';

const prisma = new PrismaClient();

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Helper function to prompt for input
function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Helper function to prompt for password (with hidden input)
function promptPassword(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    
    let password = '';
    
    stdin.on('data', (ch: string) => {
      if (ch === '\r' || ch === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        process.stdout.write('\n');
        resolve(password);
      } else if (ch === '\u0003') {
        // Ctrl+C
        process.exit();
      } else if (ch === '\u007F') {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
          process.stdout.write(question + '*'.repeat(password.length));
        }
      } else {
        password += ch;
        process.stdout.write('*');
      }
    });
  });
}

async function main() {
  console.log('\n🔐 Atomic-UI Password Change Tool');
  console.log('==================================\n');

  try {
    // Get username
    const username = await prompt('Enter username: ');
    
    if (!username.trim()) {
      console.log('❌ Username cannot be empty.');
      process.exit(1);
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { username: username.trim() },
    });

    if (!user) {
      console.log(`❌ User "${username}" not found.`);
      process.exit(1);
    }

    console.log(`\n✅ Found user: ${user.username} (${user.role})\n`);

    // Get new password
    const newPassword = await promptPassword('Enter new password: ');
    
    if (newPassword.length < 6) {
      console.log('\n❌ Password must be at least 6 characters.');
      process.exit(1);
    }

    // Confirm password
    const confirmPassword = await promptPassword('Confirm new password: ');
    
    if (newPassword !== confirmPassword) {
      console.log('\n❌ Passwords do not match.');
      process.exit(1);
    }

    // Hash and update password
    console.log('\n⏳ Updating password...');
    
    const passwordHash = await bcrypt.hash(newPassword, 12);
    
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Invalidate all sessions for this user
    const deletedSessions = await prisma.session.deleteMany({
      where: { userId: user.id },
    });

    console.log('✅ Password updated successfully!');
    
    if (deletedSessions.count > 0) {
      console.log(`📤 ${deletedSessions.count} session(s) invalidated.`);
    }

    console.log('\n🔑 The user can now log in with the new password.\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    rl.close();
    await prisma.$disconnect();
  });
