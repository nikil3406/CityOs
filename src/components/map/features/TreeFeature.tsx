"use client";

import { memo } from "react";
import {
    CircleMarker
} from "react-leaflet";

import type { Tree } from "../types/map.types";

type TreeFeatureProps = {
    tree: Tree;
    selected: boolean;
    onSelect: (id: number) => void;
};

const TreeFeature = memo(
    function TreeFeature({
        tree,
        selected,
        onSelect,
    }: TreeFeatureProps) {
        const [longitude, latitude] =
            tree.location.coordinates;

        return (
            <CircleMarker
                center={[
                    latitude,
                    longitude,
                ]}
                radius={selected ? 5 : 2}
                pathOptions={{
                    color: selected
                        ? "#2563eb"
                        : "#166534",
                    fillColor: selected
                        ? "#93c5fd"
                        : "#22c55e",
                    fillOpacity: 0.65,
                    weight: selected ? 2 : 0.7,
                }}
                eventHandlers={{
                    click: () =>
                        onSelect(tree.id),
                }}
            >
            </CircleMarker>
        );
    },
);

export default TreeFeature;