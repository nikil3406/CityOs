"use client";

import { memo } from "react";
import { Polygon } from "react-leaflet";

import type { Building } from "../types/map.types";
import { toLatLngPolygon } from "../utils/map.utils";

type BuildingFeatureProps = {
    building: Building;
    selected: boolean;
    onSelect: (id: number) => void;
};

const BuildingFeature = memo(
    function BuildingFeature({
        building,
        selected,
        onSelect,
    }: BuildingFeatureProps) {
        return (
            <>
                {building.geometry.coordinates.map(
                    (polygon, polygonIndex) => (
                        <Polygon
                            key={`${building.id}-${polygonIndex}`}
                            positions={toLatLngPolygon(polygon)}
                            pathOptions={{
                                color: selected
                                    ? "#2563eb"
                                    : "#64748b",
                                fillColor: selected
                                    ? "#93c5fd"
                                    : "#cbd5e1",
                                fillOpacity: 0.85,
                                weight: selected
                                    ? 3
                                    : 1,
                            }}
                            eventHandlers={{
                                click: () =>
                                    onSelect(
                                        building.id,
                                    ),
                            }}
                        >
                        </Polygon>
                    ),
                )}
            </>
        );
    },
);

export default BuildingFeature;