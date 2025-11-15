"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSchemaFromText = parseSchemaFromText;
const zod_1 = require("zod");
// Very small SQL/JSON parser to extract tables, columns, PKs, and FKs for common patterns
const ColumnSchema = zod_1.z.object({
    name: zod_1.z.string(),
    type: zod_1.z.string().optional(),
    primary: zod_1.z.boolean().optional(),
    unique: zod_1.z.boolean().optional(),
    nullable: zod_1.z.boolean().optional(),
});
const EntitySchema = zod_1.z.object({
    name: zod_1.z.string(),
    columns: zod_1.z.array(ColumnSchema).optional(),
});
const RelationshipSchema = zod_1.z.object({
    from: zod_1.z.string(),
    to: zod_1.z.string(),
    cardinality: zod_1.z.string().optional(),
    onDelete: zod_1.z.string().optional(),
    onUpdate: zod_1.z.string().optional(),
});
const SchemaShape = zod_1.z.object({
    entities: zod_1.z.array(EntitySchema).optional(),
    relationships: zod_1.z.array(RelationshipSchema).optional(),
});
function parseSchemaFromText(text) {
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const obj = JSON.parse(text);
            // Accept canonical shape, but also try to normalize several alternate JSON ERD shapes
            let parsed = SchemaShape.safeParse(obj);
            if (!parsed.success) {
                const normalized = normalizeAlternateJsonShape(obj);
                if (normalized)
                    parsed = SchemaShape.safeParse(normalized);
            }
            if (parsed.success)
                return fromJsonShape(parsed.data);
        }
        catch (_) {
            // fallthrough to SQL
        }
    }
    return parseSql(text);
}
// Heuristic normalizer: map alternate ERD JSON shapes into the canonical schema shape
function normalizeAlternateJsonShape(obj) {
    if (!obj || !Array.isArray(obj.entities))
        return null;
    const norm = { entities: [], relationships: [] };
    function getPrimaryFromEntity(e) {
        if (!e)
            return undefined;
        if (e.primaryKey)
            return e.primaryKey;
        // if columns array with primary flag exists, return that
        if (Array.isArray(e.columns)) {
            const pk = e.columns.find((c) => c.primary || c.primary === true);
            if (pk)
                return pk.name;
        }
        // fallback to first attribute/column
        if (Array.isArray(e.attributes) && e.attributes.length)
            return e.attributes[0];
        if (Array.isArray(e.columns) && e.columns.length)
            return e.columns[0].name;
        return undefined;
    }
    // first pass: convert entities and attributes -> columns
    for (const e of obj.entities) {
        const cols = [];
        if (Array.isArray(e.columns)) {
            for (const c of e.columns)
                cols.push({ name: c.name, type: c.type, primary: !!c.primary, unique: !!c.unique, nullable: !!c.nullable });
        }
        if (Array.isArray(e.attributes)) {
            for (const a of e.attributes) {
                // avoid duplicates
                if (!cols.find(c => c.name === a))
                    cols.push({ name: a });
            }
        }
        const pk = getPrimaryFromEntity(e);
        if (pk && !cols.find(c => c.name === pk))
            cols.unshift({ name: pk, primary: true });
        else if (pk) {
            const c = cols.find(cc => cc.name === pk);
            if (c)
                c.primary = true;
        }
        norm.entities.push({ name: e.name, columns: cols });
    }
    // helper to lookup entity by name from original array
    function findOrigEntity(name) {
        return obj.entities.find((x) => x.name === name);
    }
    // helper to find column in an entity (by heuristics)
    function findViaColumn(viaEntity, term) {
        if (!viaEntity)
            return undefined;
        const cols = Array.isArray(viaEntity.columns) ? viaEntity.columns.map((c) => c.name) : (Array.isArray(viaEntity.attributes) ? viaEntity.attributes : []);
        if (!cols)
            return undefined;
        // try exact match against term + 'id' or term + 'Id' variants
        const variants = [term + 'ID', term + 'Id', term + 'id', term];
        for (const v of variants) {
            const found = cols.find((c) => c.toLowerCase() === v.toLowerCase());
            if (found)
                return found;
        }
        // fallback: find any column that contains the term
        const fuzzy = cols.find((c) => c.toLowerCase().includes(term.toLowerCase()));
        return fuzzy;
    }
    // second pass: convert nested relationships into top-level relationships
    for (const e of obj.entities) {
        if (!Array.isArray(e.relationships))
            continue;
        for (const r of e.relationships) {
            if (r.target && r.foreignKey) {
                norm.relationships.push({ from: `${e.name}.${r.foreignKey}`, to: `${r.target}.${r.foreignKey}`, cardinality: r.cardinality });
                continue;
            }
            // handle many-to-many via join table
            if (r.type && typeof r.type === 'string' && r.type.toLowerCase().includes('many') && r.via) {
                const via = r.via;
                const viaEntity = findOrigEntity(via);
                const targetEntity = findOrigEntity(r.target);
                const sourcePk = getPrimaryFromEntity(e) || (Array.isArray(e.attributes) ? e.attributes[0] : undefined);
                const targetPk = getPrimaryFromEntity(targetEntity) || (Array.isArray(targetEntity && targetEntity.attributes) ? targetEntity.attributes[0] : undefined);
                const viaColForSource = viaEntity ? findViaColumn(viaEntity, e.name) : undefined;
                const viaColForTarget = viaEntity ? findViaColumn(viaEntity, r.target) : undefined;
                if (viaEntity && viaColForSource && sourcePk) {
                    norm.relationships.push({ from: `${e.name}.${sourcePk}`, to: `${via}.${viaColForSource}`, cardinality: r.cardinality });
                }
                if (viaEntity && viaColForTarget && targetPk) {
                    norm.relationships.push({ from: `${r.target}.${targetPk}`, to: `${via}.${viaColForTarget}`, cardinality: r.cardinality });
                }
            }
        }
    }
    // If no relationships were added but there is a top-level relationships array in original, include them
    if (Array.isArray(obj.relationships) && obj.relationships.length) {
        for (const r of obj.relationships) {
            norm.relationships.push(r);
        }
    }
    return norm;
}
function fromJsonShape(obj) {
    const entities = [];
    const relationships = [];
    if (Array.isArray(obj.entities)) {
        for (const e of obj.entities) {
            const cols = [];
            for (const c of (e.columns || []))
                cols.push({ name: c.name, type: c.type, primary: !!c.primary, unique: !!c.unique, nullable: !!c.nullable });
            entities.push({ id: e.name, name: e.name, columns: cols });
        }
    }
    if (Array.isArray(obj.relationships)) {
        for (const r of obj.relationships) {
            const [fromEntity, fromCol] = r.from.split('.');
            const [toEntity, toCol] = r.to.split('.');
            relationships.push({ id: `${r.from}->${r.to}`, from: { entity: fromEntity, column: fromCol }, to: { entity: toEntity, column: toCol }, cardinality: r.cardinality || 'many-to-one', onDelete: r.onDelete, onUpdate: r.onUpdate });
        }
    }
    return { entities, relationships };
}
function parseSql(sql) {
    const entities = [];
    const relationships = [];
    const normalized = sql.replace(/\r\n/g, '\n');
    // match CREATE TABLE blocks
    const blockRegex = /create\s+table\s+([`\"]?\w+[`\"]?)\s*\(([\s\S]*?)\)\s*;/gi;
    let m;
    while ((m = blockRegex.exec(normalized))) {
        const rawName = m[1].replace(/[`\"]/g, '');
        const body = m[2];
        const entity = { id: rawName, name: rawName, columns: [] };
        // Split on commas that are followed by optional whitespace and a newline OR end of definition
        const lines = body.split(/,\s*\n|,\s*(?=[^\)]*$)/);
        for (let ln of lines) {
            ln = ln.trim();
            if (!ln)
                continue;
            // table-level PRIMARY KEY (...)
            const pkMatch = ln.match(/primary\s+key\s*\(([^\)]+)\)/i);
            if (pkMatch) {
                const cols = pkMatch[1].split(',').map(s => s.replace(/[`\"]/g, '').trim());
                for (const cn of cols) {
                    const col = entity.columns.find(c => c.name === cn);
                    if (col)
                        col.primary = true;
                    else
                        entity.columns.push({ name: cn, primary: true });
                }
                continue;
            }
            // table-level FOREIGN KEY (...) REFERENCES other_table(...)
            const fkMatch = ln.match(/foreign\s+key\s*\(([^\)]+)\)\s+references\s+([`\"]?[\w\.]+[`\"]?)\s*\(([^\)]+)\)/i);
            if (fkMatch) {
                const fromCols = fkMatch[1].split(',').map(s => s.replace(/[`\"]/g, '').trim());
                const toTable = fkMatch[2].replace(/[`\"]/g, '');
                const toCols = fkMatch[3].split(',').map(s => s.replace(/[`\"]/g, '').trim());
                for (let i = 0; i < fromCols.length; i++) {
                    const from = fromCols[i];
                    const to = toCols[i] || toCols[0];
                    relationships.push({ id: `${entity.name}.${from}->${toTable}.${to}`, from: { entity: entity.name, column: from }, to: { entity: toTable, column: to }, cardinality: 'many-to-one' });
                    // mark source column as foreign
                    const srcCol = entity.columns.find(c => c.name === from);
                    if (srcCol)
                        srcCol.foreign = true;
                }
                continue;
            }
            // column definition like `id` int(11) primary key,
            const colMatch = ln.match(/^([`\"]?\w+[`\"]?)\s+([\w\(\)]+)(.*)$/i);
            if (colMatch) {
                const colName = colMatch[1].replace(/[`\"]/g, '');
                const colType = colMatch[2];
                const rest = colMatch[3] || '';
                const col = { name: colName, type: colType };
                if (/primary\s+key/i.test(rest) || /primary\s+key/i.test(ln))
                    col.primary = true;
                if (/unique/i.test(rest) || /unique/i.test(ln))
                    col.unique = true;
                entity.columns.push(col);
                // inline FOREIGN KEY in column definitions (e.g., references other_table(id))
                const inlineRef = rest.match(/references\s+([`\"]?\w+[`\"]?)\s*\(([^\)]+)\)/i);
                if (inlineRef) {
                    const toTable = inlineRef[1].replace(/[`\"]/g, '');
                    const toCol = inlineRef[2].replace(/[`\"]/g, '').trim();
                    relationships.push({ id: `${entity.name}.${colName}->${toTable}.${toCol}`, from: { entity: entity.name, column: colName }, to: { entity: toTable, column: toCol }, cardinality: 'many-to-one' });
                    // mark this column as foreign
                    col.foreign = true;
                }
                continue;
            }
            // inline primary key fallback
            const inlinePk = ln.match(/([`\"]?\w+[`\"]?).*primary\s+key/i);
            if (inlinePk) {
                const name = inlinePk[1].replace(/[`\"]/g, '');
                const col = entity.columns.find(c => c.name === name);
                if (col)
                    col.primary = true;
                else
                    entity.columns.push({ name, primary: true });
            }
        }
        entities.push(entity);
    }
    // ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ... OR ALTER TABLE ... ADD FOREIGN KEY ...
    const alterFk1 = /alter\s+table\s+([`\"]?\w+[`\"]?)\s+add\s+constraint[\s\S]*?foreign\s+key\s*\(([^\)]+)\)\s+references\s+([`\"]?\w+[`\"]?)\s*\(([^\)]+)\)/gi;
    const alterFk2 = /alter\s+table\s+([`\"]?\w+[`\"]?)\s+add\s+foreign\s+key\s*\(([^\)]+)\)\s+references\s+([`\"]?\w+[`\"]?)\s*\(([^\)]+)\)/gi;
    while ((m = alterFk1.exec(normalized)) || (m = alterFk2.exec(normalized))) {
        const tbl = m[1].replace(/[`\"]/g, '');
        const fromCols = m[2].split(',').map((s) => s.replace(/[`\"]/g, '').trim());
        const toTable = m[3].replace(/[`\"]/g, '');
        const toCols = m[4].split(',').map((s) => s.replace(/[`\"]/g, '').trim());
        for (let i = 0; i < fromCols.length; i++) {
            relationships.push({ id: `${tbl}.${fromCols[i]}->${toTable}.${toCols[i] || toCols[0]}`, from: { entity: tbl, column: fromCols[i] }, to: { entity: toTable, column: toCols[i] || toCols[0] }, cardinality: 'many-to-one' });
            // mark source column as foreign in the matching entity if present
            const ent = entities.find(en => en.name === tbl);
            if (ent) {
                const c = ent.columns.find(col => col.name === fromCols[i]);
                if (c)
                    c.foreign = true;
            }
        }
    }
    return { entities, relationships };
}
//# sourceMappingURL=parser.js.map