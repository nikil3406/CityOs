export type City = {
    id: number;
    name: string;
    country: string;
    center: [number, number];
    boundary: {
        type: "Polygon";
        coordinates: [number, number][][];
    };
};

export type Road = {
    id: number;
    name: string;
    type: string | null;
    startIntersectionId: number | null;
    endIntersectionId: number | null;
    lengthMeters: number;
    speedLimitKmh: number | null;
    geometry: {
        type: "LineString";
        coordinates: [number, number][];
    };
};

export type Intersection = {
    id: number;
    name: string | null;
    location: [number, number];
};

export type Building = {
    id: number;
    height: number | null;
    minHeight: number | null;
    geometry: {
        type: "MultiPolygon";
        coordinates: number[][][][];
    };
};

export type Tree = {
    id: number;
    height: number | null;
    crownDiameter: number | null;
    location: {
        type: "Point";
        coordinates: [number, number];
    };
};

export type WaterArea = {
    id: number;
    cityId: number;
    geometry: {
        type: "MultiPolygon";
        coordinates: number[][][][];
    };
};

export type WaterLine = {
    id: number;
    cityId: number;
    geometry: {
        type: "MultiLineString";
        coordinates: number[][][];
    };
};

export type Contour = {
    id: number;
    cityId: number;
    elevation: number | null;
    geometry: {
        type: "LineString";
        coordinates: [number, number][];
    };
};

export type VisibleLayers = {
    roads: boolean;
    intersections: boolean;
    buildings: boolean;
    trees: boolean;
    waterways: boolean;
    contours: boolean;
};

export type SimulationVehicle = {
    id: number;
    simulationRunId: number;
    currentRoadId: number | null;
    destinationIntersectionId: number | null;
    routeSequence: number;
    progress: number;
    speedKmh: number;
    status: string;
    position: [number, number];
};