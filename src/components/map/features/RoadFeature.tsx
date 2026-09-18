"use client";

import { memo } from "react";
import { Polyline } from "react-leaflet";

import type { Road } from "../types/map.types";

type RoadFeatureProps = {
    road: Road;
    selected: boolean;
    onSelect: (id: number) => void;
};

const RoadFeature = memo(
    function RoadFeature({
        road,
        selected,
        onSelect,
    }: RoadFeatureProps) {
        return (
            <Polyline
                positions={road.geometry.coordinates.map(
                    ([longitude, latitude]) =>
                        [
                            latitude,
                            longitude,
                        ] as [number, number],
                )}
                pathOptions={{
                    color: selected
                        ? "#2563eb"
                        : "#475569",
                    weight: selected ? 6 : 3,
                    opacity: 0.9,
                }}
                eventHandlers={{
                    click: () =>
                        onSelect(road.id),
                }}
            >
            </Polyline>
        );
    },
);

export default RoadFeature;