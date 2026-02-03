import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create super admin (no tenant)
  const superAdminPasswordHash = await bcrypt.hash('SuperAdmin@123', 12);
  const superAdmin = await prisma.user.upsert({
    where: { id: '110e8400-e29b-41d4-a716-446655440000' },
    update: {
      passwordHash: superAdminPasswordHash,
    },
    create: {
      id: '110e8400-e29b-41d4-a716-446655440000',
      tenantId: null,
      email: 'superadmin@system.com',
      passwordHash: superAdminPasswordHash,
      fullName: 'Super Administrator',
      role: 'super_admin',
      status: 'active',
    },
  });
  console.log('Created super admin:', superAdmin.email);

  // Create default tenant with company code
  const tenant = await prisma.tenant.upsert({
    where: { id: '550e8400-e29b-41d4-a716-446655440001' },
    update: {
      code: 'EXCELL',
    },
    create: {
      id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Excellence Coaching Center',
      code: 'EXCELL',
      subdomain: 'excellence',
      status: 'active',
      settings: {
        businessHours: { start: '08:00', end: '22:00' },
        autoCheckoutTime: '23:00',
        minStayMinutes: 5,
      },
    },
  });
  console.log('Created tenant:', tenant.name, '(Code:', tenant.code, ')');

  // Create default branch
  const branch = await prisma.branch.upsert({
    where: { id: '660e8400-e29b-41d4-a716-446655440002' },
    update: {},
    create: {
      id: '660e8400-e29b-41d4-a716-446655440002',
      tenantId: tenant.id,
      name: 'Main Campus',
      address: '123 Education Street, Learning City',
      phone: '+1234567890',
      timezone: 'Asia/Kolkata',
      status: 'active',
    },
  });
  console.log('Created branch:', branch.name);

  // Create company admin user
  const adminPasswordHash = await bcrypt.hash('Admin@123456', 12);
  const admin = await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: 'admin@example.com',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@example.com',
      passwordHash: adminPasswordHash,
      fullName: 'Company Administrator',
      role: 'admin',
      status: 'active',
    },
  });
  console.log('Created company admin:', admin.email);

  // Create sample students
  const students = [
    { code: 'ST001', name: 'John Doe', pin: '1234', grade: 'Grade 10' },
    { code: 'ST002', name: 'Jane Smith', pin: '2345', grade: 'Grade 11' },
    { code: 'ST003', name: 'Bob Wilson', pin: '3456', grade: 'Grade 9' },
  ];

  for (const s of students) {
    const pinHash = await bcrypt.hash(s.pin, 12);
    const student = await prisma.student.upsert({
      where: {
        tenantId_studentCode: {
          tenantId: tenant.id,
          studentCode: s.code,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        branchId: branch.id,
        studentCode: s.code,
        fullName: s.name,
        pinHash,
        grade: s.grade,
        status: 'active',
      },
    });

    // Check if parent already exists
    const existingParent = await prisma.parent.findFirst({
      where: {
        tenantId: tenant.id,
        email: `parent.${s.code.toLowerCase()}@example.com`,
      },
    });

    if (!existingParent) {
      const parent = await prisma.parent.create({
        data: {
          tenantId: tenant.id,
          fullName: `Parent of ${s.name}`,
          phone: `+123456789${s.code.slice(-1)}`,
          email: `parent.${s.code.toLowerCase()}@example.com`,
          notificationEnabled: true,
        },
      });

      await prisma.studentParent.create({
        data: {
          studentId: student.id,
          parentId: parent.id,
          relationship: 'guardian',
          isPrimary: true,
        },
      });
      console.log('Created student:', student.studentCode, 'with parent');
    } else {
      console.log('Student already exists:', student.studentCode);
    }
  }

  console.log('\n========================================');
  console.log('Seeding completed!');
  console.log('========================================\n');
  console.log('Login Credentials:');
  console.log('------------------');
  console.log('Super Admin:');
  console.log('  Company Code: (leave empty or SUPERADMIN)');
  console.log('  Email: superadmin@system.com');
  console.log('  Password: SuperAdmin@123');
  console.log('');
  console.log('Company Admin:');
  console.log('  Company Code: EXCELL');
  console.log('  Email: admin@example.com');
  console.log('  Password: Admin@123456');
  console.log('');
  console.log('Students: ST001 (PIN: 1234), ST002 (PIN: 2345), ST003 (PIN: 3456)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
