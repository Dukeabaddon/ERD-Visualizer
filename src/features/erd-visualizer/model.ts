export interface Column {
  name: string;
  type?: string;
  primary?: boolean;
  unique?: boolean;
  nullable?: boolean;
  foreign?: boolean;
}

export interface Entity {
  id: string; // same as name for now
  name: string;
  columns: Column[];
}

export type Cardinality = 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many' | 'one-and-only-one';

export interface Relationship {
  id: string;
  from: { entity: string; column: string };
  to: { entity: string; column: string };
  cardinality: Cardinality;
  onDelete?: string;
  onUpdate?: string;
}

export interface SchemaModel {
  entities: Entity[];
  relationships: Relationship[];
}
