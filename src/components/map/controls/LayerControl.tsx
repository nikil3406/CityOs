"use client";

import type {
    Dispatch,
    SetStateAction,
} from "react";

import type { VisibleLayers } from "../types/map.types";

type LayerControlProps = {
    visibleLayers: VisibleLayers;
    setVisibleLayers: Dispatch<
        SetStateAction<VisibleLayers>
    >;
};

const layers: {
    key: keyof VisibleLayers;
    label: string;
}[] = [
    {
        key: "roads",
        label: "Roads",
    },
    {
        key: "intersections",
        label: "Intersections",
    },
    {
        key: "buildings",
        label: "Buildings",
    },
    {
        key: "trees",
        label: "Trees",
    },
    {
        key: "waterways",
        label: "Waterways",
    },
    {
        key: "contours",
        label: "Contours",
    },
];

export default function LayerControl({
    visibleLayers,
    setVisibleLayers,
}: LayerControlProps) {
    const toggleLayer = (
        layer: keyof VisibleLayers,
    ) => {
        setVisibleLayers((current) => ({
            ...current,
            [layer]: !current[layer],
        }));
    };

    return (
        <div className="absolute bottom-3 right-3 z-[1000] w-40 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-sm">
            <h3 className="mb-2 text-xs font-semibold text-slate-800">
                Map Layers
            </h3>

            <div className="space-y-1.5">
                {layers.map((layer) => (
                    <label
                        key={layer.key}
                        className="flex cursor-pointer items-center justify-between text-xs"
                    >
                        <span className="text-slate-600">
                            {layer.label}
                        </span>

                        <input
                            type="checkbox"
                            checked={
                                visibleLayers[
                                    layer.key
                                ]
                            }
                            onChange={() =>
                                toggleLayer(
                                    layer.key,
                                )
                            }
                            className="h-3.5 w-3.5 rounded border-slate-300"
                        />
                    </label>
                ))}
            </div>

            <div className="mt-2 flex gap-2 border-t border-slate-200 pt-2">
                <button
                    type="button"
                    onClick={() =>
                        setVisibleLayers({
                            roads: true,
                            intersections: true,
                            buildings: true,
                            trees: true,
                            waterways: true,
                            contours: true,
                        })
                    }
                    className="text-[11px] font-medium text-blue-600 hover:text-blue-700"
                >
                    Show all
                </button>

                <button
                    type="button"
                    onClick={() =>
                        setVisibleLayers({
                            roads: false,
                            intersections: false,
                            buildings: false,
                            trees: false,
                            waterways: false,
                            contours: false,
                        })
                    }
                    className="text-[11px] font-medium text-slate-500 hover:text-slate-700"
                >
                    Hide all
                </button>
            </div>
        </div>
    );
}