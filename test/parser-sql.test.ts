import { parseSchemaFromText } from '../src/features/erd-visualizer/parser';

const sqlSample = `
CREATE TABLE "User" (
  "UserID" int PRIMARY KEY,
  "Name" varchar(100)
);

CREATE TABLE "Order" (
  "OrderID" int PRIMARY KEY,
  "UserID" int,
  FOREIGN KEY ("UserID") REFERENCES "User"("UserID")
);
`;

test('parser parses SQL CREATE TABLE and extracts relationships', () => {
  const model = parseSchemaFromText(sqlSample);
  expect(model).toBeDefined();
  expect(Array.isArray(model.entities)).toBe(true);
  const user = model.entities.find(e => e.name === 'User' || e.id === 'User');
  const order = model.entities.find(e => e.name === 'Order' || e.id === 'Order');
  expect(user).toBeDefined();
  expect(order).toBeDefined();
  expect(Array.isArray(model.relationships)).toBe(true);
  // relationship should exist from Order.UserID -> User.UserID
  const rel = model.relationships.find(r => r.id && r.id.includes('Order.UserID') && r.id.includes('User.UserID'));
  expect(rel).toBeDefined();
});
