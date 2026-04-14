import Dexie from 'dexie';

// ── Database setup ──
const db = new Dexie('grimoire');

db.version(1).stores({
  cards: 'id, name, profileId, createdAt',
  profiles: 'id, name',
  tags: 'name',
  settings: 'key',
  backups: 'id, createdAt',
});

// ── Default D&D profile ──
export const DND_PROFILE = {
  id: 'dnd-5e',
  name: 'D&D 5th Edition',
  icon: '🎲',
  color: '#4a7ec2',
  builtIn: true,
  fields: [
    { key: 'stats', label: 'Stats' },
    { key: 'description', label: 'Description' },
    { key: 'at_higher_levels', label: 'At Higher Levels' },
  ],
  additionalInstructions:
    'Extract D&D 5e content from this page. For spells and cantrips, extract these as key-value Stats: Level, School, Casting Time, Range, Components, Duration, Concentration (Yes/No), Classes. For class features, racial traits, or item abilities, extract relevant properties as Stats (e.g. Prerequisite, Usage, Recharge). Preserve the full description text faithfully. If there is an "At Higher Levels" section, extract it separately.',
  useCustomPrompt: false,
  customPrompt: '',
};

export const PROFILE_COLORS = [
  '#4a7ec2', '#5ea66b', '#c29a3e', '#8b5ec2',
  '#c25e5e', '#4a9ec2', '#c27a5e', '#7d8590',
];

// ── Migration from old localStorage format ──
export async function migrateFromLocalStorage() {
  const raw = localStorage.getItem('grimoire-data');
  if (!raw) return false;

  try {
    const data = JSON.parse(raw);
    const cards = data.cards || [];
    const tags = data.tags || data.characters || [];
    const profiles = data.profiles || [];
    const apiKey = localStorage.getItem('grimoire-api-key') || '';

    // Migrate old card formats
    cards.forEach((card) => {
      if (card.characters && !card.tags) {
        card.tags = card.characters;
        delete card.characters;
      }
      if (!card.sections) migrateCardToSections(card);
    });

    // Ensure D&D profile exists and migrate profile model
    if (!profiles.find((p) => p.id === 'dnd-5e')) {
      profiles.unshift({ ...DND_PROFILE });
    }
    const migratedProfiles = profiles.map(migrateProfileFields);

    // Write to IndexedDB
    await db.transaction('rw', db.cards, db.profiles, db.tags, db.settings, async () => {
      await db.cards.bulkPut(cards);
      await db.profiles.bulkPut(migratedProfiles);
      await db.tags.bulkPut(tags.map((t) => (typeof t === 'string' ? { name: t } : t)));
      if (apiKey) await db.settings.put({ key: 'apiKey', value: apiKey });
    });

    // Mark migration complete — keep old data as safety net
    localStorage.setItem('grimoire-migrated-to-idb', 'true');
    return true;
  } catch (e) {
    console.error('Migration failed:', e);
    return false;
  }
}

function migrateCardToSections(card) {
  const oldDnd = ['spell', 'cantrip', 'class_feature', 'racial_trait', 'item_ability'];

  if (oldDnd.includes(card.type)) {
    card.profileId = 'dnd-5e';
    card.sections = [];
    const kv = {};
    if (card.level != null) kv['Level'] = card.level === 0 ? 'Cantrip' : String(card.level);
    if (card.school) kv['School'] = card.school;
    if (card.castingTime) kv['Casting Time'] = card.castingTime;
    if (card.range) kv['Range'] = card.range;
    if (card.components) kv['Components'] = card.components;
    if (card.duration) kv['Duration'] = card.duration;
    if (card.concentration != null) kv['Concentration'] = card.concentration ? 'Yes' : 'No';
    if (card.classes) kv['Classes'] = card.classes;
    const labels = { spell: 'Spell', cantrip: 'Cantrip', class_feature: 'Class Feature', racial_trait: 'Racial Trait', item_ability: 'Item' };
    kv['Type'] = labels[card.type] || card.type;
    if (Object.keys(kv).length) card.sections.push({ name: 'Stats', type: 'key-value', keyValues: kv, priority: 1 });
    if (card.description) card.sections.push({ name: 'Description', type: 'text', content: card.description, priority: 2 });
    if (card.higherLevels) card.sections.push({ name: 'At Higher Levels', type: 'text', content: card.higherLevels, priority: 3 });
  } else {
    card.profileId = card.profileId || '';
    card.sections = [];
    if (card.keyValues && Object.keys(card.keyValues).length) {
      card.sections.push({ name: 'Stats', type: 'key-value', keyValues: card.keyValues, priority: 1 });
    }
    if (card.description) {
      card.sections.push({ name: 'Description', type: 'text', content: card.description, priority: card.sections.length + 1 });
    }
  }

  // Clean up old fields
  for (const k of ['type', 'level', 'school', 'castingTime', 'range', 'components', 'duration', 'concentration', 'classes', 'higherLevels', 'keyValues', 'description', 'category']) {
    delete card[k];
  }
}

