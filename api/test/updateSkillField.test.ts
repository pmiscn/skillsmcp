import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import updateSkillField, {
  isValidSkillField,
  resolveFieldForPayload,
} from '../translation/skillUtils.js';

describe('updateSkillField utility', () => {
  let skillId: string;

  beforeAll(async () => {
    skillId = `ut-skill-${uuidv4()}`;
    await prisma.skill.create({
      data: {
        id: skillId,
        name: 'UT Skill',
        description: 'unit test skill',
      },
    });
  });

  afterAll(async () => {
    await prisma.translationJob.deleteMany({ where: { skill_id: skillId } }).catch(() => {});
    await prisma.skill.deleteMany({ where: { id: skillId } }).catch(() => {});
  });

  it('should update a JSON i18n field', async () => {
    await updateSkillField(skillId, 'content_i18n', 'zh', '你好世界');
    const skill = await prisma.skill.findUnique({ where: { id: skillId } });
    expect(skill).toBeTruthy();
    const parsed = skill && skill.content_i18n ? JSON.parse(skill.content_i18n) : null;
    expect(parsed).toBeTruthy();
    expect(parsed['zh']).toBe('你好世界');
  });

  it('should throw for non-whitelisted field', async () => {
    await expect(updateSkillField(skillId, 'nonexistent_field', 'zh', 'x')).rejects.toThrow();
  });

  it('resolveFieldForPayload maps content -> content_i18n', () => {
    expect(resolveFieldForPayload('content', 'zh')).toBe('content_i18n');
  });

  it('resolveFieldForPayload allows install_guide passthrough', () => {
    expect(resolveFieldForPayload('install_guide', 'zh')).toBe('install_guide');
  });

  it('resolveFieldForPayload throws on unknown payload', () => {
    expect(() => resolveFieldForPayload('___unknown___', 'zh')).toThrow();
  });
});
