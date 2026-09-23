// AWIK NET — Internet Service Provider
// DEVELOPMENT-ONLY seed. Creates an admin user + starter settings.
// This data is for local development / testing only and is never
// required by the production application.
const { PrismaClient, UserRole } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding AWIK NET database (development-only data)...');

  const passwordHash = await bcrypt.hash('Admin123!', 12);

  const admin = await prisma.user.upsert({
    where: { phone: '+96170000000' },
    update: {},
    create: {
      phone: '+96170000000',
      email: 'admin@awiknet.example',
      firstName: 'System',
      lastName: 'Administrator',
      passwordHash,
      role: UserRole.ADMIN,
      status: 'ACTIVE',
    },
  });
  console.log(`Admin user ready: +96170000000 / Admin123! (id: ${admin.id})`);

  const defaultSettings = [
    { key: 'company.name', value: 'AWIK NET', description: 'Company display name' },
    { key: 'company.tagline', value: 'INTERNET SERVICE PROVIDER', description: 'Company tagline' },
    { key: 'company.phone', value: '', description: 'Company phone number' },
    { key: 'company.address', value: '', description: 'Company address' },
    { key: 'company.currency', value: 'USD', description: 'Default currency' },
    { key: 'company.timezone', value: 'Asia/Beirut', description: 'Business timezone' },
    { key: 'whatsapp.reminder_5d_template', value: 'Hello {{customer_name}},\n\nYour AWIK NET internet plan will expire in {{days_remaining}} days on {{expiry_date}}.\n\nPlease visit AWIK NET or contact us to recharge/renew your internet service.\n\nPlan: {{plan_name}}\nPrice: {{price}}\n\nThank you,\n{{company_name}} — INTERNET SERVICE PROVIDER', description: '5-day expiry reminder message' },
    { key: 'whatsapp.reminder_3d_template', value: 'Hello {{customer_name}},\n\nYour AWIK NET internet plan will expire in {{days_remaining}} days on {{expiry_date}}.\n\nPlease visit AWIK NET or contact us to recharge/renew your internet service.\n\nPlan: {{plan_name}}\nPrice: {{price}}\n\nThank you,\n{{company_name}} — INTERNET SERVICE PROVIDER', description: '3-day expiry reminder message' },
    { key: 'whatsapp.reminder_1d_template', value: 'Hello {{customer_name}},\n\nYour AWIK NET internet plan expires TOMORROW on {{expiry_date}}.\n\nPlease visit AWIK NET or contact us to recharge/renew your internet service.\n\nPlan: {{plan_name}}\nPrice: {{price}}\n\nThank you,\n{{company_name}} — INTERNET SERVICE PROVIDER', description: '1-day expiry reminder message' },
    { key: 'whatsapp.reminder_expiry_template', value: 'Hello {{customer_name}},\n\nYour AWIK NET internet plan expired today ({{expiry_date}}).\n\nTo restore your internet service, please visit AWIK NET or contact us to renew.\n\nPlan: {{plan_name}}\nPrice: {{price}}\n\nThank you,\n{{company_name}} — INTERNET SERVICE PROVIDER', description: 'Expiry-day message' },
    { key: 'whatsapp.renewal_confirmation_template', value: 'Hello {{customer_name}},\n\nYour AWIK NET internet plan has been renewed.\n\nPlan: {{plan_name}}\nNew expiry date: {{expiry_date}}\n\nThank you,\n{{company_name}} — INTERNET SERVICE PROVIDER', description: 'Renewal confirmation message' },
    { key: 'reminder.offset_5d', value: '5', description: 'Days before expiry for 5-day reminder' },
    { key: 'reminder.offset_3d', value: '3', description: 'Days before expiry for 3-day reminder' },
    { key: 'reminder.offset_1d', value: '1', description: 'Days before expiry for 1-day reminder' },
    { key: 'reminder.enabled_5d', value: 'true', description: 'Send 5-day reminder' },
    { key: 'reminder.enabled_3d', value: 'true', description: 'Send 3-day reminder' },
    { key: 'reminder.enabled_1d', value: 'true', description: 'Send 1-day reminder' },
    { key: 'reminder.enabled_expiry', value: 'true', description: 'Send expiry-day message' },
    { key: 'inventory.default_min_stock', value: '5', description: 'Default minimum stock for new products' },
    { key: 'sales.require_customer', value: 'false', description: 'Whether customer is required on sales' },
  ];

  for (const s of defaultSettings) {
    await prisma.companySetting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }
  console.log(`Settings ready (${defaultSettings.length} defaults)`);

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });