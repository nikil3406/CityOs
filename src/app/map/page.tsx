"use client";

import { useState } from "react";

import CityMapClient from "@/components/map/CityMapClient";
import { useCityMapData } from "@/components/map/hooks/useCityMapData";

import type { VisibleLayers } from "@/components/map/types/map.types";

export default function MapPage() {
    const [selectedCityId, setSelectedCityId] =
        useState(1);

    const [visibleLayers, setVisibleLayers] =
        useState<VisibleLayers>({
            roads: false,
            intersections: false,
            buildings: false,
            trees: false,
            waterways: false,
            contours: false,
        });

    const {
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
    } = useCityMapData(selectedCityId);

    return (
        <main className="h-screen w-full">
            <CityMapClient
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
        </main>
    );
}