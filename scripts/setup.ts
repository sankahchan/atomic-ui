/**
 * Database Setup Script
 * 
 * This script initializes the database and creates the default admin user.
 * It should be run once during initial setup or when resetting the application.
 * 
 * Usage:
 *   npm run setup
 *   
 * The script will:
 * 1. Check if the database exists and create tables if needed
 * 2. Create a default admin user if none exists
 * 3. Display login credentials for first-time access
 * 
 * Environment Variables:
 * - DEFAULT_ADMIN_USERNAME: Username for the admin (default: "admin")
 * - DEFAULT_ADMIN_PASSWORD: Password for the admin (default: "admin123")
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Atomic-UI Setup Script');
  console.log('========================\n');

  // Get credentials from environment or use defaults
  const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';

  // Check if admin user exists
  console.log('📊 Checking database...');

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log(`✅ Admin user "${adminEmail}" already exists.`);
    console.log('\n💡 To change the password, run: npm run password:change');
  } else {
    // Create admin user
    console.log('👤 Creating admin user...');

    const passwordHash = await bcrypt.hash(adminPassword, 12);

    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        role: 'ADMIN',
      },
    });

    console.log('✅ Admin user created successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 Login Credentials:');
    console.log(`   Email:    ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('⚠️  Please change the password after first login!\n');
  }

  // Create default settings if they don't exist
  console.log('⚙️  Checking default settings...');

  const defaultSettings = [
    { key: 'siteName', value: '"Atomic-UI"' },
    { key: 'siteDescription', value: '"Outline VPN Management Panel"' },
    { key: 'defaultLanguage', value: '"en"' },
    { key: 'defaultTheme', value: '"dark"' },
    { key: 'enableHealthChecks', value: 'true' },
    { key: 'healthCheckIntervalMins', value: '5' },
    { key: 'enableNotifications', value: 'true' },
    { key: 'keyExpiryWarningDays', value: '3' },
    { key: 'trafficWarningPercent', value: '80' },
    { key: 'enableSubscriptionService', value: 'true' },
    { key: 'subscriptionPath', value: '"/sub"' },
  ];

  for (const setting of defaultSettings) {
    await prisma.settings.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  console.log('✅ Default settings configured.\n');

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 Setup Complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Start the application with: npm run dev\n');
  console.log('Then visit: http://localhost:3000\n');
}

main()
  .catch((e) => {
    console.error('❌ Setup failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
