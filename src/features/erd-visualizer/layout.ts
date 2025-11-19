import { layout as dagreLayout, graphlib } from 'dagre';
import { Entity, LayoutPosition, SchemaModel } from './model';

export type AutoLayoutMap = Record<string, LayoutPosition>;

const NODE_WIDTH = 320;
const HEADER_HEIGHT = 48;
const ROW_HEIGHT = 28;
const MIN_ROWS = 4;

export function computeAutoLayout(model: SchemaModel): AutoLayoutMap {
  const g = new graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 200, ranksep: 260 });
  g.setDefaultEdgeLabel(() => ({}));

  model.entities.forEach(entity => {
    g.setNode(entity.name, {
      width: NODE_WIDTH,
      height: estimateHeight(entity),
    });
  });

  if (model.relationships && model.relationships.length) {
    for (const rel of model.relationships) {
      const from = rel.from?.entity;
      const to = rel.to?.entity;
      if (from && to && from !== to) {
        g.setEdge(from, to);
      }
    }
  }

  dagreLayout(g);

  const fallbackSpacingX = 420;
  const fallbackSpacingY = 300;
  const result: AutoLayoutMap = {};
  model.entities.forEach((entity, index) => {
    const node = g.node(entity.name);
    if (node && typeof node.x === 'number' && typeof node.y === 'number') {
      result[entity.name] = {
        x: node.x - node.width / 2,
        y: node.y - node.height / 2,
      };
    } else {
      const col = index % 3;
      const row = Math.floor(index / 3);
      result[entity.name] = {
        x: col * fallbackSpacingX,
        y: row * fallbackSpacingY,
      };
    }
  });

  return result;
}

function estimateHeight(entity: Entity): number {
  const rows = Math.max(entity.columns?.length || 0, MIN_ROWS);
  return HEADER_HEIGHT + rows * ROW_HEIGHT;
}

