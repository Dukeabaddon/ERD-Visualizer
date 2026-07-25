import { parseSchemaFromText } from './parser';

describe('parseSchemaFromText — SQL dialects & edge cases', () => {
  test('empty / whitespace returns empty model', () => {
    expect(parseSchemaFromText('')).toEqual({ entities: [], relationships: [] });
    expect(parseSchemaFromText('   \n\t  ')).toEqual({
      entities: [],
      relationships: [],
    });
  });

  test('basic PostgreSQL CREATE TABLE + FK', () => {
    const sql = `
CREATE TABLE users (
  id serial PRIMARY KEY,
  email varchar(255) NOT NULL
);
CREATE TABLE orders (
  id serial PRIMARY KEY,
  user_id integer,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`;
    const model = parseSchemaFromText(sql);
    expect(model.entities.map((e) => e.name).sort()).toEqual(['orders', 'users']);
    expect(model.relationships.length).toBeGreaterThanOrEqual(1);
    const users = model.entities.find((e) => e.name === 'users')!;
    expect(users.columns.find((c) => c.name === 'id')?.primary).toBe(true);
  });

  test('MySQL backticks and INT AUTO_INCREMENT', () => {
    const sql = `
CREATE TABLE \`users\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`email\` VARCHAR(255) NOT NULL,
  PRIMARY KEY (\`id\`)
);
CREATE TABLE \`posts\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`user_id\` INT,
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`fk_posts_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)
);
`;
    const model = parseSchemaFromText(sql);
    expect(model.entities.length).toBe(2);
    expect(model.relationships.length).toBeGreaterThanOrEqual(1);
  });

  test('SQLite IF NOT EXISTS + inline REFERENCES', () => {
    const sql = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id)
);
`;
    const model = parseSchemaFromText(sql);
    expect(model.entities.length).toBe(2);
    expect(model.relationships.length).toBeGreaterThanOrEqual(1);
  });

  test('nested CHECK / DEFAULT functions do not break column split', () => {
    const sql = `
CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  balance numeric(12,2) NOT NULL DEFAULT (0),
  status text CHECK (status IN ('active', 'closed')),
  meta jsonb DEFAULT '{}'::jsonb
);
`;
    const model = parseSchemaFromText(sql);
    const accounts = model.entities.find((e) => e.name === 'accounts');
    expect(accounts).toBeTruthy();
    expect(accounts!.columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['id', 'balance', 'status', 'meta'])
    );
  });

  test('Databricks/Spark MAP/ARRAY + USING DELTA (legacy path)', () => {
    const sql = `
CREATE TABLE IF NOT EXISTS demo_insurance_master (
  person_id STRING NOT NULL,
  policy_number STRING NOT NULL,
  rider_details MAP<STRING,STRING>,
  CONSTRAINT pk_insurance_master PRIMARY KEY (person_id, policy_number)
)
USING DELTA;

CREATE TABLE IF NOT EXISTS demo_insurance_claims (
  claim_id STRING NOT NULL,
  person_id STRING NOT NULL,  -- FK to demo_insurance_master.person_id
  documents_submitted ARRAY<STRING>
)
USING DELTA;
`;
    const model = parseSchemaFromText(sql);
    expect(model.entities.length).toBe(2);
    const master = model.entities.find((e) => e.name === 'demo_insurance_master')!;
    expect(master.columns.find((c) => c.name === 'rider_details')?.type).toMatch(/MAP/i);
    expect(master.columns.find((c) => c.name === 'person_id')?.primary).toBe(true);
    expect(master.columns.find((c) => c.name === 'policy_number')?.primary).toBe(true);
    const claims = model.entities.find((e) => e.name === 'demo_insurance_claims')!;
    expect(claims.columns.find((c) => c.name === 'documents_submitted')?.type).toMatch(
      /ARRAY/i
    );
  });

  test('ALTER TABLE ADD FOREIGN KEY is detected', () => {
    const sql = `
CREATE TABLE a (id int PRIMARY KEY);
CREATE TABLE b (id int PRIMARY KEY, a_id int);
ALTER TABLE b ADD CONSTRAINT fk_b_a FOREIGN KEY (a_id) REFERENCES a(id);
`;
    const model = parseSchemaFromText(sql);
    expect(model.entities.length).toBe(2);
    expect(model.relationships.length).toBeGreaterThanOrEqual(1);
  });

  test('CREATE VIEW creates a view entity when AST supports it', () => {
    const sql = `
CREATE TABLE users (id int PRIMARY KEY, email text);
CREATE VIEW active_users AS SELECT id, email FROM users;
`;
    const model = parseSchemaFromText(sql);
    expect(model.entities.some((e) => e.name === 'users')).toBe(true);
    const view = model.entities.find((e) => e.name === 'active_users');
    // View support is best-effort; assert we do not throw and users still parse.
    expect(model.entities.length).toBeGreaterThanOrEqual(1);
    if (view) expect(view.kind).toBe('view');
  });

  test('SQL comments inside strings are preserved (no false strip)', () => {
    const sql = `
CREATE TABLE weird (
  id int PRIMARY KEY,
  note text DEFAULT '-- not a comment'
);
`;
    const model = parseSchemaFromText(sql);
    const weird = model.entities.find((e) => e.name === 'weird');
    expect(weird?.columns.some((c) => c.name === 'note')).toBe(true);
  });

  test('non-DDL / garbage SQL does not throw', () => {
    expect(() => parseSchemaFromText('SELECT 1;')).not.toThrow();
    expect(() => parseSchemaFromText('this is not sql {{{')).not.toThrow();
  });
});