// ── Profile migration: sections/scanInstructions → fields/additionalInstructions ──
export function migrateProfileFields(profile) {
  if (profile.fields) return profile; // already on new model
  const { sections, scanInstructions, ...rest } = profile;
  const fields = (sections || []).map((s) => ({
    key: (s.name || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
    label: s.name || '',
  }));
  return {
    ...rest,
    fields,
    additionalInstructions: scanInstructions || '',
    useCustomPrompt: rest.useCustomPrompt || false,
    customPrompt: rest.customPrompt || '',
  };
}

// ── CRUD operations ──
export async function getAllCards() {
  return db.cards.toArray();
}

export async function getCard(id) {
  return db.cards.get(id);
}

export async function putCard(card) {
  await db.cards.put(card);
}

export async function deleteCard(id) {
  await db.cards.delete(id);
}

export async function getAllProfiles() {
  let profiles = await db.profiles.toArray();

  // Migrate any profiles still on the old sections/scanInstructions model
  const toSave = [];
  profiles = profiles.map((p) => {
    if (!p.fields) {
      const m = migrateProfileFields(p);
      toSave.push(m);
      return m;
    }
    return p;
  });
  if (toSave.length > 0) {
    await db.profiles.bulkPut(toSave);
  }

  // Ensure D&D profile
  if (!profiles.find((p) => p.id === 'dnd-5e')) {
    await db.profiles.put({ ...DND_PROFILE });
    profiles.unshift({ ...DND_PROFILE });
  }
  return profiles;
}

export async function putProfile(profile) {
  await db.profiles.put(profile);
}

export async function deleteProfile(id) {
  await db.profiles.delete(id);
}

export async function getAllTags() {
  const tags = await db.tags.toArray();
  return tags.map((t) => t.name);
}

export async function addTag(name) {
  await db.tags.put({ name });
}

export async function removeTag(name) {
  await db.tags.delete(name);
}

export async function getSetting(key) {
  const row = await db.settings.get(key);
  return row?.value ?? null;
}

export async function setSetting(key, value) {
  await db.settings.put({ key, value });
}

// ── Auto-backup ──
export async function createBackup() {
  const cards = await getAllCards();
  const profiles = await getAllProfiles();
  const tags = await getAllTags();
  const backup = {
    id: 'backup-' + Date.now(),
    createdAt: Date.now(),
    data: { cards, profiles, tags },
  };
  await db.backups.put(backup);

  // Keep only last 5 backups
  const all = await db.backups.orderBy('createdAt').toArray();
  if (all.length > 5) {
    const toDelete = all.slice(0, all.length - 5);
    await db.backups.bulkDelete(toDelete.map((b) => b.id));
  }
  return backup;
}

export async function getLatestBackup() {
  return db.backups.orderBy('createdAt').last();
}

export function exportToJSON(cards, profiles, tags) {
  return JSON.stringify({ cards, profiles, tags, exportedAt: new Date().toISOString() }, null, 2);
}

export async function importFromJSON(jsonStr) {
  const data = JSON.parse(jsonStr);
  if (!data.cards && !data.profiles) throw new Error('Invalid backup file');

  const cards = data.cards || [];
  const profiles = data.profiles || [];
  const tags = data.tags || [];

  // Migrate old formats
  cards.forEach((c) => {
    if (c.characters && !c.tags) { c.tags = c.characters; delete c.characters; }
    if (!c.sections) migrateCardToSections(c);
  });

  if (!profiles.find((p) => p.id === 'dnd-5e')) {
    profiles.unshift({ ...DND_PROFILE });
  }
  const migratedProfiles = profiles.map(migrateProfileFields);

  await db.transaction('rw', db.cards, db.profiles, db.tags, async () => {
    await db.cards.clear();
    await db.profiles.clear();
    await db.tags.clear();
    await db.cards.bulkPut(cards);
    await db.profiles.bulkPut(migratedProfiles);
    await db.tags.bulkPut(tags.map((t) => (typeof t === 'string' ? { name: t } : t)));
  });

  return { cardCount: cards.length, profileCount: profiles.length };
}

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── Card index for connection discovery ──
// Returns lightweight { id, name, category, summary } for all cards in a profile.
// Pass null/undefined to get index across all profiles.
export async function buildCardIndex(profileId) {
  const cards = profileId
    ? await db.cards.where('profileId').equals(profileId).toArray()
    : await db.cards.toArray();
  return cards.map(({ id, name, category, summary }) => ({
    id,
    name: name || '',
    category: category || '',
    summary: summary || '',
  }));
}

export default db;
