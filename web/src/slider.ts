/** Slider continuo diretto↔divertente: genera il custom_model per-richiesta
 *  da inviare sopra il profilo `slider_base` (di=15, nessuna penalità: è
 *  l'inviluppo minimo ammissibile per la prep LM — si può solo penalizzare).
 *
 *  k=0   → distance_influence 90, nessuna penalità (≈ fast)
 *  k=100 → distance_influence 15 + penalità piene (≈ curvy)
 *  I gruppi con condizioni sovrapposte restano catene if/else_if, altrimenti
 *  i multiply_by si comporrebbero tra loro.
 */
interface Statement {
  if?: string;
  else_if?: string;
  multiply_by: string;
}

export interface CustomModel {
  distance_influence: number;
  priority: Statement[];
}

const GROUPS: [string, number][][] = [
  [
    ['road_class == MOTORWAY', 0.15],
    ['road_class == TRUNK', 0.5],
    ['road_class == PRIMARY', 0.7],
    ['road_class == RESIDENTIAL', 0.5],
    ['road_class == LIVING_STREET', 0.3],
    ['road_class == SERVICE', 0.3],
    ['road_class == TRACK', 0.2],
  ],
  [['road_environment == TUNNEL', 0.5]],
  [
    ['urban_density == CITY', 0.4],
    ['urban_density == RESIDENTIAL', 0.7],
  ],
  [
    ['fun_curvature < 5', 0.55],
    ['fun_curvature < 25', 0.7],
    ['fun_curvature < 45', 0.85],
  ],
  [
    ['fun_signals >= 4', 0.55],
    ['fun_signals >= 2', 0.75],
  ],
];

// fondo cattivo: penalità piena e COSTANTE (sicurezza in moto, fuori dallo slider)
const SURFACE: Statement[] = [
  {
    if: 'surface == GRAVEL || surface == FINE_GRAVEL || surface == DIRT || surface == GROUND || surface == UNPAVED || surface == SAND || surface == COBBLESTONE || surface == COMPACTED',
    multiply_by: '0.2',
  },
  {
    if: 'smoothness == BAD || smoothness == VERY_BAD || smoothness == HORRIBLE || smoothness == VERY_HORRIBLE || smoothness == IMPASSABLE',
    multiply_by: '0.3',
  },
];

export function sliderToModel(k: number): CustomModel {
  const t = Math.min(100, Math.max(0, k)) / 100;
  const priority: Statement[] =
    t < 0.01
      ? []
      : GROUPS.flatMap((group) =>
          group.map(([cond, target], i) => {
            const mul = 1 - (1 - target) * t;
            return i === 0
              ? { if: cond, multiply_by: mul.toFixed(3) }
              : { else_if: cond, multiply_by: mul.toFixed(3) };
          }),
        );
  return {
    distance_influence: Math.round(90 - 75 * t),
    priority: [...priority, ...SURFACE],
  };
}
