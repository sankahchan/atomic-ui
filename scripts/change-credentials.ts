
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import readline from 'readline';

const prisma = new PrismaClient();
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (question: string): Promise<string> => {
    return new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer));
    });
};

async function main() {
    console.log('🔐 Atomic-UI Credential Manager');
    console.log('===============================\n');

    try {
        // 1. Identify User
        const users = await prisma.user.findMany();

        if (users.length === 0) {
            console.error('❌ No users found in database. Run "npm run setup" first.');
            process.exit(1);
        }

        let targetUser = users[0]; // Default to first user if only one exists

        if (users.length > 1) {
            console.log('Found multiple users:');
            users.forEach((u, i) => console.log(`${i + 1}) ${u.email} (${u.role})`));

            const choice = await ask('\nSelect user number [1]: ');
            const index = choice ? parseInt(choice) - 1 : 0;

            if (index >= 0 && index < users.length) {
                targetUser = users[index];
            } else {
                console.error('❌ Invalid selection.');
                process.exit(1);
            }
        }

        console.log(`\nModifying user: ${targetUser.email}`);
        console.log('Leave blank to keep current value.\n');

        // 2. New Credentials
        const newUsername = await ask(`New Username [${targetUser.email}]: `);
        const newPassword = await ask('New Password: ');

        const updates: any = {};

        // 3. Process Username Change
        if (newUsername.trim() && newUsername !== targetUser.email) {
            // Check for conflict
            const conflict = await prisma.user.findUnique({ where: { email: newUsername } });
            if (conflict) {
                console.error(`❌ Username "${newUsername}" is already taken.`);
                process.exit(1);
            }
            updates.email = newUsername;
        }

        // 4. Process Password Change
        if (newPassword.trim()) {
            if (newPassword.length < 6) {
                console.error('❌ Password must be at least 6 characters.');
                process.exit(1);
            }
            updates.passwordHash = await bcrypt.hash(newPassword, 12);
        }

        // 5. Apply Updates
        if (Object.keys(updates).length > 0) {
            await prisma.user.update({
                where: { id: targetUser.id },
                data: updates,
            });

            // Invalidate sessions if password changed (or critical username change)
            await prisma.session.deleteMany({ where: { userId: targetUser.id } });

            console.log('\n✅ Credentials updated successfully!');
            if (updates.email) console.log(`   New Username: ${updates.email}`);
            if (updates.passwordHash) console.log(`   New Password: [Set]`);
            console.log('   All active sessions have been logged out.');

        } else {
            console.log('\nNo changes made.');
        }

    } catch (e) {
        console.error('\n❌ Error:', e);
    } finally {
        rl.close();
        await prisma.$disconnect();
    }
}

main();
