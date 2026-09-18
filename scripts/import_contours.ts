import "dotenv/config";

import fs from "fs";
import path from "path";
import postgres from "postgres";

type ContourFeature = {
    type: "Feature";
    geometry: {
        type: "LineString";
        coordinates: [number, number][];
    };
    properties: {
        elevation?: number | null;
    };
};

type ContourGeoJSON = {
    type: "FeatureCollection";
    features: ContourFeature[];
};

const filePath = path.join(
    process.cwd(),
    "data",
    "contours_Ensemble Digital Terrain Model (EDTM)_30m_OGH.geojson",
);

const data: ContourGeoJSON = JSON.parse(
    fs.readFileSync(filePath, "utf-8"),
);

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined");
}

const sql = postgres(process.env.DATABASE_URL);

async function importContours() {
    console.log(`Found ${data.features.length} contour features`);

    for (const feature of data.features) {
        const geometryJson = JSON.stringify(feature.geometry);

        const elevation =
            feature.properties.elevation ?? null;

        await sql`
            INSERT INTO contours (
                city_id,
                elevation,
                geometry
            )
            VALUES (
                1,
                ${elevation},
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

    console.log("Contour import completed.");

    await sql.end();
}

importContours().catch(async (error) => {
    console.error("Contour import failed:", error);

    await sql.end();

    process.exit(1);
});