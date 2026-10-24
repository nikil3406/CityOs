"use client";

import dynamic from "next/dynamic";

import type {
    Building,
    City,
    Contour,
    Intersection,
    Road,
    Tree,
    WaterArea,
    WaterLine,
    VisibleLayers,
} from "./types/map.types";

const CityMap = dynamic(
    () => import("./map/CityMap"),
    {
        ssr: false,
    },
);

type CityMapClientProps = {
    selectedCityId: number;
    selectedSimulationId: number | null;
    simulationStatus: string | null;
    setSelectedCityId: (
        id: number,
    ) => void;

    visibleLayers: VisibleLayers;

    cities: City[];
    roads: Road[];
    intersections: Intersection[];
    buildings: Building[];
    trees: Tree[];
    waterAreas: WaterArea[];
    waterLines: WaterLine[];
    contours: Contour[];

    boundary: [number, number][][];
    loading: boolean;
    error: string | null;
    routeIntersectionIds?: number[];
    sourceIntersectionId?: number | null;
    destinationIntersectionId?: number | null;
    onIntersectionSelect?: (id: number) => void;
    signalIndicators?: { intersectionId: number; state: string }[];
    routeCoordinates?: [number, number][];
    routePreviews?: { strategy: "SHORTEST_DISTANCE" | "FASTEST_TIME"; routeGeometry: [number, number][]; selected: boolean }[];
};

export default function CityMapClient({
    selectedCityId,
    selectedSimulationId,
    simulationStatus,
    setSelectedCityId,
    visibleLayers,
    cities,
    roads,
    intersections,
    buildings,
    trees,
    waterAreas,
    waterLines,
    contours,
    boundary,
    loading,
    error,
    routeIntersectionIds = [],
    sourceIntersectionId = null,
    destinationIntersectionId = null,
    onIntersectionSelect,
    signalIndicators = [],
    routeCoordinates = [],
    routePreviews = [],
}: CityMapClientProps) {
    return (
        <CityMap
            selectedCityId={selectedCityId}
            setSelectedCityId={
                setSelectedCityId
            }
            selectedSimulationId={selectedSimulationId}
            simulationStatus={simulationStatus}
            visibleLayers={visibleLayers}
            cities={cities}
            roads={roads}
            intersections={intersections}
            buildings={buildings}
            trees={trees}
            waterAreas={waterAreas}
            waterLines={waterLines}
            contours={contours}
            boundary={boundary}
            loading={loading}
            error={error}
            routeIntersectionIds={routeIntersectionIds}
            sourceIntersectionId={sourceIntersectionId}
            destinationIntersectionId={destinationIntersectionId}
            onIntersectionSelect={onIntersectionSelect}
            signalIndicators={signalIndicators}
            routeCoordinates={routeCoordinates}
            routePreviews={routePreviews}
        />
    );
}
