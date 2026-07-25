import { SchemaModel, Entity, Column, Relationship, EntityKind, IconHint, PaletteName } from './model';
import { z } from 'zod';
import { Parser as SqlAstParser } from 'node-sql-parser';

type SqlStatement = any;

const SQL_DIALECTS = ['postgresql', 'mysql', 'sqlite', 'mssql'];
const sqlParser = new SqlAstParser();

// Very small SQL/JSON parser to extract tables, columns, PKs, and FKs for common patterns

const LayoutSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number().optional(),
    height: z.number().optional(),
  })
  .partial()
  .optional();

const ColumnSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  primary: z.boolean().optional(),
  unique: z.boolean().optional(),
  nullable: z.boolean().optional(),
  comment: z.string().optional(),
});

const EntitySchema = z.object({
  name: z.string(),
  columns: z.array(ColumnSchema).optional(),
  kind: z.enum(['table', 'view']).optional(),
  comment: z.string().optional(),
  iconHint: z.string().optional(),
  palette: z.string().optional(),
  layout: LayoutSchema,
});

const RelationshipSchema = z.object({
  from: z.string(),
  to: z.string(),
  cardinality: z.string().optional(),
  onDelete: z.string().optional(),
  onUpdate: z.string().optional(),
});

const SchemaShape = z.object({
  entities: z.array(EntitySchema).optional(),
  relationships: z.array(RelationshipSchema).optional(),
});

export function parseSchemaFromText(text: string): SchemaModel {
  // Strip UTF-8 BOM and outer whitespace so JSON detection stays reliable.
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return { entities: [], relationships: [] };
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const obj = JSON.parse(trimmed);
      // Accept canonical shape, but also try to normalize several alternate JSON ERD shapes
      let parsed = SchemaShape.safeParse(obj);
      // If parsed ok but entities have no columns (because input used `attributes`), try normalization
      if (parsed.success) {
        const hasCols = Array.isArray(parsed.data.entities) && parsed.data.entities.some((e: any) => Array.isArray(e.columns) && e.columns.length > 0);
        if (hasCols) return fromJsonShape(parsed.data);
        // otherwise fall through to normalization
      }
      const normalized = normalizeAlternateJsonShape(obj);
      if (normalized) {
        const parsedNorm = SchemaShape.safeParse(normalized);
        if (parsedNorm.success) return fromJsonShape(parsedNorm.data);
      }
      // Valid JSON that is not a schema (e.g. [] / {}) → empty model, not SQL fallback
      if (obj !== null && typeof obj === 'object') {
        return { entities: [], relationships: [] };
      }
    } catch (_) {
      // fallthrough to SQL
    }
  }
  return parseSqlWithAst(text);
}

function parseSqlWithAst(sql: string): SchemaModel {
  const ast = tryAstify(sql);
  if (!ast) return legacyParseSql(sql);
  const builder = new AstSchemaBuilder();
  for (const stmt of ast) builder.applyStatement(stmt);
  builder.applyCommentStatements(sql);
  const model = builder.build();
  if (!model.entities.length && !model.relationships.length) {
    return legacyParseSql(sql);
  }
  return model;
}

function tryAstify(sql: string): SqlStatement[] | null {
  for (const dialect of SQL_DIALECTS) {
    try {
      const ast = sqlParser.astify(sql, { database: dialect });
      if (Array.isArray(ast)) return ast;
      if (ast) return [ast];
    } catch (_) {
      // try next dialect
    }
  }
  return null;
}

interface EntityAccumulator {
  name: string;
  kind: EntityKind;
  columns: Map<string, Column>;
  comment?: string;
  iconHint?: IconHint;
  palette?: PaletteName;
  columnComments: Map<string, string>;
}

class AstSchemaBuilder {
  private entities = new Map<string, EntityAccumulator>();
  private relationships: Relationship[] = [];
  private relationshipIds = new Set<string>();

  applyStatement(stmt: SqlStatement) {
    if (!stmt || typeof stmt !== 'object') return;
    const type = (stmt.type || '').toString().toLowerCase();
    if (type !== 'create' && type !== 'alter') return;
    const keyword = (stmt.keyword || '').toString().toLowerCase();
    if (type === 'create' && keyword === 'table') {
      this.applyCreateTable(stmt);
    } else if (type === 'create' && keyword === 'view') {
      this.applyCreateView(stmt);
    } else if (type === 'alter') {
      this.applyAlterTable(stmt);
    }
  }

