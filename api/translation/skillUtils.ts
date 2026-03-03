import prisma from '../db.js';

const parseJson = (value?: string | null) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

// Whitelist of allowed Skill fields that can be updated by the translation pipeline.
export const VALID_SKILL_FIELDS = new Set<string>([
  'name',
  'name_zh',
  'description',
  'description_zh',
  'tags',
  'owner',
  'contact',
  'source',
  'skill_path',
  'weight',
  'installs',
  'stars',
  'security_score',
  'security_data',
  'avoid',
  'best_practices',
  'content_i18n',
  'faq',
  'install_guide',
  'module_overrides',
  'prompt_templates',
  'quality_data',
  'quality_score',
  'risk_data',
  'test_it',
  'use_cases',
]);

export const isValidSkillField = (field: string) => VALID_SKILL_FIELDS.has(field);

// Resolve the database column name to update for a given payload type and target language.
// Examples:
// - payloadType 'content' -> 'content_i18n'
// - payloadType 'install_guide' -> 'install_guide'
// - payloadType 'name' / 'description' are handled separately by handlers (they use name_<lang>)
export const resolveFieldForPayload = (
  payloadType: string | undefined | null,
  targetLang: string,
) => {
  if (!payloadType) throw new Error('Missing payload type');
  const t = String(payloadType).trim();
  if (!t) throw new Error('Empty payload type');

  if (t === 'content') return 'content_i18n';
  // If payload already looks like a localized column (endsWith _i18n), allow it
  if (t.endsWith('_i18n')) return t;
  // If the field with language suffix exists (e.g., name -> name_zh), prefer that
  const candidate = `${t}_${targetLang}`;
  // We cannot check DB schema here cheaply; instead allow candidate if it matches common patterns
  if (VALID_SKILL_FIELDS.has(t) || VALID_SKILL_FIELDS.has(candidate)) {
    return VALID_SKILL_FIELDS.has(t) ? t : candidate;
  }

  // Fallback: if the base field is in whitelist, use it; otherwise throw
  if (VALID_SKILL_FIELDS.has(t)) return t;
  throw new Error(`Unrecognized payload type for translation: ${t}`);
};

export const updateSkillField = async (
  skillId: string,
  field: string,
  lang: string,
  value: any,
) => {
  if (!field || typeof field !== 'string')
    throw new Error(`updateSkillField: invalid field: ${String(field)}`);

  if (!isValidSkillField(field)) {
    throw new Error(`updateSkillField: field not whitelisted: ${field}`);
  }

  const skill = await prisma.skill.findUnique({ where: { id: skillId } });
  if (!skill) throw new Error(`Skill not found: ${skillId}`);

  const raw = (skill as any)[field];
  const current = parseJson(raw) || {};
  current[lang] = value;

  const updateData: Record<string, any> = {};
  updateData[field] = JSON.stringify(current);

  await prisma.skill.update({ where: { id: skillId }, data: updateData });
};

export default updateSkillField;
