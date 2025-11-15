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
            const parsed = SchemaShape.safeParse(obj);
            if (parsed.success)
                return fromJsonShape(parsed.data);
        }
        catch (_) {
            // fallthrough to SQL
        }
    }
    return parseSql(text);
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