  applyCommentStatements(sql: string) {
    const regex = /comment\s+on\s+(table|column)\s+(.+?)\s+is\s+'((?:''|[^'])*)'/gim;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(sql))) {
      const target = match[1].toLowerCase();
      const identifier = match[2].replace(/["`]/g, '').replace(/\[/g, '').replace(/\]/g, '').trim();
      const comment = match[3].replace(/''/g, "'");
      if (target === 'table') {
        const tableName = normalizeIdentifier(identifier);
        if (!tableName) continue;
        const entity = this.ensureEntity(tableName);
        entity.comment = comment;
      } else {
        const parts = identifier.split('.');
        if (parts.length < 2) continue;
        const columnName = normalizeIdentifier(parts.pop());
        const tableName = normalizeIdentifier(parts.pop());
        if (!tableName || !columnName) continue;
        const entity = this.ensureEntity(tableName);
        const existing = entity.columns.get(columnName);
        if (existing) {
          existing.comment = comment;
          entity.columns.set(columnName, existing);
        } else {
          entity.columnComments.set(columnName, comment);
        }
      }
    }
  }

  build(): SchemaModel {
    const entities: Entity[] = [];
    for (const entry of this.entities.values()) {
      const columns: Column[] = [];
      for (const column of entry.columns.values()) {
        if (!column.comment && entry.columnComments.has(column.name)) {
          column.comment = entry.columnComments.get(column.name);
        }
        columns.push({ ...column });
      }
      const entity: Entity = {
        id: entry.name,
        name: entry.name,
        columns,
        kind: entry.kind,
        comment: entry.comment,
        iconHint: entry.iconHint ?? deriveIconHint(entry.name),
        palette: entry.palette ?? derivePalette(entry.name),
      };
      entities.push(entity);
    }
    return { entities, relationships: this.relationships };
  }

  private applyCreateTable(stmt: any) {
    const tableRef = Array.isArray(stmt.table) ? stmt.table[0] : stmt.table;
    const name = normalizeIdentifier(tableRef?.table || tableRef?.name);
    if (!name) return;
    const entity = this.ensureEntity(name, 'table');
    if (!Array.isArray(stmt.create_definitions)) return;
    for (const def of stmt.create_definitions) {
      if (!def || typeof def !== 'object') continue;
      if (def.resource === 'column') {
        this.applyColumnDefinition(entity, def);
      } else if (def.resource === 'constraint' || def.constraint_type) {
        this.applyConstraintDefinition(entity, name, def);
      }
    }
  }

  private applyCreateView(stmt: any) {
    const viewRef = stmt.view || (Array.isArray(stmt.table) ? stmt.table[0] : stmt.table);
    const name = normalizeIdentifier(viewRef?.view || viewRef?.table || viewRef?.name);
    if (!name) return;
    const entity = this.ensureEntity(name, 'view');
    entity.kind = 'view';
    const columnsSource = stmt.columns || stmt.select?.columns || [];
    columnsSource.forEach((column: any, index: number) => {
      const colName =
        normalizeIdentifier(column?.as) ||
        normalizeIdentifier(column?.expr?.column) ||
        `expr_${index + 1}`;
      if (!colName) return;
      const col: Column = entity.columns.get(colName) || { name: colName };
      col.type = col.type || buildColumnType(column?.expr);
      entity.columns.set(colName, col);
    });
  }

  private applyAlterTable(stmt: any) {
    const tableRef = Array.isArray(stmt.table) ? stmt.table[0] : stmt.table;
    const name = normalizeIdentifier(tableRef?.table || tableRef?.name);
    if (!name) return;
    const entity = this.ensureEntity(name, 'table');
    if (!Array.isArray(stmt.expr)) return;
    for (const expr of stmt.expr) {
      if (!expr || typeof expr !== 'object') continue;
      if (expr.resource === 'column' && (expr.column || expr.definition)) {
        this.applyColumnDefinition(entity, expr);
      } else if (expr.resource === 'constraint' && expr.create_definitions) {
        this.applyConstraintDefinition(entity, name, expr.create_definitions);
      } else if (expr.create_definitions) {
        this.applyConstraintDefinition(entity, name, expr.create_definitions);
      }
    }
  }

  private applyColumnDefinition(entity: EntityAccumulator, def: any) {
    const colName = normalizeIdentifier(def?.column?.column || def?.column);
    if (!colName) return;
    const column: Column = entity.columns.get(colName) || { name: colName };
    column.type = column.type || buildColumnType(def?.definition);
    if (def?.nullable) {
      column.nullable = def.nullable.value !== 'not null';
    }
    if (def?.primary_key) column.primary = true;
    if (def?.unique) column.unique = true;
    if (def?.reference_definition) {
      column.foreign = true;
      this.addReferenceRelationship(entity.name, colName, def.reference_definition);
    }
    entity.columns.set(colName, column);
  }

  private applyConstraintDefinition(entity: EntityAccumulator, tableName: string, constraint: any) {
    const type = (constraint?.constraint_type || constraint?.type || '').toString().toLowerCase();
    if (!type) return;
    if (type.includes('primary')) {
      const cols = Array.isArray(constraint.definition) ? constraint.definition : [];
      cols.forEach((colRef: any) => {
        const colName = normalizeIdentifier(colRef?.column);
        if (!colName) return;
        const column = entity.columns.get(colName) || { name: colName };
        column.primary = true;
        entity.columns.set(colName, column);
      });
    }
    if (type.includes('foreign') || constraint.reference_definition) {
      this.addTableConstraintRelationship(tableName, entity, constraint);
    }
  }

  private addTableConstraintRelationship(tableName: string, entity: EntityAccumulator, constraint: any) {
    const fromCols: Array<string | undefined> = Array.isArray(constraint.definition)
      ? constraint.definition.map((col: any) => normalizeIdentifier(col?.column))
      : [];
    const reference = constraint.reference_definition;
    if (!reference) return;
    const toTableRef = Array.isArray(reference.table) ? reference.table[0] : reference.table;
    const toTable = normalizeIdentifier(toTableRef?.table || toTableRef?.name);
    const toCols: Array<string | undefined> = Array.isArray(reference.definition)
      ? reference.definition.map((col: any) => normalizeIdentifier(col?.column))
      : [];
    if (!toTable) return;
    fromCols.forEach((from: string | undefined, idx: number) => {
      const to = toCols[idx] || toCols[0];
      if (!from || !to) return;
      const column: Column = entity.columns.get(from) ?? { name: from };
      column.foreign = true;
      entity.columns.set(from, column);
      this.addRelationship(from, to, tableName, toTable, reference);
    });
  }

  private addReferenceRelationship(tableName: string, columnName: string, reference: any) {
    const toTableRef = Array.isArray(reference.table) ? reference.table[0] : reference.table;
    const toTable = normalizeIdentifier(toTableRef?.table || toTableRef?.name);
    const toColumnRef = Array.isArray(reference.definition) ? reference.definition[0] : reference.definition;
    const toColumn = normalizeIdentifier(toColumnRef?.column);
    if (!toTable || !toColumn) return;
    this.addRelationship(columnName, toColumn, tableName, toTable, reference);
  }

  private addRelationship(
    fromColumn: string,
    toColumn: string,
    fromTable: string,
    toTable: string,
    reference?: any,
  ) {
    const id = `${fromTable}.${fromColumn}->${toTable}.${toColumn}`;
    if (this.relationshipIds.has(id)) return;
    this.relationshipIds.add(id);
    const actions = extractReferentialActions(reference?.on_action);
    this.relationships.push({
      id,
      from: { entity: fromTable, column: fromColumn },
      to: { entity: toTable, column: toColumn },
      cardinality: 'many-to-one',
      onDelete: actions.onDelete,
      onUpdate: actions.onUpdate,
    });
  }

  private ensureEntity(name: string, kind: EntityKind = 'table'): EntityAccumulator {
    const existing = this.entities.get(name);
    if (existing) {
      existing.kind = existing.kind || kind;
      return existing;
    }
    const acc: EntityAccumulator = {
      name,
      kind,
      columns: new Map(),
      iconHint: deriveIconHint(name),
      palette: derivePalette(name),
      columnComments: new Map(),
    };
    this.entities.set(name, acc);
    return acc;
  }
}

