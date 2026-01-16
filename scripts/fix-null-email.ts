
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔧 Checking for database integrity issues...');

    try {
        // Check for users with NULL email using raw query to bypass type safety checks
        // We expect the count to be 1 based on the error message
        const nullEmailUsers = await prisma.$queryRaw<any[]>`SELECT id FROM User WHERE email IS NULL`;

        console.log(`Found ${nullEmailUsers.length} user(s) with NULL email.`);

        if (nullEmailUsers.length > 0) {
            console.log('🛠 Fixing null emails...');

            // Update NULL emails to a random recovered address
            // SQLite syntax: 'recovered_' || lower(hex(randomblob(4)))
            const result = await prisma.$executeRaw`
        UPDATE User 
        SET email = 'recovered_' || lower(hex(randomblob(4))) 
        WHERE email IS NULL
      `;

            console.log(`✅ Fixed ${result} record(s).`);
            console.log('The invalid user now has an email like "recovered_xxxxxxxx".');
            console.log('You can now safely retry the update.');
        } else {
            console.log('✅ No integrity issues found. The database seems clean.');
        }

    } catch (e) {
        console.error('❌ Error executing fix:', e);
        console.log('Try running this script again. If it fails, you may need to reset the database.');
    } finally {
        await prisma.$disconnect();
    }
}

main();
