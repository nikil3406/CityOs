"use client";

import dynamic from "next/dynamic";

const CityMap = dynamic(
    () => import("./CityMap"),
    {
        ssr: false,
    },
);

export default function CityMapClient() {
    return <CityMap />;
}