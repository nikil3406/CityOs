import "dotenv/config";

import fs from "fs";
import path from "path";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error("DATABASE_URL is not defined");
}

const sql = postgres(databaseUrl);

const filePath = path.join(
    process.cwd(),
    "data",
    "roads_Transportation_Overture.geojson",
);

const cityId = 1;

type RoadFeature = {
    type: "Feature";
    id?: string;
    geometry: {
        type: "LineString";
        coordinates: [number, number][];
    };
    properties?: {
        type?: string;
        width?: number;
    };
};

type RoadGeoJSON = {
    type: "FeatureCollection";
    features: RoadFeature[];
};

async function main() {
    const file = fs.readFileSync(filePath, "utf-8");
    const geojson = JSON.parse(file) as RoadGeoJSON;

    console.log(`Found ${geojson.features.length} road features`);

    for (let index = 0; index < geojson.features.length; index++) {
        const feature = geojson.features[index];

        if (
            !feature.geometry ||
            feature.geometry.type !== "LineString" ||
            feature.geometry.coordinates.length < 2
        ) {
            console.log(`Skipping invalid road at index ${index}`);
            continue;
        }

        if (!feature.id) {
            console.log(`Skipping road ${index + 1}: missing source ID`);
            continue;
        }

        const sourceId = feature.id;
        const roadType = feature.properties?.type ?? null;
        const width = feature.properties?.width ?? null;
        const name = `Road ${index + 1}`;

        const coordinates = feature.geometry.coordinates;

        const wkt = `LINESTRING(${coordinates
            .map(([x, y]) => `${x} ${y}`)
            .join(", ")})`;

        await sql`
            INSERT INTO roads (
                city_id,
                name,
                source_id,
                type,
                width,
                geometry,
                length_meters
            )
            VALUES (
                ${cityId},
                ${name},
                ${sourceId},
                ${roadType},
                ${width},
                ST_Transform(
                    ST_SetSRID(
                        ST_GeomFromText(${wkt}),
                        32644
                    ),
                    4326
                ),
                ROUND(
                    ST_Length(
                        ST_Transform(
                            ST_SetSRID(
                                ST_GeomFromText(${wkt}),
                                32644
                            ),
                            3857
                        )
                    )
                )::integer
            )
            ON CONFLICT (source_id)
            DO UPDATE SET
                name = EXCLUDED.name,
                type = EXCLUDED.type,
                width = EXCLUDED.width,
                geometry = EXCLUDED.geometry,
                length_meters = EXCLUDED.length_meters,
                updated_at = now()
        `;

        console.log(`Imported road ${index + 1}: ${name}`);
    }

    console.log("Road import completed");

    await sql.end();
}

main().catch(async (error) => {
    console.error("Road import failed:", error);
    await sql.end();
    process.exit(1);
});