import "dotenv/config";

import fs from "fs";
import path from "path";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error("DATABASE_URL is not defined");
}

const sql = postgres(databaseUrl);

const areaFilePath = path.join(
    process.cwd(),
    "data",
    "waterways_Base_Overture_0.geojson",
);

const polygonFilePath = path.join(
    process.cwd(),
    "data",
    "waterways_Base_Overture_2.geojson",
);

type MultiPolygonFeature = {
    type: "Feature";
    geometry: {
        type: "MultiPolygon";
        coordinates: number[][][][];
    };
    properties: null;
};

type PolygonFeature = {
    type: "Feature";
    geometry: {
        type: "Polygon";
        coordinates: number[][][];
    };
    properties: null;
};

type MultiPolygonGeoJSON = {
    type: "FeatureCollection";
    features: MultiPolygonFeature[];
};

type PolygonGeoJSON = {
    type: "FeatureCollection";
    features: PolygonFeature[];
};

const areaData: MultiPolygonGeoJSON = JSON.parse(
    fs.readFileSync(areaFilePath, "utf-8"),
);

const polygonData: PolygonGeoJSON = JSON.parse(
    fs.readFileSync(polygonFilePath, "utf-8"),
);

async function importWaterways() {
    console.log(
        `Found ${areaData.features.length} multipolygon water features`,
    );

    console.log(
        `Found ${polygonData.features.length} polygon water features`,
    );

    for (const feature of areaData.features) {
        const geometryJson = JSON.stringify(feature.geometry);

        await sql`
            INSERT INTO water_areas (
                city_id,
                geometry
            )
            VALUES (
                1,
                ST_Transform(
                    ST_SetSRID(
                        ST_GeomFromGeoJSON(${geometryJson}),
                        5070
                    ),
                    4326
                )
            );
        `;
    }

    for (const feature of polygonData.features) {
        const geometryJson = JSON.stringify({
            type: "MultiPolygon",
            coordinates: [feature.geometry.coordinates],
        });

        await sql`
            INSERT INTO water_areas (
                city_id,
                geometry
            )
            VALUES (
                1,
                ST_Transform(
                    ST_SetSRID(
                        ST_GeomFromGeoJSON(${geometryJson}),
                        5070
                    ),
                    4326
                )
            );
        `;
    }

    console.log("Waterway import completed.");

    await sql.end();
}

importWaterways().catch(async (error) => {
    console.error("Waterway import failed:", error);

    await sql.end();

    process.exit(1);
});