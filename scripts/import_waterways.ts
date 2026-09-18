import "dotenv/config";

import fs from "fs";
import path from "path";
import postgres from "postgres";

type WaterAreaGeoJSON = {
    type: "FeatureCollection";
    features: {
        geometry: {
            type: "MultiPolygon";
            coordinates: number[][][][];
        };
        properties: null;
    }[];
};

type WaterLineGeoJSON = {
    type: "FeatureCollection";
    features: {
        geometry: {
            type: "MultiLineString";
            coordinates: number[][][];
        };
        properties: null;
    }[];
};

const areaFilePath = path.join(
    process.cwd(),
    "data",
    "waterways_Base_Overture_0.geojson",
);

const lineFilePath = path.join(
    process.cwd(),
    "data",
    "waterways_Base_Overture_2.geojson",
);

const areaData: WaterAreaGeoJSON = JSON.parse(
    fs.readFileSync(areaFilePath, "utf-8"),
);

const lineData: WaterLineGeoJSON = JSON.parse(
    fs.readFileSync(lineFilePath, "utf-8"),
);

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined");
}

const sql = postgres(process.env.DATABASE_URL);

async function importWaterways() {
    console.log(
        `Found ${areaData.features.length} water area features`,
    );

    console.log(
        `Found ${lineData.features.length} water line features`,
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
                        32644
                    ),
                    4326
                )
            );
        `;
    }

    for (const feature of lineData.features) {
        const geometryJson = JSON.stringify(feature.geometry);

        await sql`
            INSERT INTO water_lines (
                city_id,
                geometry
            )
            VALUES (
                1,
                ST_Transform(
                    ST_SetSRID(
                        ST_GeomFromGeoJSON(${geometryJson}),
                        32644
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