const PERSON_ENTITY_HINTS = ['user', 'users', 'employee', 'employees', 'student', 'students', 'person', 'people', 'patient', 'patients', 'guardian', 'guardians', 'profile'];
const PALETTE_SEQUENCE: PaletteName[] = ['blue', 'green', 'purple', 'red', 'yellow'];

function deriveIconHint(name?: string): IconHint | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase();
  return PERSON_ENTITY_HINTS.some(alias => lower.includes(alias)) ? 'person' : undefined;
}

function derivePalette(name?: string): PaletteName {
  if (!name) return 'blue';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PALETTE_SEQUENCE.length;
  return PALETTE_SEQUENCE[index];
}

function normalizeIdentifier(value?: string | null): string {
  if (!value) return '';
  const sanitized = value.replace(/["'`]/g, '').replace(/\[/g, '').replace(/\]/g, '');
  const parts = sanitized.split('.');
  return parts[parts.length - 1]?.trim() || '';
}

function buildColumnType(def?: any): string | undefined {
  if (!def) return undefined;
  if (def.dataType) {
    const base = def.dataType.toString();
    if (typeof def.length === 'number') {
      return `${base}(${def.length})`;
    }
    if (Array.isArray(def.args) && def.args.length) {
      const args = def.args.map((arg: any) => arg.value ?? arg).join(', ');
      return `${base}(${args})`;
    }
    return base;
  }
  if (def.type) return def.type.toString();
  return undefined;
}

function extractReferentialActions(actions?: any[]): { onDelete?: string; onUpdate?: string } {
  const result: { onDelete?: string; onUpdate?: string } = {};
  if (!Array.isArray(actions)) return result;
  for (const action of actions) {
    if (!action || typeof action !== 'object') continue;
    const type = (action.type || '').toString().toLowerCase();
    if (type.includes('delete')) result.onDelete = action.value;
    if (type.includes('update')) result.onUpdate = action.value;
  }
  return result;
}

// Heuristic normalizer: map alternate ERD JSON shapes into the canonical schema shape
function normalizeAlternateJsonShape(obj: any) {
  if (!obj || !Array.isArray(obj.entities)) return null;
  const norm: any = { entities: [], relationships: [] };
  const entityLookup = new Map<
    string,
    {
      original: any;
      columns: any[];
      primary?: string;
    }
  >();

  for (const entity of obj.entities) {
    if (!entity || !entity.name) continue;
    const columns: any[] = [];
    const seen = new Set<string>();
    if (Array.isArray(entity.columns)) {
      for (const col of entity.columns) {
        const name = col?.name || col;
        if (!name || seen.has(name)) continue;
        seen.add(name);
        columns.push({ name, type: col?.type, primary: !!col?.primary });
      }
    }
    if (Array.isArray(entity.attributes)) {
      for (const attr of entity.attributes) {
        const name =
          typeof attr === 'string'
            ? attr
            : attr && typeof attr === 'object'
              ? attr.name
              : undefined;
        if (!name || typeof name !== 'string' || seen.has(name)) continue;
        seen.add(name);
        columns.push({
          name,
          type: typeof attr === 'object' && attr ? attr.type : undefined,
          primary: typeof attr === 'object' && attr ? !!attr.primary : false,
        });
      }
    }
    const primaryKeys = Array.isArray(entity.primaryKey)
      ? entity.primaryKey.filter((k: unknown) => typeof k === 'string')
      : typeof entity.primaryKey === 'string'
        ? [entity.primaryKey]
        : [];
    for (const primary of primaryKeys) {
      const pk = columns.find((col) => col.name === primary);
      if (pk) pk.primary = true;
      else columns.unshift({ name: primary, primary: true });
    }
    const primary =
      primaryKeys[0] || columns.find((col) => col.primary)?.name;
    const entry = { name: entity.name, columns };
    norm.entities.push(entry);
    entityLookup.set(entity.name, { original: entity, columns, primary });
  }

  for (const entity of obj.entities) {
    if (!Array.isArray(entity.relationships)) continue;
    for (const rel of entity.relationships) {
      pushNormalizedRelationship(entity, rel, entityLookup, norm.relationships);
    }
  }

  if (Array.isArray(obj.relationships)) {
    for (const rel of obj.relationships) {
      norm.relationships.push(rel);
    }
  }

  return norm;
}

function pushNormalizedRelationship(
  source: any,
  rel: any,
  entityLookup: Map<string, { original: any; columns: any[]; primary?: string }>,
  target: any[],
) {
  if (!rel || !rel.target) return;
  const type = (rel.type || '').toString().toLowerCase();
  const cardinality = rel.cardinality || deriveCardinalityFromType(type);
  const targetInfo = entityLookup.get(rel.target);
  const viaInfo = rel.via ? entityLookup.get(rel.via) : undefined;
  const sourceInfo = entityLookup.get(source.name);
  if (!sourceInfo) return;

  if (type.includes('manytomany') && viaInfo) {
    const sourcePk = sourceInfo.primary || sourceInfo.columns[0]?.name;
    const targetPk = targetInfo?.primary || targetInfo?.columns[0]?.name;
    const viaSourceCol = findMatchingColumn(viaInfo, rel.viaSourceKey || source.name);
    const viaTargetCol = findMatchingColumn(viaInfo, rel.viaTargetKey || rel.target);
    if (viaSourceCol && sourcePk) {
      target.push({ from: `${source.name}.${sourcePk}`, to: `${rel.via}.${viaSourceCol}`, cardinality });
    }
    if (viaTargetCol && targetPk) {
      target.push({ from: `${rel.target}.${targetPk}`, to: `${rel.via}.${viaTargetCol}`, cardinality });
    }
    return;
  }

  if (type.includes('manytoone')) {
    const fromColumn = rel.foreignKey || findMatchingColumn(sourceInfo, rel.target) || sourceInfo.primary;
    const toColumn = targetInfo?.primary || rel.targetKey || rel.foreignKey;
    if (fromColumn && toColumn) {
      target.push({ from: `${source.name}.${fromColumn}`, to: `${rel.target}.${toColumn}`, cardinality });
    }
    return;
  }

  const targetColumn =
    (rel.foreignKey && findMatchingColumn(targetInfo, rel.foreignKey)) ||
    (targetInfo && findMatchingColumn(targetInfo, source.name)) ||
    rel.foreignKey;
  const sourcePk = sourceInfo.primary || sourceInfo.columns[0]?.name;
  if (targetColumn && sourcePk) {
    target.push({ from: `${rel.target}.${targetColumn}`, to: `${source.name}.${sourcePk}`, cardinality });
  }
}

function findMatchingColumn(info: { columns: any[] } | undefined, term: string) {
  if (!info || !term) return undefined;
  const lower = term.toLowerCase();
  return info.columns.find(col => col.name && col.name.toLowerCase() === lower)?.name
    || info.columns.find(col => col.name && col.name.toLowerCase() === `${lower}id`)?.name
    || info.columns.find(col => col.name && col.name.toLowerCase().includes(lower))?.name;
}

function deriveCardinalityFromType(type: string) {
  if (type.includes('one') && type.includes('many')) return '1..*';
  if (type.includes('many') && type.includes('one')) return '*..1';
  if (type.includes('many') && type.includes('many')) return '*..*';
  if (type.includes('one') && type.includes('one')) return '1..1';
  return 'many-to-one';
}

function fromJsonShape(obj: z.infer<typeof SchemaShape>): SchemaModel {
  const entities: Entity[] = [];
  const relationships: Relationship[] = [];
  if (Array.isArray(obj.entities)) {
    for (const e of obj.entities) {
      const cols: Column[] = [];
      for (const c of e.columns || []) {
        cols.push({
          name: c.name,
          type: c.type,
          primary: !!c.primary,
          unique: !!c.unique,
          nullable: !!c.nullable,
          comment: c.comment,
        });
      }
      entities.push({
        id: e.name,
        name: e.name,
        columns: cols,
        kind: e.kind as EntityKind | undefined,
        comment: e.comment,
        iconHint: e.iconHint as IconHint | undefined,
        palette: (e.palette as PaletteName | undefined) || (e.name ? derivePalette(e.name) : undefined),
        layout: e.layout ? { ...e.layout } : undefined,
      });
    }
  }
  if (Array.isArray(obj.relationships)) {
    for (const r of obj.relationships) {
      const [fromEntity, fromCol] = r.from.split('.');
      const [toEntity, toCol] = r.to.split('.');
      relationships.push({ id: `${r.from}->${r.to}`, from: { entity: fromEntity, column: fromCol }, to: { entity: toEntity, column: toCol }, cardinality: (r.cardinality as any) || 'many-to-one', onDelete: r.onDelete, onUpdate: r.onUpdate });
    }
  }
  return { entities, relationships };
}

function legacyParseSql(sql: string): SchemaModel {
  const entities: Entity[] = [];
  const relationships: Relationship[] = [];
  const normalized = stripComments(sql).replace(/\r\n/g, '\n');

  // Robustly extract table blocks (handling nested parentheses)
  const blocks = findTableBlocks(normalized);

  for (const block of blocks) {
    const rawName = block.name;
    const body = block.body;
    const entity: Entity = {
      id: rawName,
      name: rawName,
      columns: [],
      iconHint: deriveIconHint(rawName),
      palette: derivePalette(rawName),
    };

    // Split on commas, but be smarter about nested structures like ARRAY<STRING> or MAP<K,V>
    const lines = splitColumnDefinitions(body);

    for (let ln of lines) {
      ln = ln.trim();
      if (!ln) continue;

      // Skip comments
      if (ln.startsWith('--')) continue;

      // table-level CONSTRAINT ... PRIMARY KEY (...)
      const constraintPkMatch = ln.match(/constraint\s+\w+\s+primary\s+key\s*\(([^\)]+)(?:\)|$)/i);
      if (constraintPkMatch) {
        const cols = constraintPkMatch[1].split(',').map(s => s.replace(/[`\"]/g, '').trim());
        for (const cn of cols) {
          const col = entity.columns.find(c => c.name === cn);
          if (col) col.primary = true; else entity.columns.push({ name: cn, primary: true });
        }
        continue;
      }

      // table-level PRIMARY KEY (...)
      const pkMatch = ln.match(/primary\s+key\s*\(([^\)]+)(?:\)|$)/i);
      if (pkMatch) {
        const cols = pkMatch[1].split(',').map(s => s.replace(/[`\"]/g, '').trim());
        for (const cn of cols) {
          const col = entity.columns.find(c => c.name === cn);
          if (col) col.primary = true; else entity.columns.push({ name: cn, primary: true });
        }
        continue;
      }

      // table-level FOREIGN KEY (...) REFERENCES other_table(...)
      const fkMatch = ln.match(/foreign\s+key\s*\(([^\)]+)\)\s+references\s+([`\"]?[\w\.]+[`\"]?)\s*\(([^\)]+)(?:\)|$)/i);
      if (fkMatch) {
        const fromCols = fkMatch[1].split(',').map(s => s.replace(/[`\"]/g, '').trim());
        const toTable = fkMatch[2].replace(/[`\"]/g, '').split('.').pop() || fkMatch[2];
        const toCols = fkMatch[3].split(',').map(s => s.replace(/[`\"]/g, '').trim());
        for (let i = 0; i < fromCols.length; i++) {
          const from = fromCols[i];
          const to = toCols[i] || toCols[0];
          relationships.push({ id: `${entity.name}.${from}->${toTable}.${to}`, from: { entity: entity.name, column: from }, to: { entity: toTable, column: to }, cardinality: 'many-to-one' });
          // mark source column as foreign
          const srcCol = entity.columns.find(c => c.name === from);
          if (srcCol) srcCol.foreign = true;
        }
        continue;
      }

      // column definition - enhanced to handle complex types like ARRAY<STRING>, MAP<K,V>, STRUCT<...>
      const colMatch = parseColumnDefinition(ln);
      if (colMatch) {
        const { name: colName, type: colType, rest } = colMatch;
        const col: Column = { name: colName, type: colType };

        // Check for NOT NULL
        if (/not\s+null/i.test(rest)) {
          col.nullable = false;
        } else if (/null/i.test(rest) && !/not\s+null/i.test(rest)) {
          col.nullable = true;
        }

        if (/primary\s+key/i.test(rest) || /primary\s+key/i.test(ln)) col.primary = true;
        if (/unique/i.test(rest) || /unique/i.test(ln)) col.unique = true;

        // Extract comment if present
        const commentMatch = rest.match(/--\s*(.+)$/) || rest.match(/comment\s+'([^']+)'/i);
        if (commentMatch) {
          col.comment = commentMatch[1].trim();
        }

        entity.columns.push(col);

        // inline FOREIGN KEY in column definitions (e.g., references other_table(id))
        const inlineRef = rest.match(/references\s+([`\"]?\w+[`\"]?)\s*\(([^\)]+)\)/i);
        if (inlineRef) {
          const toTable = inlineRef[1].replace(/[`\"]/g, '');
          const toCol = inlineRef[2].replace(/[`\"]/g, '').trim();
          relationships.push({ id: `${entity.name}.${colName}->${toTable}.${toCol}`, from: { entity: entity.name, column: colName }, to: { entity: toTable, column: toCol }, cardinality: 'many-to-one' });
          col.foreign = true;
        }

        // Check for FK comment hint (e.g., "-- FK to table.column")
        const fkCommentMatch = rest.match(/--\s*FK\s+to\s+([\w.]+)/i);
        if (fkCommentMatch) {
          col.foreign = true;
          const parts = fkCommentMatch[1].split('.');
          if (parts.length >= 2) {
            const toTable = parts[parts.length - 2];
            const toCol = parts[parts.length - 1];
            relationships.push({
              id: `${entity.name}.${colName}->${toTable}.${toCol}`,
              from: { entity: entity.name, column: colName },
              to: { entity: toTable, column: toCol },
              cardinality: 'many-to-one'
            });
          }
        }
        continue;
      }

      // inline primary key fallback
      const inlinePk = ln.match(/([`\"]?\w+[`\"]?).*primary\s+key/i);
      if (inlinePk) {
        const name = inlinePk[1].replace(/[`\"]/g, '');
        const col = entity.columns.find(c => c.name === name);
        if (col) col.primary = true; else entity.columns.push({ name, primary: true });
      }
    }
    entities.push(entity);
  }

  // ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ... OR ALTER TABLE ... ADD FOREIGN KEY ...
  let m: RegExpExecArray | null;
  const alterFk1 = /alter\s+table\s+([`\"]?\w+[`\"]?)\s+add\s+constraint[\s\S]*?foreign\s+key\s*\(([^\)]+)\)\s+references\s+([`\"]?\w+[`\"]?)\s*\(([^\)]+)\)/gi;
  const alterFk2 = /alter\s+table\s+([`\"]?\w+[`\"]?)\s+add\s+foreign\s+key\s*\(([^\)]+)\)\s+references\s+([`\"]?\w+[`\"]?)\s*\(([^\)]+)\)/gi;
  while ((m = alterFk1.exec(normalized)) || (m = alterFk2.exec(normalized))) {
    const tbl = m[1].replace(/[`\"]/g, '');
    const fromCols = m[2].split(',').map((s: string) => s.replace(/[`\"]/g, '').trim());
    const toTable = m[3].replace(/[`\"]/g, '');
    const toCols = m[4].split(',').map((s: string) => s.replace(/[`\"]/g, '').trim());
    for (let i = 0; i < fromCols.length; i++) {
      relationships.push({ id: `${tbl}.${fromCols[i]}->${toTable}.${toCols[i] || toCols[0]}`, from: { entity: tbl, column: fromCols[i] }, to: { entity: toTable, column: toCols[i] || toCols[0] }, cardinality: 'many-to-one' });
      // mark source column as foreign in the matching entity if present
      const ent = entities.find(en => en.name === tbl);
      if (ent) {
        const c = ent.columns.find(col => col.name === fromCols[i]);
        if (c) c.foreign = true;
      }
    }
  }

  return { entities, relationships };
}

/**
 * Strips SQL comments (both -- and / * ... * /) while respecting quoted strings
 */
function stripComments(sql: string): string {
  let result = '';
  let i = 0;
  const len = sql.length;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBackTick = false;

  while (i < len) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inSingleQuote) {
      if (char === "'" && sql[i - 1] !== '\\') inSingleQuote = false;
      result += char;
      i++;
      continue;
    }
    if (inDoubleQuote) {
      if (char === '"' && sql[i - 1] !== '\\') inDoubleQuote = false;
      result += char;
      i++;
      continue;
    }
    if (inBackTick) {
      if (char === '`' && sql[i - 1] !== '\\') inBackTick = false;
      result += char;
      i++;
      continue;
    }

    // Check for quotes starter
    if (char === "'") { inSingleQuote = true; result += char; i++; continue; }
    if (char === '"') { inDoubleQuote = true; result += char; i++; continue; }
    if (char === '`') { inBackTick = true; result += char; i++; continue; }

    // Check for comments
    if (char === '-' && next === '-') {
      // Skip until newline
      i += 2;
      while (i < len && sql[i] !== '\n') i++;
      result += '\n'; // Keep newline to preserve formatting if needed
      if (i < len) i++;
      continue;
    }
    if (char === '/' && next === '*') {
      // Skip until */
      i += 2;
      while (i < len && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    result += char;
    i++;
  }
  return result;
}

/**
 * Splits column definitions while being aware of nested angle brackets (for generic types)
 * and parentheses (for precision specs like DECIMAL(10,2))
 */
function splitColumnDefinitions(body: string): string[] {
  const lines: string[] = [];
  let current = '';
  let angleDepth = 0;
  let parenDepth = 0;

  for (let i = 0; i < body.length; i++) {
    const char = body[i];

    if (char === '<') angleDepth++;
    else if (char === '>') angleDepth = Math.max(0, angleDepth - 1);
    else if (char === '(') parenDepth++;
    else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);

    if (char === ',' && angleDepth === 0 && parenDepth === 0) {
      if (current.trim()) lines.push(current.trim());
      current = '';
    } else if (char === '\n' && angleDepth === 0 && parenDepth === 0 && current.trim().endsWith(',')) {
      // Handle comma at end of line
      current = current.trim().slice(0, -1);
      if (current.trim()) lines.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) lines.push(current.trim());
  return lines;
}

/**
 * Parses a column definition line, handling complex types like:
 * - ARRAY<STRING>
 * - MAP<STRING, STRING>
 * - STRUCT<field1: STRING, field2: INT>
 * - DECIMAL(10, 2)
 * - VARCHAR(255)
 */
function parseColumnDefinition(line: string): { name: string; type: string; rest: string } | null {
  // Remove leading/trailing whitespace
  line = line.trim();

  const lower = line.toLowerCase();

  // Skip constraint lines - robust check
  if (lower.startsWith('constraint ') ||
    lower.startsWith('primary key ') ||
    lower.startsWith('foreign key ') ||
    lower.startsWith('unique ') ||
    lower.startsWith('check ')) {
    return null;
  }

  // Match column name (with optional quotes/backticks)
  const nameMatch = line.match(/^([`\"]?[\w]+[`\"]?)\s+/i);
  if (!nameMatch) return null;

  const name = nameMatch[1].replace(/[`\"]/g, '');
  let remaining = line.slice(nameMatch[0].length);

  // Parse the type, handling nested angle brackets and parentheses
  let type = '';
  let angleDepth = 0;
  let parenDepth = 0;
  let i = 0;

  for (; i < remaining.length; i++) {
    const char = remaining[i];

    if (char === '<') {
      angleDepth++;
      type += char;
    } else if (char === '>') {
      angleDepth = Math.max(0, angleDepth - 1);
      type += char;
    } else if (char === '(') {
      parenDepth++;
      type += char;
    } else if (char === ')') {
      if (parenDepth > 0) {
        parenDepth--;
        type += char;
      } else {
        // End of column definition in some dialects
        break;
      }
    } else if ((char === ' ' || char === '\t') && angleDepth === 0 && parenDepth === 0) {
      // End of type
      break;
    } else if (char === ',' && angleDepth === 0 && parenDepth === 0) {
      // End of column definition
      break;
    } else {
      type += char;
    }
  }

  const rest = remaining.slice(i);

  if (!type) return null;

  return { name, type: type.trim(), rest };
}


function findTableBlocks(sql: string) {
  const blocks: { name: string; body: string }[] = [];
  const startRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?([`\"]?[\w.]+[`\"]?)\s*\(/gi;
  let match;

  while ((match = startRegex.exec(sql))) {
    const rawName = match[1];
    const startIndex = startRegex.lastIndex;

    // Manual scan for balanced body
    let balance = 1;
    let i = startIndex;
    let inString = false;
    let quoteChar = '';

    for (; i < sql.length; i++) {
      const char = sql[i];
      if (inString) {
        if (char === quoteChar && sql[i - 1] !== '\\') {
          inString = false;
        }
        continue;
      }

      if (char === "'" || char === '"' || char === '`') {
        inString = true;
        quoteChar = char;
        continue;
      }

      if (char === '(') balance++;
      else if (char === ')') {
        balance--;
        if (balance === 0) break;
      }
    }

    if (balance === 0) {
      const body = sql.substring(startIndex, i);
      const name = rawName.replace(/[`"]/g, '').split('.').pop() || rawName;
      blocks.push({ name, body });

      // Advance regex to avoid re-matching inside body
      startRegex.lastIndex = i + 1;
    }
  }
  return blocks;
}
