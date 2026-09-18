"use client";

import { useState } from "react";

import {
    MapContainer,
    Polygon,
    TileLayer,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";
import "@tomickigrzegorz/leaflet-rotate";

import RoadFeature from "../features/RoadFeature";
import IntersectionFeature from "../features/IntersectionFeature";
import BuildingFeature from "../features/BuildingFeature";
import TreeFeature from "../features/TreeFeature";
import WaterAreaFeature from "../features/WaterAreaFeature";
import WaterLineFeature from "../features/WaterLineFeature";
import ContourFeature from "../features/ContourFeature";
import type { VisibleLayers } from "../types/map.types";

import FeatureInfoPanel from "../panels/FeatureInfoPannel";

import MapBounds from "./MapBounds";
import MapMask from "./MapMask";
import MapRotation from "./MapRotation";

import { useCityMapData } from "../hooks/useCityMapData";

type CityMapProps = {
    visibleLayers: VisibleLayers;
};

export default function CityMap({
    visibleLayers,
}: CityMapProps) {
    const [selectedCityId, setSelectedCityId] =
        useState(1);

    // --------------------------------
    // Selection state
    // --------------------------------

    const [selectedRoadId, setSelectedRoadId] =
        useState<number | null>(null);

    const [
        selectedIntersectionId,
        setSelectedIntersectionId,
    ] = useState<number | null>(null);

    const [
        selectedBuildingId,
        setSelectedBuildingId,
    ] = useState<number | null>(null);

    const [selectedTreeId, setSelectedTreeId] =
        useState<number | null>(null);

    const [
        selectedWaterAreaId,
        setSelectedWaterAreaId,
    ] = useState<number | null>(null);

    const [
        selectedWaterLineId,
        setSelectedWaterLineId,
    ] = useState<number | null>(null);

    const [
        selectedContourId,
        setSelectedContourId,
    ] = useState<number | null>(null);

    // --------------------------------
    // City map data
    // --------------------------------

    const {
        cities,
        roads,
        intersections,
        buildings,
        trees,
        waterAreas,
        waterLines,
        contours,
        boundary,
        loading,
        error,
    } = useCityMapData(selectedCityId);

    // --------------------------------
    // Selection handlers
    // --------------------------------

    const toggleRoadSelection = (id: number) => {
        setSelectedRoadId((currentId) =>
            currentId === id ? null : id,
        );
    };

    const toggleIntersectionSelection = (
        id: number,
    ) => {
        setSelectedIntersectionId((currentId) =>
            currentId === id ? null : id,
        );
    };

    const toggleBuildingSelection = (
        id: number,
    ) => {
        setSelectedBuildingId((currentId) =>
            currentId === id ? null : id,
        );
    };

    const toggleTreeSelection = (id: number) => {
        setSelectedTreeId((currentId) =>
            currentId === id ? null : id,
        );
    };

    const toggleWaterAreaSelection = (
        id: number,
    ) => {
        setSelectedWaterAreaId((currentId) =>
            currentId === id ? null : id,
        );
    };

    const toggleWaterLineSelection = (
        id: number,
    ) => {
        setSelectedWaterLineId((currentId) =>
            currentId === id ? null : id,
        );
    };

    const toggleContourSelection = (
        id: number,
    ) => {
        setSelectedContourId((currentId) =>
            currentId === id ? null : id,
        );
    };

    // --------------------------------
    // Clear all selections
    // --------------------------------

    const clearSelection = () => {
        setSelectedRoadId(null);
        setSelectedIntersectionId(null);
        setSelectedBuildingId(null);
        setSelectedTreeId(null);
        setSelectedWaterAreaId(null);
        setSelectedWaterLineId(null);
        setSelectedContourId(null);
    };

    // --------------------------------
    // Find selected features
    // --------------------------------

    const selectedRoad = roads.find(
        (road) => road.id === selectedRoadId,
    );

    const selectedIntersection =
        intersections.find(
            (intersection) =>
                intersection.id ===
                selectedIntersectionId,
        );

    const selectedBuilding = buildings.find(
        (building) =>
            building.id === selectedBuildingId,
    );

    const selectedTree = trees.find(
        (tree) => tree.id === selectedTreeId,
    );

    const selectedWaterArea = waterAreas.find(
        (waterArea) =>
            waterArea.id === selectedWaterAreaId,
    );

    const selectedWaterLine = waterLines.find(
        (waterLine) =>
            waterLine.id === selectedWaterLineId,
    );

    const selectedContour = contours.find(
        (contour) =>
            contour.id === selectedContourId,
    );

    // --------------------------------
    // Unified selected feature
    // --------------------------------

    const selectedFeature =
        selectedRoad
            ? {
                type: "road" as const,
                feature: selectedRoad,
            }
            : selectedIntersection
                ? {
                    type: "intersection" as const,
                    feature: selectedIntersection,
                }
                : selectedBuilding
                    ? {
                        type: "building" as const,
                        feature: selectedBuilding,
                    }
                    : selectedTree
                        ? {
                            type: "tree" as const,
                            feature: selectedTree,
                        }
                        : selectedWaterArea
                            ? {
                                type: "waterArea" as const,
                                feature: selectedWaterArea,
                            }
                            : selectedWaterLine
                                ? {
                                    type: "waterLine" as const,
                                    feature: selectedWaterLine,
                                }
                                : selectedContour
                                    ? {
                                        type: "contour" as const,
                                        feature: selectedContour,
                                    }
                                    : null;

    // --------------------------------
    // Selection status
    // --------------------------------

    return (
        <div className="relative h-full w-full">
            {/* City selector */}

            <div className="absolute left-4 top-4 z-[1000]">
                <select
                    value={selectedCityId}
                    onChange={(event) => {
                        clearSelection();

                        setSelectedCityId(
                            Number(
                                event.target.value,
                            ),
                        );
                    }}
                    className="rounded-md border bg-white px-4 py-2 text-sm shadow-md"
                >
                    {cities.map((city) => (
                        <option
                            key={city.id}
                            value={city.id}
                        >
                            {city.name},{" "}
                            {city.country}
                        </option>
                    ))}
                </select>
            </div>

            {/* Map */}
            {loading && (
                <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-white/80 backdrop-blur-sm">
                    <div className="rounded-lg border bg-white px-5 py-3 text-sm font-medium text-gray-700 shadow-md">
                        Loading city data...
                    </div>
                </div>
            )}

            {error && !loading && (
                <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-white/90 backdrop-blur-sm">
                    <div className="w-80 rounded-xl border bg-white p-5 text-center shadow-lg">
                        <h2 className="text-sm font-semibold text-gray-900">
                            Unable to load city data
                        </h2>

                        <p className="mt-2 text-sm text-gray-500">
                            {error}
                        </p>

                        <button
                            type="button"
                            onClick={() =>
                                window.location.reload()
                            }
                            className="mt-4 rounded-lg border px-4 py-2 text-sm font-medium transition hover:bg-gray-50"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            )}

            <MapContainer
                center={[0, 0]}
                zoom={10}
                rotate={true}
                bearing={77}
                dragRotate={false}
                touchRotate={false}
                shiftKeyRotate={false}
                style={{
                    height: "100%",
                    width: "100%",
                }}
                maxBoundsViscosity={1.0}
            >
                <TileLayer
                    attribution="&copy; OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* City boundary */}

                {boundary.length > 0 && (
                    <>
                        <MapRotation
                            bearing={77}
                        />

                        <MapBounds
                            boundary={boundary}
                        />

                        <Polygon
                            positions={boundary[0].map(
                                ([
                                    longitude,
                                    latitude,
                                ]) =>
                                    [
                                        latitude,
                                        longitude,
                                    ] as [
                                        number,
                                        number,
                                    ],
                            )}
                            pathOptions={{
                                fillOpacity: 0,
                                color: "#3388ff",
                                weight: 3,
                            }}
                        />
                    </>
                )}

                {/* Waterways */}

                {visibleLayers.waterways &&
                    waterAreas.map((waterArea) => (
                        <WaterAreaFeature
                            key={waterArea.id}
                            waterArea={waterArea}
                            selected={
                                selectedWaterAreaId ===
                                waterArea.id
                            }
                            onSelect={
                                toggleWaterAreaSelection
                            }
                        />
                    ))}

                {visibleLayers.waterways &&
                    waterLines.map((waterLine) => (
                        <WaterLineFeature
                            key={waterLine.id}
                            waterLine={waterLine}
                            selected={
                                selectedWaterLineId ===
                                waterLine.id
                            }
                            onSelect={
                                toggleWaterLineSelection
                            }
                        />
                    ))}

                {/* Contours */}

                {visibleLayers.contours &&
                    contours.map((contour) => (
                        <ContourFeature
                            key={contour.id}
                            contour={contour}
                            selected={
                                selectedContourId ===
                                contour.id
                            }
                            onSelect={
                                toggleContourSelection
                            }
                        />
                    ))}

                {/* Buildings */}

                {visibleLayers.buildings &&
                    buildings.map((building) => (
                        <BuildingFeature
                            key={building.id}
                            building={building}
                            selected={
                                selectedBuildingId ===
                                building.id
                            }
                            onSelect={
                                toggleBuildingSelection
                            }
                        />
                    ))}

                {/* Trees */}

                {visibleLayers.trees &&
                    trees
                        .filter(
                            (tree) =>
                                tree.id % 3 === 0,
                        )
                        .map((tree) => (
                            <TreeFeature
                                key={tree.id}
                                tree={tree}
                                selected={
                                    selectedTreeId ===
                                    tree.id
                                }
                                onSelect={
                                    toggleTreeSelection
                                }
                            />
                        ))}

                {/* Roads */}

                {visibleLayers.roads &&
                    roads.map((road) => (
                        <RoadFeature
                            key={road.id}
                            road={road}
                            selected={
                                selectedRoadId ===
                                road.id
                            }
                            onSelect={
                                toggleRoadSelection
                            }
                        />
                    ))}

                {/* Intersections */}

                {visibleLayers.intersections &&
                    intersections.map(
                        (intersection) => (
                            <IntersectionFeature
                                key={
                                    intersection.id
                                }
                                intersection={
                                    intersection
                                }
                                selected={
                                    selectedIntersectionId ===
                                    intersection.id
                                }
                                onSelect={
                                    toggleIntersectionSelection
                                }
                            />
                        ),
                    )}

                {/* City mask */}

                {boundary.length > 0 && (
                    <MapMask
                        boundary={boundary}
                    />
                )}

                {/* Feature information */}

                {selectedFeature && (
                    <FeatureInfoPanel
                        selectedFeature={selectedFeature}
                        onClose={clearSelection}
                    />
                )}
            </MapContainer>
        </div>
    );
}