"use client";

import dynamic from "next/dynamic";

import type { VisibleLayers } from "./types/map.types";

const CityMap = dynamic(
    () => import("./map/CityMap"),
    {
        ssr: false,
    },
);

type CityMapClientProps = {
    visibleLayers: VisibleLayers;
};

export default function CityMapClient({
    visibleLayers,
}: CityMapClientProps) {
    return (
        <CityMap
            visibleLayers={visibleLayers}
        />
    );
}