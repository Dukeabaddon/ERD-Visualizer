import { parseSchemaFromText } from '../src/features/erd-visualizer/parser';

const sample = `{
  "entities": [
    {
      "name": "Order",
      "primaryKey": "OrderID",
      "attributes": ["OrderID", "TotalAmount", "UserID"],
      "relationships": [
        { "type": "ManyToMany", "target": "Product", "via": "OrderProduct", "cardinality": "*..*" }
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

test('many-to-many via join table produces relationships to via table', () => {
  const model = parseSchemaFromText(sample);
  expect(model).toBeDefined();
  // Expect relationships to include Order.OrderID -> OrderProduct.OrderID and Product.ProductID -> OrderProduct.ProductID
  const hasOrderToVia = model.relationships.some(r => r.id && r.id.includes('Order.OrderID') && r.id.includes('OrderProduct'));
  const hasProductToVia = model.relationships.some(r => r.id && r.id.includes('Product.ProductID') && r.id.includes('OrderProduct'));
  expect(hasOrderToVia).toBe(true);
  expect(hasProductToVia).toBe(true);
});
