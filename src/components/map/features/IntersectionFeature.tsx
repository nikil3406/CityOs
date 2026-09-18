"use client";

import { memo } from "react";
import {
    CircleMarker
} from "react-leaflet";

import type { Intersection } from "../types/map.types";

type IntersectionFeatureProps = {
    intersection: Intersection;
    selected: boolean;
    onSelect: (id: number) => void;
};

const IntersectionFeature = memo(
    function IntersectionFeature({
        intersection,
        selected,
        onSelect,
    }: IntersectionFeatureProps) {
        return (
            <CircleMarker
                center={[
                    intersection.location[1],
                    intersection.location[0],
                ]}
                radius={selected ? 8 : 5}
                pathOptions={{
                    color: selected
                        ? "#2563eb"
                        : "#475569",
                    fillColor: selected
                        ? "#bfdbfe"
                        : "#ffffff",
                    fillOpacity: 1,
                    weight: 2,
                }}
                eventHandlers={{
                    click: () =>
                        onSelect(
                            intersection.id,
                        ),
                }}
            >
            </CircleMarker>
        );
    },
);

export default IntersectionFeature;