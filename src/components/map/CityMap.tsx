"use client";

import { useEffect, useState } from "react";
import {
    CircleMarker,
    MapContainer,
    Polygon,
    Polyline,
    Popup,
    TileLayer,
    useMap,
} from "react-leaflet";

import L from "leaflet";
import "leaflet/dist/leaflet.css";

type City = {
    id: number;
    name: string;
    country: string;
    center: [number, number];
    boundary: {
        type: "Polygon";
        coordinates: [number, number][][];
    };
};

type Road = {
    id: number;
    name: string;
    geometry: {
        type: "LineString";
        coordinates: [number, number][];
    };
};

type Building = {
    id: number;
    height: number | null;
    minHeight: number | null;
    geometry: {
        type: "MultiPolygon";
        coordinates: number[][][][];
    };
};

type Intersection = {
    id: number;
    name: string | null;
    location: [number, number];
};

type Tree = {
    id: number;
    height: number | null;
    crownDiameter: number | null;
    location: {
        type: "Point";
        coordinates: [number, number];
    };
};

type WaterArea = {
    id: number;
    cityId: number;
    geometry: {
        type: "MultiPolygon";
        coordinates: number[][][][];
    };
};

type WaterLine = {
    id: number;
    cityId: number;
    geometry: {
        type: "MultiLineString";
        coordinates: number[][][];
    };
};

type Contour = {
    id: number;
    cityId: number;
    elevation: number | null;
    geometry: {
        type: "LineString";
        coordinates: [number, number][];
    };
};

function MapBounds({
    boundary,
}: {
    boundary: [number, number][][];
}) {
    const map = useMap();

    useEffect(() => {
        if (!boundary || boundary.length === 0) return;

        const coordinates = boundary[0].map(
            ([longitude, latitude]) =>
                [latitude, longitude] as [number, number],
        );

        const bounds = L.latLngBounds(coordinates);

        map.fitBounds(bounds, {
            padding: [5, 5],
        });

        map.setMaxBounds(bounds);
        map.options.maxBoundsViscosity = 1.0;
    }, [map, boundary]);

    return null;
}

function MapMask({
    boundary,
}: {
    boundary: [number, number][][];
}) {
    if (!boundary || boundary.length === 0) return null;

    const outerBoundary: [number, number][] = [
        [-89.9, -179.9],
        [-89.9, 179.9],
        [89.9, 179.9],
        [89.9, -179.9],
        [-89.9, -179.9],
    ];

    const cityBoundary = boundary[0].map(
        ([longitude, latitude]) =>
            [latitude, longitude] as [number, number],
    );

    return (
        <Polygon
            positions={[outerBoundary, cityBoundary]}
            pathOptions={{
                fillColor: "#f8fafc",
                fillOpacity: 0.98,
                stroke: false,
            }}
        />
    );
}

