"use client";

import { memo } from "react";
import { Polyline } from "react-leaflet";

import type { Road } from "../types/map.types";
import { toLatLngList } from "../utils/map.utils";

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
                positions={toLatLngList(
                    road.geometry.coordinates,
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