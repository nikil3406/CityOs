"use client";

import { memo } from "react";
import { Polygon } from "react-leaflet";

import type { WaterArea } from "../types/map.types";
import { toLatLngPolygon } from "../utils/map.utils";

type WaterAreaFeatureProps = {
    waterArea: WaterArea;
    selected: boolean;
    onSelect: (id: number) => void;
};

const WaterAreaFeature = memo(
    function WaterAreaFeature({
        waterArea,
        selected,
        onSelect,
    }: WaterAreaFeatureProps) {
        return (
            <>
                {waterArea.geometry.coordinates.map(
                    (polygon, polygonIndex) => (
                        <Polygon
                            key={`${waterArea.id}-${polygonIndex}`}
                            positions={toLatLngPolygon(polygon)}
                            pathOptions={{
                                color: selected
                                    ? "#1d4ed8"
                                    : "#0284c7",
                                fillColor: selected
                                    ? "#60a5fa"
                                    : "#38bdf8",
                                fillOpacity: 0.55,
                                weight: selected
                                    ? 3
                                    : 1,
                            }}
                            eventHandlers={{
                                click: () =>
                                    onSelect(
                                        waterArea.id,
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

export default WaterAreaFeature;