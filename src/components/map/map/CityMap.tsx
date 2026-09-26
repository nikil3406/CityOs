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
import VehicleFeature from "../features/VehicleFeature";

import FeatureInfoPanel from "../panels/FeatureInfoPannel";

import MapBounds from "./MapBounds";
import MapMask from "./MapMask";
import MapRotation from "./MapRotation";
import { useSimulationVehicles } from "../hooks/useSimulationVehicles";

import type {
    Building,
    City,
    Contour,
    Intersection,
    Road,
    Tree,
    WaterArea,
    WaterLine,
    VisibleLayers,
} from "../types/map.types";

type CityMapProps = {
    selectedCityId: number;
    setSelectedCityId: (
        id: number,
    ) => void;
    visibleLayers: VisibleLayers;
    cities: City[];
    roads: Road[];
    intersections: Intersection[];
    buildings: Building[];
    trees: Tree[];
    waterAreas: WaterArea[];
    waterLines: WaterLine[];
    contours: Contour[];
    boundary: [number, number][][];
    loading: boolean;
    error: string | null;
};

export default function CityMap({
    selectedCityId,
    setSelectedCityId,
    visibleLayers,
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
}: CityMapProps) {
    /*
     * Temporary simulation ID.
     *
     * We will later replace this with
     * a simulation selected from the dashboard.
     */
    const simulationId = 50;

    /*
     * Fetch simulation vehicle positions
     * every 3 seconds.
     */
    const simulationVehicles =
        useSimulationVehicles(
            simulationId,
        );

    const [
        selectedRoadId,
        setSelectedRoadId,
    ] = useState<number | null>(null);

    const [
        selectedIntersectionId,
        setSelectedIntersectionId,
    ] = useState<number | null>(null);

    const [
        selectedBuildingId,
        setSelectedBuildingId,
    ] = useState<number | null>(null);

    const [
        selectedTreeId,
        setSelectedTreeId,
    ] = useState<number | null>(null);

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

    const clearSelection = () => {
        setSelectedRoadId(null);
        setSelectedIntersectionId(null);
        setSelectedBuildingId(null);
        setSelectedTreeId(null);
        setSelectedWaterAreaId(null);
        setSelectedWaterLineId(null);
        setSelectedContourId(null);
    };

    const toggleRoadSelection = (
        id: number,
    ) => {
        setSelectedRoadId((currentId) =>
            currentId === id
                ? null
                : id,
        );
    };

    const toggleIntersectionSelection = (
        id: number,
    ) => {
        setSelectedIntersectionId(
            (currentId) =>
                currentId === id
                    ? null
                    : id,
        );
    };

    const toggleBuildingSelection = (
        id: number,
    ) => {
        setSelectedBuildingId(
            (currentId) =>
                currentId === id
                    ? null
                    : id,
        );
    };

    const toggleTreeSelection = (
        id: number,
    ) => {
        setSelectedTreeId((currentId) =>
            currentId === id
                ? null
                : id,
        );
    };

    const toggleWaterAreaSelection = (
        id: number,
    ) => {
        setSelectedWaterAreaId(
            (currentId) =>
                currentId === id
                    ? null
                    : id,
        );
    };

    const toggleWaterLineSelection = (
        id: number,
    ) => {
        setSelectedWaterLineId(
            (currentId) =>
                currentId === id
                    ? null
                    : id,
        );
    };

    const toggleContourSelection = (
        id: number,
    ) => {
        setSelectedContourId(
            (currentId) =>
                currentId === id
                    ? null
                    : id,
        );
    };

    const selectedRoad = roads.find(
        (road) =>
            road.id === selectedRoadId,
    );

    const selectedIntersection =
        intersections.find(
            (intersection) =>
                intersection.id ===
                selectedIntersectionId,
        );

    const selectedBuilding = buildings.find(
        (building) =>
            building.id ===
            selectedBuildingId,
    );

    const selectedTree = trees.find(
        (tree) =>
            tree.id === selectedTreeId,
    );

    const selectedWaterArea =
        waterAreas.find(
            (waterArea) =>
                waterArea.id ===
                selectedWaterAreaId,
        );

    const selectedWaterLine =
        waterLines.find(
            (waterLine) =>
                waterLine.id ===
                selectedWaterLineId,
        );

    const selectedContour = contours.find(
        (contour) =>
            contour.id ===
            selectedContourId,
    );

    const selectedFeature =
        selectedRoad
            ? {
                  type: "road" as const,
                  feature: selectedRoad,
              }
            : selectedIntersection
                ? {
                      type: "intersection" as const,
                      feature:
                          selectedIntersection,
                  }
                : selectedBuilding
                    ? {
                          type: "building" as const,
                          feature:
                              selectedBuilding,
                      }
                    : selectedTree
                        ? {
                              type: "tree" as const,
                              feature:
                                  selectedTree,
                          }
                        : selectedWaterArea
                            ? {
                                  type: "waterArea" as const,
                                  feature:
                                      selectedWaterArea,
                              }
                            : selectedWaterLine
                                ? {
                                      type: "waterLine" as const,
                                      feature:
                                          selectedWaterLine,
                                  }
                                : selectedContour
                                    ? {
                                          type: "contour" as const,
                                          feature:
                                              selectedContour,
                                      }
                                    : null;

    return (
        <div className="relative h-full w-full">
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

            {!loading &&
                !error &&
                boundary.length === 0 && (
                    <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-white/90">
                        <div className="rounded-xl border bg-white p-5 text-center shadow-lg">
                            <h2 className="text-sm font-semibold text-gray-900">
                                No map data available
                            </h2>

                            <p className="mt-2 text-sm text-gray-500">
                                This city does not
                                have geographic
                                data available
                                yet.
                            </p>
                        </div>
                    </div>
                )}

            <MapContainer
                center={[0, 0]}
                zoom={10}
                zoomSnap={0.5}
                zoomDelta={0.5}
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

                {visibleLayers.waterways &&
                    waterAreas.map(
                        (waterArea) => (
                            <WaterAreaFeature
                                key={
                                    waterArea.id
                                }
                                waterArea={
                                    waterArea
                                }
                                selected={
                                    selectedWaterAreaId ===
                                    waterArea.id
                                }
                                onSelect={
                                    toggleWaterAreaSelection
                                }
                            />
                        ),
                    )}

                {visibleLayers.waterways &&
                    waterLines.map(
                        (waterLine) => (
                            <WaterLineFeature
                                key={
                                    waterLine.id
                                }
                                waterLine={
                                    waterLine
                                }
                                selected={
                                    selectedWaterLineId ===
                                    waterLine.id
                                }
                                onSelect={
                                    toggleWaterLineSelection
                                }
                            />
                        ),
                    )}

                {visibleLayers.contours &&
                    contours.map(
                        (contour) => (
                            <ContourFeature
                                key={
                                    contour.id
                                }
                                contour={
                                    contour
                                }
                                selected={
                                    selectedContourId ===
                                    contour.id
                                }
                                onSelect={
                                    toggleContourSelection
                                }
                            />
                        ),
                    )}

                {visibleLayers.buildings &&
                    buildings.map(
                        (building) => (
                            <BuildingFeature
                                key={
                                    building.id
                                }
                                building={
                                    building
                                }
                                selected={
                                    selectedBuildingId ===
                                    building.id
                                }
                                onSelect={
                                    toggleBuildingSelection
                                }
                            />
                        ),
                    )}

                {visibleLayers.trees &&
                    trees
                        .filter(
                            (tree) =>
                                tree.id % 3 ===
                                0,
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

                {visibleLayers.roads &&
                    roads
                        .filter(
                            (road) =>
                                road.type?.toLowerCase() !==
                                "footway",
                        )
                        .map((road) => (
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

                {/*
                 * Simulation vehicles
                 *
                 * These are independent of the
                 * infrastructure layer controls.
                 */}
                {simulationVehicles.map(
                    (vehicle) => (
                        <VehicleFeature
                            key={vehicle.id}
                            vehicle={vehicle}
                        />
                    ),
                )}

                {boundary.length > 0 && (
                    <MapMask
                        boundary={boundary}
                    />
                )}

                {selectedFeature && (
                    <FeatureInfoPanel
                        selectedFeature={
                            selectedFeature
                        }
                        onClose={clearSelection}
                    />
                )}
            </MapContainer>
        </div>
    );
}