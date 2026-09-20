"use client";

import { memo } from "react";
import { Polyline } from "react-leaflet";

import type { WaterLine } from "../types/map.types";
import { toLatLngList } from "../utils/map.utils";

type WaterLineFeatureProps = {
    waterLine: WaterLine;
    selected: boolean;
    onSelect: (id: number) => void;
};

const WaterLineFeature = memo(
    function WaterLineFeature({
        waterLine,
        selected,
        onSelect,
    }: WaterLineFeatureProps) {
        return (
            <>
                {waterLine.geometry.coordinates.map(
                    (line, lineIndex) => (
                        <Polyline
                            key={`${waterLine.id}-${lineIndex}`}
                            positions={toLatLngList(
                                line as [number, number][],
                            )}
                            pathOptions={{
                                color: selected
                                    ? "#1d4ed8"
                                    : "#0284c7",
                                weight: selected
                                    ? 6
                                    : 3,
                                opacity: 0.8,
                            }}
                            eventHandlers={{
                                click: () =>
                                    onSelect(
                                        waterLine.id,
                                    ),
                            }}
                        >
                        </Polyline>
                    ),
                )}
            </>
        );
    },
);

export default WaterLineFeature;