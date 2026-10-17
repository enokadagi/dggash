// AWIK NET — production first-run bootstrap.
//
// The development seed (`seed.js`) creates a demo admin with a known password
// and demo settings, so it must never run in production. This script is the
// production equivalent: it creates a single administrator from environment
// variables, and only when there is no active administrator yet.
//
// It is a no-op on every subsequent start, which makes it safe to leave wired
// into the container entrypoint.
//
// `User.phone` is NOT NULL and unique in the schema, so a phone number is
// always required; the email is optional but, when set, also works as a login
// identifier.
const { PrismaClient, UserRole } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
  const phone = (process.env.BOOTSTRAP_ADMIN_PHONE || '').trim();
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const firstName = (process.env.BOOTSTRAP_ADMIN_FIRST_NAME || 'System').trim();
  const lastName = (process.env.BOOTSTRAP_ADMIN_LAST_NAME || 'Administrator').trim();
  const force = process.env.BOOTSTRAP_FORCE === 'true';

  if (!password) {
    // Not configured: nothing to do. This is the normal case after first run.
    console.log('[bootstrap] BOOTSTRAP_ADMIN_PASSWORD not set; skipping admin bootstrap.');
    return;
  }

  if (password.length < 12) {
    throw new Error('[bootstrap] BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.');
  }

  if (!phone) {
    throw new Error('[bootstrap] BOOTSTRAP_ADMIN_PHONE is required (E.164, e.g. +96170000000).');
  }

  if (!/^\+[1-9]\d{1,14}$/.test(phone)) {
    throw new Error('[bootstrap] BOOTSTRAP_ADMIN_PHONE must be in E.164 format, e.g. +96170000000.');
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new Error('[bootstrap] BOOTSTRAP_ADMIN_EMAIL is not a valid email address.');
  }

  const existingAdmin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN, status: 'ACTIVE', deletedAt: null },
    select: { id: true, email: true, phone: true },
  });

  if (existingAdmin && !force) {
    console.log(
      `[bootstrap] An active administrator already exists (${existingAdmin.email || existingAdmin.phone}); skipping.`,
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Match on the unique phone first, then email, so re-running with the same
  // identity updates in place rather than creating a duplicate.
  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user && email) {
    user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
  }

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        role: UserRole.ADMIN,
        status: 'ACTIVE',
        deletedAt: null,
        phone,
        firstName,
        lastName,
        ...(email ? { email } : {}),
      },
    });
    console.log(`[bootstrap] Administrator updated: ${email || phone}`);
  } else {
    await prisma.user.create({
      data: {
        phone,
        firstName,
        lastName,
        passwordHash,
        role: UserRole.ADMIN,
        status: 'ACTIVE',
        ...(email ? { email } : {}),
      },
    });
    console.log(`[bootstrap] Administrator created: ${email || phone}`);
  }

  console.log('[bootstrap] Remove BOOTSTRAP_ADMIN_PASSWORD from the environment now.');
}

main()
  .catch((err) => {
    console.error('[bootstrap] Failed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
