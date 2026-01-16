
import { db } from '../lib/db';
import { hashPassword } from '../lib/auth';

async function main() {
    const adminUser = await db.user.findUnique({
        where: { email: 'admin' },
    });

    if (adminUser) {
        console.log('User "admin" found:', adminUser);
    } else {
        console.log('User "admin" not found. Creating...');
        const passwordHash = await hashPassword('admin123');
        const newUser = await db.user.create({
            data: {
                email: 'admin',
                passwordHash,
                role: 'ADMIN',
            },
        });
        console.log('Created user "admin":', newUser);
    }

    // Also check for 'admin@example.com' just in case
    const emailUser = await db.user.findUnique({
        where: { email: 'admin@example.com' },
    });
    if (emailUser) {
        console.log('User "admin@example.com" also exists.');
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        // format prevents connection hang
    });
