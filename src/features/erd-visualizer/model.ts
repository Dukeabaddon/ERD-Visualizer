export type EntityKind = 'table' | 'view';
export type IconHint = 'person' | 'default';
export type PaletteName = 'blue' | 'green' | 'purple' | 'red' | 'yellow';

export interface LayoutPosition {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface Column {
  name: string;
  type?: string;
  primary?: boolean;
  unique?: boolean;
  nullable?: boolean;
  foreign?: boolean;
  comment?: string;
}

export interface Entity {
  id: string; // same as name for now
  name: string;
  columns: Column[];
  kind?: EntityKind;
  comment?: string;
  iconHint?: IconHint;
  palette?: PaletteName;
  layout?: LayoutPosition;
}

export type Cardinality =
  | 'one-to-one'
  | 'one-to-many'
  | 'many-to-one'
  | 'many-to-many'
  | 'one-and-only-one'
  | string;

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
