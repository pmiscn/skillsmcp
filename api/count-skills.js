import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const count = await prisma.skill.count();
console.log('Skill count:', count);
await prisma.$disconnect();
