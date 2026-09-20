"use client";

import { memo } from "react";
import { Polyline } from "react-leaflet";

import type { Contour } from "../types/map.types";
import { toLatLngList } from "../utils/map.utils";

type ContourFeatureProps = {
    contour: Contour;
    selected: boolean;
    onSelect: (id: number) => void;
};

const ContourFeature = memo(
    function ContourFeature({
        contour,
        selected,
        onSelect,
    }: ContourFeatureProps) {
        return (
            <Polyline
                positions={toLatLngList(
                    contour.geometry.coordinates,
                )}
                pathOptions={{
                    color: selected
                        ? "#57534e"
                        : "#a8a29e",
                    weight: selected ? 3 : 1,
                    opacity: 0.45,
                    dashArray: "4 4",
                }}
                eventHandlers={{
                    click: () =>
                        onSelect(contour.id),
                }}
            >
            </Polyline>
        );
    },
);

export default ContourFeature;