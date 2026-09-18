const OBJECT_TYPES = new Set(['question', 'hypothesis', 'prediction', 'measurement', 'asset', 'note']);
const ORIGINS = new Set(['researcher', 'agent', 'system', 'instrument', 'imported']);
const STATUSES = new Set(['proposed', 'confirmed', 'rejected']);
const PREDICATES = new Set(['addresses', 'predicts', 'tested_by', 'produces', 'references', 'related_to']);

function assertEnum(name, value, set) {
  if (!set.has(value)) throw new Error(`Invalid ${name}: ${value}`);
}

function validateObjectInput(input) {
  assertEnum('object type', input.type, OBJECT_TYPES);
  assertEnum('origin', input.origin, ORIGINS);
  assertEnum('status', input.status, STATUSES);
  if (!String(input.title || '').trim()) throw new Error('title is required');
}

function validateRelationInput(input) {
  assertEnum('predicate', input.predicate, PREDICATES);
  assertEnum('origin', input.origin, ORIGINS);
  assertEnum('status', input.status, STATUSES);
  if (!input.subjectId || !input.objectId) throw new Error('relation subject/object are required');
  if (input.subjectId === input.objectId) throw new Error('self-relations are not allowed in v0');
}

function allowedRelation(subjectType, predicate, objectType) {
  const exact = new Set([
    'hypothesis|addresses|question',
    'hypothesis|predicts|prediction',
    'prediction|tested_by|measurement',
    'measurement|produces|asset'
  ]);
  if (exact.has(`${subjectType}|${predicate}|${objectType}`)) return true;
  return predicate === 'references' || predicate === 'related_to';
}

module.exports = {
  OBJECT_TYPES,
  ORIGINS,
  STATUSES,
  PREDICATES,
  validateObjectInput,
  validateRelationInput,
  allowedRelation
};
