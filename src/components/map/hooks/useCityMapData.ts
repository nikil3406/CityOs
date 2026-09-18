"use client";

import { useEffect, useState } from "react";

import type {
    Building,
    City,
    Contour,
    Intersection,
    Road,
    Tree,
    WaterArea,
    WaterLine,
} from "@/components/map/types/map.types";

type CityMapData = {
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

export function useCityMapData(
    selectedCityId: number,
): CityMapData {
    const [cities, setCities] = useState<City[]>([]);
    const [roads, setRoads] = useState<Road[]>([]);
    const [intersections, setIntersections] =
        useState<Intersection[]>([]);
    const [buildings, setBuildings] =
        useState<Building[]>([]);
    const [trees, setTrees] = useState<Tree[]>([]);
    const [waterAreas, setWaterAreas] =
        useState<WaterArea[]>([]);
    const [waterLines, setWaterLines] =
        useState<WaterLine[]>([]);
    const [contours, setContours] =
        useState<Contour[]>([]);

    const [boundary, setBoundary] =
        useState<[number, number][][]>([]);

    const [loading, setLoading] =
        useState<boolean>(true);

    const [error, setError] =
        useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function fetchData() {
            try {
                setLoading(true);
                setError(null);

                const responses =
                    await Promise.all([
                        fetch("/api/cities"),

                        fetch(
                            `/api/roads?cityId=${selectedCityId}`,
                        ),

                        fetch(
                            `/api/intersections?cityId=${selectedCityId}`,
                        ),

                        fetch(
                            `/api/buildings?cityId=${selectedCityId}`,
                        ),

                        fetch(
                            `/api/trees?cityId=${selectedCityId}`,
                        ),

                        fetch(
                            `/api/waterways?cityId=${selectedCityId}`,
                        ),

                        fetch(
                            `/api/contours?cityId=${selectedCityId}`,
                        ),
                    ]);

                const [
                    citiesResponse,
                    roadsResponse,
                    intersectionsResponse,
                    buildingsResponse,
                    treesResponse,
                    waterwaysResponse,
                    contoursResponse,
                ] = responses;

                if (
                    !citiesResponse.ok ||
                    !roadsResponse.ok ||
                    !intersectionsResponse.ok ||
                    !buildingsResponse.ok ||
                    !treesResponse.ok ||
                    !waterwaysResponse.ok ||
                    !contoursResponse.ok
                ) {
                    throw new Error(
                        "Failed to fetch city map data",
                    );
                }

                const citiesData =
                    (await citiesResponse.json()) as City[];

                const roadsData =
                    (await roadsResponse.json()) as Road[];

                const intersectionsData =
                    (await intersectionsResponse.json()) as Intersection[];

                const buildingsData =
                    (await buildingsResponse.json()) as Building[];

                const treesData =
                    (await treesResponse.json()) as Tree[];

                const waterwaysData =
                    (await waterwaysResponse.json()) as {
                        areas: WaterArea[];
                        lines: WaterLine[];
                    };

                const contoursData =
                    (await contoursResponse.json()) as Contour[];

                if (cancelled) {
                    return;
                }

                const selectedCity =
                    citiesData.find(
                        (city) =>
                            city.id === selectedCityId,
                    );

                setCities(citiesData);
                setRoads(roadsData);
                setIntersections(
                    intersectionsData,
                );
                setBuildings(buildingsData);
                setTrees(treesData);

                setWaterAreas(
                    waterwaysData.areas,
                );

                setWaterLines(
                    waterwaysData.lines,
                );

                setContours(contoursData);

                setBoundary(
                    selectedCity?.boundary
                        ? selectedCity.boundary.coordinates
                        : [],
                );
            } catch (err) {
                if (cancelled) {
                    return;
                }

                console.error(
                    "Failed to load map data:",
                    err,
                );

                setError(
                    "Failed to load map data",
                );

                setCities([]);
                setRoads([]);
                setIntersections([]);
                setBuildings([]);
                setTrees([]);
                setWaterAreas([]);
                setWaterLines([]);
                setContours([]);
                setBoundary([]);
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        fetchData();

        return () => {
            cancelled = true;
        };
    }, [selectedCityId]);

    return {
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
    };
}