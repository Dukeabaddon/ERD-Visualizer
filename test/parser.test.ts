import { parseSchemaFromText } from '../src/features/erd-visualizer/parser';

const sample = `{
  "entities": [
    {
      "name": "User",
      "primaryKey": "UserID",
      "attributes": ["UserID", "Name", "Email"],
      "relationships": [
        { "type": "OneToMany", "target": "Order", "foreignKey": "UserID", "cardinality": "1..*" },
        { "type": "OneToOne", "target": "Profile", "foreignKey": "UserID", "cardinality": "1..1" }
      ]
    },
    {
      "name": "Order",
      "primaryKey": "OrderID",
      "attributes": ["OrderID", "TotalAmount", "UserID"],
      "relationships": [
        { "type": "ManyToOne", "target": "User", "foreignKey": "UserID", "cardinality": "*..1" },
        { "type": "ManyToMany", "target": "Product", "via": "OrderProduct", "cardinality": "*..*" }
      ]
    },
    {
      "name": "Profile",
      "primaryKey": "ProfileID",
      "attributes": ["ProfileID", "Address", "Phone", "UserID"],
      "relationships": [
        { "type": "OneToOne", "target": "User", "foreignKey": "UserID", "cardinality": "1..1" }
      ]
    },
    {
      "name": "Product",
      "primaryKey": "ProductID",
      "attributes": ["ProductID", "Name", "Price"]
    },
    {
      "name": "OrderProduct",
      "primaryKey": "OrderProductID",
      "attributes": ["OrderProductID", "OrderID", "ProductID"],
      "relationships": [
        { "type": "ManyToOne", "target": "Order", "foreignKey": "OrderID", "cardinality": "*..1" },
        { "type": "ManyToOne", "target": "Product", "foreignKey": "ProductID", "cardinality": "*..1" }
      ]
    }
  ]
}`;

test('parser normalizes alternate JSON ERD shape and returns entities and relationships', () => {
  const model = parseSchemaFromText(sample);
  expect(model).toBeDefined();
  expect(Array.isArray(model.entities)).toBe(true);
  // should find at least the 5 entities
  expect(model.entities.length).toBeGreaterThanOrEqual(5);
  // check for one known entity and that it has columns
  const user = model.entities.find(e => e.name === 'User' || e.id === 'User');
  expect(user).toBeDefined();
  if (user) {
    expect(Array.isArray(user.columns)).toBe(true);
    expect(user.columns.some((c: any) => c.name === 'UserID')).toBe(true);
  }
  // relationships: since normalization maps nested relationships, expect several relationships
  expect(Array.isArray(model.relationships)).toBe(true);
  expect(model.relationships.length).toBeGreaterThanOrEqual(3);
});
