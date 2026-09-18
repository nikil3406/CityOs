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
    "buildings_3d_Buildings_Overture.geojson",
);

const cityId = 1;

type BuildingFeature = {
    type: "Feature";
    geometry: {
        type: "MultiPolygon";
        coordinates: number[][][][];
    };
    properties?: {
        height?: number;
        min_height?: number;
    };
};

type BuildingGeoJSON = {
    type: "FeatureCollection";
    features: BuildingFeature[];
};

async function main() {
    const file = fs.readFileSync(filePath, "utf-8");
    const geojson = JSON.parse(file) as BuildingGeoJSON;

    console.log(
        `Found ${geojson.features.length} building features`,
    );

    for (
        let index = 0;
        index < geojson.features.length;
        index++
    ) {
        const feature = geojson.features[index];

        if (
            !feature.geometry ||
            feature.geometry.type !== "MultiPolygon"
        ) {
            console.log(
                `Skipping invalid building at index ${index}`,
            );
            continue;
        }

        const height =
            feature.properties?.height ?? null;

        const minHeight =
            feature.properties?.min_height ?? null;

        const geometry = JSON.stringify({
            type: "MultiPolygon",
            coordinates: feature.geometry.coordinates,
        });

        await sql`
            INSERT INTO buildings (
                city_id,
                height,
                min_height,
                geometry
            )
            VALUES (
                ${cityId},
                ${height},
                ${minHeight},
                ST_Transform(
                    ST_SetSRID(
                        ST_GeomFromGeoJSON(${geometry}),
                        32644
                    ),
                    4326
                )
            )
        `;

        console.log(
            `Imported building ${index + 1}/${geojson.features.length}`,
        );
    }

    console.log("Building import completed");

    await sql.end();
}

main().catch(async (error) => {
    console.error("Building import failed:", error);
    await sql.end();
    process.exit(1);
});