"use client";

import { useEffect, useState } from "react";
import { useMap } from "react-leaflet";

type MapMaskProps = {
    boundary: [number, number][][];
};

export default function MapMask({
    boundary,
}: MapMaskProps) {
    const map = useMap();

    const [mapSize, setMapSize] = useState({
        width: 0,
        height: 0,
    });

    const [boundaryPoints, setBoundaryPoints] =
        useState("");

    useEffect(() => {
        if (
            !boundary ||
            boundary.length === 0 ||
            !boundary[0] ||
            boundary[0].length === 0
        ) {
            return;
        }

        const updateMask = () => {
            const size = map.getSize();

            setMapSize({
                width: size.x,
                height: size.y,
            });

            const points = boundary[0]
                .map(
                    ([longitude, latitude]) => {
                        const point =
                            map.latLngToContainerPoint([
                                latitude,
                                longitude,
                            ]);

                        return `${point.x},${point.y}`;
                    },
                )
                .join(" ");

            setBoundaryPoints(points);
        };

        updateMask();

        map.on("move", updateMask);
        map.on("zoom", updateMask);
        map.on("resize", updateMask);

        return () => {
            map.off("move", updateMask);
            map.off("zoom", updateMask);
            map.off("resize", updateMask);
        };
    }, [map, boundary]);

    if (
        !boundaryPoints ||
        mapSize.width === 0 ||
        mapSize.height === 0
    ) {
        return null;
    }

    return (
        <svg
            className="pointer-events-none absolute inset-0 z-[500]"
            width="100%"
            height="100%"
            viewBox={`0 0 ${mapSize.width} ${mapSize.height}`}
            preserveAspectRatio="none"
        >
            <defs>
                <mask id="cityos-map-mask">
                    {/* Everything starts hidden */}
                    <rect
                        x="0"
                        y="0"
                        width={mapSize.width}
                        height={mapSize.height}
                        fill="white"
                    />

                    {/* CityOS area stays visible */}
                    <polygon
                        points={boundaryPoints}
                        fill="black"
                    />
                </mask>
            </defs>

            {/* Hide everything outside the CityOS boundary */}
            <rect
                x="0"
                y="0"
                width={mapSize.width}
                height={mapSize.height}
                fill="#f8fafc"
                mask="url(#cityos-map-mask)"
            />
        </svg>
    );
}