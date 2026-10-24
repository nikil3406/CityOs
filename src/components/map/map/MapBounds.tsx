"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

type MapBoundsProps = {
    boundary: [number, number][][];
};

export default function MapBounds({
    boundary,
}: MapBoundsProps) {
    const map = useMap();

    useEffect(() => {
        if (
            boundary.length === 0 ||
            boundary[0]?.length === 0
        ) {
            return;
        }

        const coordinates = boundary[0].map(
            ([longitude, latitude]) =>
                [latitude, longitude] as [
                    number,
                    number,
                ],
        );

        const bounds = L.latLngBounds(coordinates);

        const fittedZoom = map.getBoundsZoom(
            bounds,
            false,
            L.point(0, 0),
        );

        const defaultZoom = fittedZoom + 0.5;

        // First move the map to the correct position
        // and zoom level.
        map.setView(
            bounds.getCenter(),
            defaultZoom,
            {
                animate: false,
            },
        );

        // Only after the map has been positioned,
        // prevent further zooming out.
        map.setMinZoom(defaultZoom);

        // Leave room to pan around the city, including its lower and edge
        // areas, without Leaflet snapping the view back at the exact boundary.
        map.setMaxBounds(bounds.pad(0.75));
    }, [map, boundary]);

    return null;
}
