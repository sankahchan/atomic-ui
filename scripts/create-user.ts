
/**
 * Create User Script
 * 
 * Helper script to create new users directly in the database.
 * Useful for creating initial client accounts.
 * 
 * Usage:
 *   npx tsx scripts/create-user.ts <email> <password> [role]
 *   
 *   role: USER (default) or ADMIN
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: npx tsx scripts/create-user.ts <email> <password> [role]');
        process.exit(1);
    }

    const [email, password, roleInput] = args;
    const role = (roleInput?.toUpperCase() === 'ADMIN') ? 'ADMIN' : 'USER';

    console.log(`Creating user: ${email} (${role})...`);

    // Check if exists
    const existing = await prisma.user.findUnique({
        where: { email },
    });

    if (existing) {
        console.error(`Error: User with email ${email} already exists.`);
        process.exit(1);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
        data: {
            email,
            passwordHash,
            role,
        },
    });

    console.log(`✅ User created successfully! ID: ${user.id}`);
}

main()
    .catch((e) => {
        console.error('❌ Failed to create user:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
