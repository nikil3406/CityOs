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
};

export default function CityMapClient({
    selectedCityId,
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
}: CityMapClientProps) {
    return (
        <CityMap
            selectedCityId={selectedCityId}
            setSelectedCityId={
                setSelectedCityId
            }
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
        />
    );
}