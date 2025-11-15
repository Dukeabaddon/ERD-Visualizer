"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const parser_1 = require("./parser");
// simple tests that can be run with vitest
const exampleSql = `
CREATE TABLE users (
  id serial primary key,
  email varchar(255) not null
);

CREATE TABLE orders (
  id serial primary key,
  user_id integer,
  product varchar(255),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`;
const model = (0, parser_1.parseSchemaFromText)(exampleSql);
if (model.entities.length !== 2) {
    throw new Error('expected 2 entities');
}
const users = model.entities.find(e => e.name === 'users');
if (!users)
    throw new Error('users table not found');
const orders = model.entities.find(e => e.name === 'orders');
if (!orders)
    throw new Error('orders table not found');
if (model.relationships.length < 1)
    throw new Error('expected at least 1 relationship');
console.log('parser.spec ran OK');
// JSON canonical shape test
const exampleJson = JSON.stringify({
    entities: [
        { name: 'users', columns: [{ name: 'id', primary: true }, { name: 'email' }] },
        { name: 'orders', columns: [{ name: 'id', primary: true }, { name: 'user_id' }] }
    ],
    relationships: [{ from: 'orders.user_id', to: 'users.id', cardinality: 'many-to-one' }]
});
const jsonModel = (0, parser_1.parseSchemaFromText)(exampleJson);
if (jsonModel.entities.length !== 2)
    throw new Error('expected 2 entities from JSON');
if (jsonModel.relationships.length !== 1)
    throw new Error('expected 1 relationship from JSON');
console.log('parser.json test OK');
//# sourceMappingURL=parser.spec.js.map