describe('parseSchemaFromText — JSON shapes & strictness', () => {
  test('canonical JSON entities + relationships', () => {
    const json = JSON.stringify({
      entities: [
        { name: 'users', columns: [{ name: 'id', primary: true }, { name: 'email' }] },
        { name: 'orders', columns: [{ name: 'id', primary: true }, { name: 'user_id' }] },
      ],
      relationships: [
        { from: 'orders.user_id', to: 'users.id', cardinality: 'many-to-one' },
      ],
    });
    const model = parseSchemaFromText(json);
    expect(model.entities.length).toBe(2);
    expect(model.relationships.length).toBe(1);
    expect(model.relationships[0].from).toEqual({ entity: 'orders', column: 'user_id' });
  });

  test('alternate JSON with attributes + primaryKey', () => {
    const json = JSON.stringify({
      entities: [
        {
          name: 'User',
          attributes: [{ name: 'id', type: 'uuid' }, { name: 'email', type: 'string' }],
          primaryKey: ['id'],
        },
        {
          name: 'Post',
          attributes: [{ name: 'id' }, { name: 'userId' }],
          primaryKey: 'id',
          relationships: [{ type: 'manyToOne', target: 'User', foreignKey: 'userId' }],
        },
      ],
    });
    const model = parseSchemaFromText(json);
    expect(model.entities.length).toBe(2);
    const user = model.entities.find((e) => e.name.toLowerCase() === 'user');
    expect(user?.columns.find((c) => c.name === 'id')?.primary).toBe(true);
  });

  test('empty JSON object / array are safe', () => {
    expect(parseSchemaFromText('{}')).toEqual({ entities: [], relationships: [] });
    // bare array is not a schema object — must not throw
    expect(() => parseSchemaFromText('[]')).not.toThrow();
  });

  test('invalid JSON that starts with { falls through without throw', () => {
    expect(() => parseSchemaFromText('{ not json')).not.toThrow();
  });

  test('UTF-8 BOM + leading whitespace before JSON', () => {
    const body = JSON.stringify({
      entities: [{ name: 't', columns: [{ name: 'id', primary: true }] }],
    });
    const withBom = `\uFEFF  \n${body}`;
    const model = parseSchemaFromText(withBom);
    expect(model.entities.map((e) => e.name)).toEqual(['t']);
  });

  test('rejects wrong types via Zod by falling through / empty rather than crash', () => {
    const bad = JSON.stringify({
      entities: [{ name: 123, columns: 'nope' }],
    });
    expect(() => parseSchemaFromText(bad)).not.toThrow();
  });

  test('extra unknown JSON keys are ignored (non-strict passthrough)', () => {
    const json = JSON.stringify({
      entities: [{ name: 'x', columns: [{ name: 'id', primary: true }], extra: true }],
      relationships: [],
      meta: { author: 'test' },
    });
    const model = parseSchemaFromText(json);
    expect(model.entities).toHaveLength(1);
    expect(model.entities[0].name).toBe('x');
  });
});
