import "dotenv/config";

import fs from "fs";
import path from "path";
import postgres from "postgres";

type TreeFeature = {
    type: "Feature";
    geometry: {
        type: "Point";
        coordinates: [number, number];
    };
    properties: {
        height?: number | null;
        crown_diameter?: number | null;
    };
};

type TreeGeoJSON = {
    type: "FeatureCollection";
    features: TreeFeature[];
};

const filePath = path.join(
    process.cwd(),
    "data",
    "trees_Trees_TPX.geojson",
);

const data: TreeGeoJSON = JSON.parse(
    fs.readFileSync(filePath, "utf-8"),
);

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined");
}

const sql = postgres(process.env.DATABASE_URL);
async function importTrees() {
    console.log(`Found ${data.features.length} tree features`);

    for (let i = 0; i < data.features.length; i++) {
        const feature = data.features[i];

        const [x, y] = feature.geometry.coordinates;

        const height = feature.properties.height ?? null;
        const crownDiameter =
            feature.properties.crown_diameter ?? null;

        await sql`
            INSERT INTO trees (
                city_id,
                height,
                crown_diameter,
                location
            )
            VALUES (
                1,
                ${height},
                ${crownDiameter},
                ST_Transform(
                    ST_SetSRID(
                        ST_MakePoint(${x}, ${y}),
                        5070
                    ),
                    4326
                )
            );
        `;

        if ((i + 1) % 100 === 0) {
            console.log(`Imported ${i + 1}/${data.features.length}`);
        }
    }

    console.log("Tree import completed.");

    await sql.end();
}

importTrees().catch(async (error) => {
    console.error("Tree import failed:", error);
    await sql.end();
    process.exit(1);
});