"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

type MapRotationProps = {
    bearing?: number;
};

export default function MapRotation({
    bearing = 77,
}: MapRotationProps) {
    const map = useMap();

    useEffect(() => {
        if (!map.setBearing) {
            return;
        }

        map.setBearing(bearing);
    }, [map, bearing]);

    return null;
}