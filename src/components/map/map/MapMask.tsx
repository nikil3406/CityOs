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

    const [points, setPoints] =
        useState<string>("");

    useEffect(() => {
        if (
            !boundary.length ||
            !boundary[0]?.length
        ) {
            return;
        }

        const updateMask = () => {
            const projected = boundary[0].map(
                ([longitude, latitude]) => {
                    const point =
                        map.latLngToContainerPoint([
                            latitude,
                            longitude,
                        ]);

                    return `${point.x},${point.y}`;
                },
            );

            setPoints(projected.join(" "));
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

    if (!points) {
        return null;
    }

    const size = map.getSize();

    return (
        <svg
            className="pointer-events-none absolute inset-0 z-[500]"
            width="100%"
            height="100%"
            viewBox={`0 0 ${size.x} ${size.y}`}
            preserveAspectRatio="none"
        >
            <defs>
                <mask id="cityos-map-mask">
                    <rect
                        x="0"
                        y="0"
                        width="100%"
                        height="100%"
                        fill="white"
                    />

                    <polygon
                        points={points}
                        fill="black"
                    />
                </mask>
            </defs>

            <rect
                x="0"
                y="0"
                width="100%"
                height="100%"
                fill="#f8fafc"
                mask="url(#cityos-map-mask)"
            />
        </svg>
    );
}