"use client";

import { useEffect, useState } from "react";
import {
    CircleMarker,
    MapContainer,
    Polyline,
    Popup,
    TileLayer,
    useMap,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

type City = {
    id: number;
    name: string;
    country: string;
};

type Road = {
    id: number;
    name: string;
    geometry: {
        type: "LineString";
        coordinates: [number, number][];
    };
};

type Intersection = {
    id: number;
    name: string | null;
    location: [number, number];
};

function MapBounds({
    roads,
    intersections,
}: {
    roads: Road[];
    intersections: Intersection[];
}) {
    const map = useMap();

    useEffect(() => {
        const coordinates: [number, number][] = [];

        roads.forEach((road) => {
            road.geometry.coordinates.forEach(
                ([longitude, latitude]) => {
                    coordinates.push([latitude, longitude]);
                },
            );
        });

        intersections.forEach((intersection) => {
            const [longitude, latitude] = intersection.location;

            coordinates.push([latitude, longitude]);
        });

        if (coordinates.length > 0) {
            map.fitBounds(coordinates, {
                padding: [40, 40],
            });
        }
    }, [map, roads, intersections]);

    return null;
}

export default function CityMap() {
    const [cities, setCities] = useState<City[]>([]);
    const [selectedCityId, setSelectedCityId] = useState<number>(1);
    const [roads, setRoads] = useState<Road[]>([]);
    const [intersections, setIntersections] = useState<
        Intersection[]
    >([]);

    useEffect(() => {
        async function fetchCities() {
            try {
                const response = await fetch("/api/cities");

                if (!response.ok) {
                    throw new Error("Failed to fetch cities");
                }

                const data = await response.json();

                setCities(data);
            } catch (error) {
                console.error("Failed to load cities:", error);
            }
        }

        fetchCities();
    }, []);

    useEffect(() => {
        async function fetchMapData() {
            try {
                const [roadsResponse, intersectionsResponse] =
                    await Promise.all([
                        fetch(`/api/roads?cityId=${selectedCityId}`),
                        fetch(
                            `/api/intersections?cityId=${selectedCityId}`,
                        ),
                    ]);

                if (!roadsResponse.ok || !intersectionsResponse.ok) {
                    throw new Error("Failed to fetch map data");
                }

                const roadsData = await roadsResponse.json();
                const intersectionsData =
                    await intersectionsResponse.json();

                setRoads(roadsData);
                setIntersections(intersectionsData);
            } catch (error) {
                console.error("Failed to load map data:", error);
                setRoads([]);
                setIntersections([]);
            }
        }

        fetchMapData();
    }, [selectedCityId]);

    return (
        <div className="relative h-screen w-full">
            <div className="absolute left-4 top-4 z-[1000]">
                <select
                    value={selectedCityId}
                    onChange={(event) =>
                        setSelectedCityId(Number(event.target.value))
                    }
                    className="rounded-md border bg-white px-4 py-2 text-sm shadow-md"
                >
                    {cities.map((city) => (
                        <option key={city.id} value={city.id}>
                            {city.name}, {city.country}
                        </option>
                    ))}
                </select>
            </div>

            <MapContainer
                center={[12.9716, 77.5946]}
                zoom={13}
                style={{ height: "100%", width: "100%" }}
            >
                <TileLayer
                    attribution="&copy; OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <MapBounds
                    roads={roads}
                    intersections={intersections}
                />

                {roads.map((road) => (
                    <Polyline
                        key={road.id}
                        positions={road.geometry.coordinates.map(
                            ([longitude, latitude]) =>
                                [latitude, longitude] as [number, number],
                        )}
                    >
                        <Popup>{road.name}</Popup>
                    </Polyline>
                ))}

                {intersections.map((intersection) => {
                    const [longitude, latitude] = intersection.location;

                    return (
                        <CircleMarker
                            key={intersection.id}
                            center={[latitude, longitude]}
                            radius={6}
                        >
                            <Popup>
                                {intersection.name ??
                                    `Intersection ${intersection.id}`}
                            </Popup>
                        </CircleMarker>
                    );
                })}
            </MapContainer>
        </div>
    );
}