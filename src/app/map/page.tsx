"use client";

import dynamic from "next/dynamic";

const CityMap = dynamic(() => import("@/components/map/CityMap"), {
    ssr: false,
    loading: () => <div>Loading map...</div>,
});

export default function MapPage() {
    return <CityMap />;
}