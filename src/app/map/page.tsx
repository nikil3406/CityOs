"use client";

import { useState } from "react";

import CityMap from "@/components/map/map/CityMap";

import type { VisibleLayers } from "@/components/map/types/map.types";

export default function MapPage() {
    const [visibleLayers, setVisibleLayers] =
        useState<VisibleLayers>({
            roads: false,
            intersections: false,
            buildings: false,
            trees: false,
            waterways: false,
            contours: false,
        });

    return (
        <main className="h-screen w-full">
            <CityMap
                visibleLayers={visibleLayers}
            />
        </main>
    );
}