export default function CityMap() {
    const [cities, setCities] = useState<City[]>([]);
    const [selectedCityId, setSelectedCityId] =
        useState<number>(1);

    const [roads, setRoads] = useState<Road[]>([]);
    const [intersections, setIntersections] =
        useState<Intersection[]>([]);

    const [boundary, setBoundary] =
        useState<[number, number][][]>([]);

    const [buildings, setBuildings] = useState<Building[]>([]);

    const [trees, setTrees] = useState<Tree[]>([]);

    const [waterAreas, setWaterAreas] = useState<WaterArea[]>([]);
    const [waterLines, setWaterLines] = useState<WaterLine[]>([]);

    const [contours, setContours] = useState<Contour[]>([]);

    useEffect(() => {
        async function fetchCities() {
            try {
                const response =
                    await fetch("/api/cities");

                if (!response.ok) {
                    throw new Error(
                        "Failed to fetch cities",
                    );
                }

                const data: City[] =
                    await response.json();

                setCities(data);

                const selectedCity = data.find(
                    (city) =>
                        city.id === selectedCityId,
                );

                if (selectedCity?.boundary) {
                    setBoundary(
                        selectedCity.boundary.coordinates,
                    );
                } else {
                    setBoundary([]);
                }
            } catch (error) {
                console.error(
                    "Failed to load cities:",
                    error,
                );

                setCities([]);
                setBoundary([]);
            }
        }

        fetchCities();
    }, [selectedCityId]);

    useEffect(() => {
        async function fetchMapData() {
            try {
                const [
                    roadsResponse,
                    intersectionsResponse,
                    buildingsResponse,
                    treesResponse,
                    waterwaysResponse,
                    contoursResponse,
                ] = await Promise.all([
                    fetch(`/api/roads?cityId=${selectedCityId}`),
                    fetch(`/api/intersections?cityId=${selectedCityId}`),
                    fetch(`/api/buildings?cityId=${selectedCityId}`),
                    fetch(`/api/trees?cityId=${selectedCityId}`),
                    fetch(`/api/waterways?cityId=${selectedCityId}`),
                    fetch(`/api/contours?cityId=${selectedCityId}`),
                ]);

                if (
                    !roadsResponse.ok ||
                    !intersectionsResponse.ok ||
                    !buildingsResponse.ok ||
                    !treesResponse.ok ||
                    !waterwaysResponse.ok ||
                    !contoursResponse.ok
                ) {
                    throw new Error("Failed to fetch map data");
                }

                const roadsData: Road[] =
                    await roadsResponse.json();

                const intersectionsData: Intersection[] =
                    await intersectionsResponse.json();

                const buildingsData: Building[] =
                    await buildingsResponse.json();

                const treesData: Tree[] = await treesResponse.json();

                const waterwaysData: {
                    areas: WaterArea[];
                    lines: WaterLine[];
                } = await waterwaysResponse.json();

                const contoursData: Contour[] =
                    await contoursResponse.json();

                setRoads(roadsData);
                setIntersections(intersectionsData);
                setBuildings(buildingsData);
                setTrees(treesData);
                setWaterAreas(waterwaysData.areas);
                setWaterLines(waterwaysData.lines);
                setContours(contoursData);
            } catch (error) {
                console.error(
                    "Failed to load map data:",
                    error,
                );

                setRoads([]);
                setIntersections([]);
                setBuildings([]);
                setTrees([]);
                setWaterAreas([]);
                setWaterLines([]);
                setContours([]);
            }
        }

        fetchMapData();
    }, [selectedCityId]);

    return (
        <div className="relative h-screen w-full">            <div className="absolute left-4 top-4 z-[1000]">
            <select
                value={selectedCityId}
                onChange={(event) =>
                    setSelectedCityId(
                        Number(
                            event.target.value,
                        ),
                    )
                }
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

            <MapContainer
                center={[0, 0]}
                zoom={2}
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

                {waterAreas.map((waterArea) =>
                    waterArea.geometry.coordinates.map(
                        (polygon, polygonIndex) => (
                            <Polygon
                                key={`${waterArea.id}-${polygonIndex}`}
                                positions={polygon.map((ring) =>
                                    ring.map(
                                        ([longitude, latitude]) =>
                                            [latitude, longitude] as [
                                                number,
                                                number,
                                            ],
                                    ),
                                )}
                                pathOptions={{
                                    color: "#0284c7",
                                    fillColor: "#38bdf8",
                                    fillOpacity: 0.55,
                                    weight: 1,
                                }}
                            >
                                <Popup>
                                    <div>
                                        <p>Water area {waterArea.id}</p>
                                    </div>
                                </Popup>
                            </Polygon>
                        ),
                    ),
                )}

                {waterLines.map((waterLine) =>
                    waterLine.geometry.coordinates.map(
                        (line, lineIndex) => (
                            <Polyline
                                key={`${waterLine.id}-${lineIndex}`}
                                positions={line.map(
                                    ([longitude, latitude]) =>
                                        [latitude, longitude] as [
                                            number,
                                            number,
                                        ],
                                )}
                                pathOptions={{
                                    color: "#0284c7",
                                    weight: 3,
                                    opacity: 0.8,
                                }}
                            >
                                <Popup>
                                    <div>
                                        <p>Waterway {waterLine.id}</p>
                                    </div>
                                </Popup>
                            </Polyline>
                        ),
                    ),
                )}

                {contours.map((contour) => (
                    <Polyline
                        key={contour.id}
                        positions={contour.geometry.coordinates.map(
                            ([longitude, latitude]) =>
                                [latitude, longitude] as [number, number],
                        )}
                        pathOptions={{
                            color: "#a8a29e",
                            weight: 1,
                            opacity: 0.45,
                            dashArray: "4 4",
                        }}
                    >
                        <Popup>
                            <div>
                                <p>Contour {contour.id}</p>
                                <p>
                                    Elevation:{" "}
                                    {contour.elevation ?? "Unknown"} m
                                </p>
                            </div>
                        </Popup>
                    </Polyline>
                ))}

                {buildings.map((building) =>
                    building.geometry.coordinates.map(
                        (polygon, polygonIndex) => (
                            <Polygon
                                key={`${building.id}-${polygonIndex}`}
                                positions={polygon.map((ring) =>
                                    ring.map(
                                        ([longitude, latitude]) =>
                                            [latitude, longitude] as [
                                                number,
                                                number,
                                            ],
                                    ),
                                )}
                                pathOptions={{
                                    color: "#64748b",
                                    fillColor: "#cbd5e1",
                                    fillOpacity: 0.85,
                                    weight: 1,
                                }}
                            >
                                <Popup>
                                    <div>
                                        <p>Building {building.id}</p>
                                        <p>
                                            Height:{" "}
                                            {building.height ?? "Unknown"} m
                                        </p>
                                        <p>
                                            Min height:{" "}
                                            {building.minHeight ?? "Unknown"} m
                                        </p>
                                    </div>
                                </Popup>
                            </Polygon>
                        ),
                    ),
                )}

                {trees
                    .filter((tree) => tree.id % 3 === 0)
                    .map((tree) => {
                        const [longitude, latitude] =
                            tree.location.coordinates;

                        return (
                            <CircleMarker
                                key={tree.id}
                                center={[latitude, longitude]}
                                radius={2}
                                pathOptions={{
                                    color: "#166534",
                                    fillColor: "#22c55e",
                                    fillOpacity: 0.65,
                                    weight: 0.7,
                                }}
                            >
                                <Popup>
                                    <div>
                                        <p>Tree {tree.id}</p>
                                        <p>
                                            Height:{" "}
                                            {tree.height ?? "Unknown"} m
                                        </p>
                                        <p>
                                            Crown diameter:{" "}
                                            {tree.crownDiameter ?? "Unknown"} m
                                        </p>
                                    </div>
                                </Popup>
                            </CircleMarker>
                        );
                    })}

                {roads.map((road) => (
                    <Polyline
                        key={road.id}
                        positions={road.geometry.coordinates.map(
                            ([longitude, latitude]) =>
                                [latitude, longitude] as [number, number],
                        )}
                        pathOptions={{
                            color: "#475569",
                            weight: 3,
                            opacity: 0.9,
                        }}
                    >
                        <Popup>
                            <div>
                                <p>Road {road.id}</p>
                                <p>{road.name}</p>
                            </div>
                        </Popup>
                    </Polyline>
                ))}

                {intersections.map((intersection) => (
                    <CircleMarker
                        key={intersection.id}
                        center={[
                            intersection.location[1],
                            intersection.location[0],
                        ]}
                        radius={5}
                        pathOptions={{
                            color: "#475569",
                            fillColor: "#ffffff",
                            fillOpacity: 1,
                            weight: 2,
                        }}
                    >
                        <Popup>
                            <div>
                                <p>Intersection {intersection.id}</p>
                                <p>{intersection.name ?? "Unnamed intersection"}</p>
                            </div>
                        </Popup>
                    </CircleMarker>
                ))}
            </MapContainer>
        </div>
    );
}