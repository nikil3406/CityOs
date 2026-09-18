"use client";

import type {
    Building,
    Contour,
    Intersection,
    Road,
    Tree,
    WaterArea,
    WaterLine,
} from "../types/map.types";

type SelectedFeature =
    | {
          type: "road";
          feature: Road;
      }
    | {
          type: "intersection";
          feature: Intersection;
      }
    | {
          type: "building";
          feature: Building;
      }
    | {
          type: "tree";
          feature: Tree;
      }
    | {
          type: "waterArea";
          feature: WaterArea;
      }
    | {
          type: "waterLine";
          feature: WaterLine;
      }
    | {
          type: "contour";
          feature: Contour;
      };

type FeatureInfoPanelProps = {
    selectedFeature: SelectedFeature;
    onClose: () => void;
};

export default function FeatureInfoPanel({
    selectedFeature,
    onClose,
}: FeatureInfoPanelProps) {
    const { type, feature } = selectedFeature;

    return (
        <div className="absolute right-4 top-4 z-[1000] w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
            <PanelHeader
                title={getFeatureTitle(type)}
                onClose={onClose}
            />

            <div className="space-y-3 p-4">
                {type === "road" && (
                    <RoadDetails road={feature} />
                )}

                {type === "intersection" && (
                    <IntersectionDetails
                        intersection={feature}
                    />
                )}

                {type === "building" && (
                    <BuildingDetails
                        building={feature}
                    />
                )}

                {type === "tree" && (
                    <TreeDetails tree={feature} />
                )}

                {type === "waterArea" && (
                    <WaterAreaDetails
                        waterArea={feature}
                    />
                )}

                {type === "waterLine" && (
                    <WaterLineDetails
                        waterLine={feature}
                    />
                )}

                {type === "contour" && (
                    <ContourDetails
                        contour={feature}
                    />
                )}
            </div>

            <div className="border-t border-gray-200 p-3">
                <button
                    type="button"
                    onClick={onClose}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                    Clear selection
                </button>
            </div>
        </div>
    );
}

function PanelHeader({
    title,
    onClose,
}: {
    title: string;
    onClose: () => void;
}) {
    return (
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                    CityOS
                </p>

                <h2 className="text-sm font-bold text-gray-900">
                    {title}
                </h2>
            </div>

            <button
                type="button"
                onClick={onClose}
                aria-label="Close feature information"
                className="rounded-md px-2 py-1 text-lg leading-none text-gray-400 transition hover:bg-gray-100 hover:text-gray-900"
            >
                ×
            </button>
        </div>
    );
}

function RoadDetails({
    road,
}: {
    road: Road;
}) {
    return (
        <>
            <InfoRow
                label="ID"
                value={road.id}
            />

            <InfoRow
                label="Name"
                value={road.name}
            />

            <InfoRow
                label="Length"
                value={`${road.lengthMeters} m`}
            />

            <InfoRow
                label="Speed limit"
                value={
                    road.speedLimitKmh !== null
                        ? `${road.speedLimitKmh} km/h`
                        : "—"
                }
            />

            <InfoRow
                label="Start intersection"
                value={
                    road.startIntersectionId ??
                    "—"
                }
            />

            <InfoRow
                label="End intersection"
                value={
                    road.endIntersectionId ??
                    "—"
                }
            />
        </>
    );
}

function IntersectionDetails({
    intersection,
}: {
    intersection: Intersection;
}) {
    return (
        <>
            <InfoRow
                label="ID"
                value={intersection.id}
            />

            <InfoRow
                label="Name"
                value={
                    intersection.name ?? "Unnamed"
                }
            />

            <InfoRow
                label="Latitude"
                value={
                    intersection.location[1].toFixed(
                        6,
                    )
                }
            />

            <InfoRow
                label="Longitude"
                value={
                    intersection.location[0].toFixed(
                        6,
                    )
                }
            />
        </>
    );
}

function BuildingDetails({
    building,
}: {
    building: Building;
}) {
    return (
        <>
            <InfoRow
                label="ID"
                value={building.id}
            />

            <InfoRow
                label="Height"
                value={
                    building.height !== null
                        ? `${building.height} m`
                        : "—"
                }
            />

            <InfoRow
                label="Minimum height"
                value={
                    building.minHeight !== null
                        ? `${building.minHeight} m`
                        : "—"
                }
            />
        </>
    );
}

function TreeDetails({
    tree,
}: {
    tree: Tree;
}) {
    return (
        <>
            <InfoRow
                label="ID"
                value={tree.id}
            />

            <InfoRow
                label="Height"
                value={
                    tree.height !== null
                        ? `${tree.height} m`
                        : "—"
                }
            />

            <InfoRow
                label="Crown diameter"
                value={
                    tree.crownDiameter !== null
                        ? `${tree.crownDiameter} m`
                        : "—"
                }
            />

            <InfoRow
                label="Latitude"
                value={tree.location.coordinates[1].toFixed(
                    6,
                )}
            />

            <InfoRow
                label="Longitude"
                value={tree.location.coordinates[0].toFixed(
                    6,
                )}
            />
        </>
    );
}

function WaterAreaDetails({
    waterArea,
}: {
    waterArea: WaterArea;
}) {
    return (
        <>
            <InfoRow
                label="ID"
                value={waterArea.id}
            />

            <InfoRow
                label="City ID"
                value={waterArea.cityId}
            />

            <InfoRow
                label="Geometry"
                value="MultiPolygon"
            />
        </>
    );
}

function WaterLineDetails({
    waterLine,
}: {
    waterLine: WaterLine;
}) {
    return (
        <>
            <InfoRow
                label="ID"
                value={waterLine.id}
            />

            <InfoRow
                label="City ID"
                value={waterLine.cityId}
            />

            <InfoRow
                label="Geometry"
                value="MultiLineString"
            />
        </>
    );
}

function ContourDetails({
    contour,
}: {
    contour: Contour;
}) {
    return (
        <>
            <InfoRow
                label="ID"
                value={contour.id}
            />

            <InfoRow
                label="City ID"
                value={contour.cityId}
            />

            <InfoRow
                label="Elevation"
                value={
                    contour.elevation !== null
                        ? `${contour.elevation} m`
                        : "—"
                }
            />
        </>
    );
}

function InfoRow({
    label,
    value,
}: {
    label: string;
    value: string | number;
}) {
    return (
        <div className="flex items-start justify-between gap-4">
            <span className="text-sm text-gray-500">
                {label}
            </span>

            <span className="max-w-[170px] break-words text-right text-sm font-medium text-gray-900">
                {value}
            </span>
        </div>
    );
}

function getFeatureTitle(
    type: SelectedFeature["type"],
): string {
    switch (type) {
        case "road":
            return "Road";

        case "intersection":
            return "Intersection";

        case "building":
            return "Building";

        case "tree":
            return "Tree";

        case "waterArea":
            return "Water Area";

        case "waterLine":
            return "Water Line";

        case "contour":
            return "Contour";
    }
}