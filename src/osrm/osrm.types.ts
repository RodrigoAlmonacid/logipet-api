// ============================================================
// OSRM types — espejo tipado de las respuestas de la API HTTP
// de OSRM v5/v26. No todos los campos vienen siempre; los que
// pueden faltar están marcados como opcionales.
//
// Documentación: https://project-osrm.org/docs/v5.5.1/api/
// ============================================================

/** Coordenada geográfica en el orden que usa OSRM: [longitud, latitud]. */
export type Coord = [number, number];

/** Geometría GeoJSON LineString. Viene cuando se pide geometries=geojson. */
export interface GeoJSONLineString {
  type: 'LineString';
  coordinates: Coord[];
}

/** Un waypoint snapped al grafo de ruteo por OSRM. */
export interface OsrmWaypoint {
  hint: string;
  distance: number;
  name: string;
  location: Coord;
}

// ------------------------------------------------------------
// /table
// ------------------------------------------------------------

export interface OsrmTableResponse {
  code: 'Ok' | string;
  durations: number[][]; // segundos, row-major: durations[i][j] = i→j
  distances?: number[][]; // metros, sólo si annotations=distance
  sources?: OsrmWaypoint[];
  destinations?: OsrmWaypoint[];
  fallback_speed_cells?: [number, number][];
}

// ------------------------------------------------------------
// /route
// ------------------------------------------------------------

export interface OsrmRouteLeg {
  distance: number; // metros
  duration: number; // segundos
  weight: number;
  weight_name?: string;
  summary?: string;
  steps?: OsrmRouteStep[];
  annotation?: Record<string, number[]>;
}

export interface OsrmRouteStep {
  distance: number;
  duration: number;
  geometry: GeoJSONLineString | string; // string si geometries=polyline
  name: string;
  mode?: string;
  maneuver?: {
    type: string;
    modifier?: string;
    location: Coord;
    bearing_after?: number;
    bearing_before?: number;
  };
}

export interface OsrmRoute {
  distance: number; // total metros
  duration: number; // total segundos
  weight: number;
  weight_name?: string;
  geometry: GeoJSONLineString | string;
  legs: OsrmRouteLeg[];
}

export interface OsrmRouteResponse {
  code: 'Ok' | string;
  routes: OsrmRoute[];
  waypoints: OsrmWaypoint[];
}

// ------------------------------------------------------------
// Salida normalizada que el resto del dominio va a consumir
// (no es la respuesta cruda de OSRM — la lavamos acá para no
// filtrar detalles internos a PlanRutaService).
// ------------------------------------------------------------

export interface TableResult {
  durations: number[][]; // segundos
  distances: number[][]; // metros
}

export interface RouteResult {
  geometry: GeoJSONLineString;
  distance: number; // metros totales
  duration: number; // segundos totales
}

export interface RouteSegment {
  /** El índice del vehículo (0..N-1) al que pertenece este segmento. */
  vehicle: number;
  /** La geometría recortada del recorrido de este vehículo. */
  geometry: GeoJSONLineString;
  /** Distancia total en metros. */
  distance: number;
  /** Duración total en segundos. */
  duration: number;
}
