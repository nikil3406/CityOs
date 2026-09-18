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
    "frame.geojson",
);

type FrameGeoJSON = {
    type: "FeatureCollection";
    features: {
        geometry: {
            type: "LineString";
            coordinates: [number, number][];
        };
    }[];
};

async function main() {
    const data = JSON.parse(
        fs.readFileSync(filePath, "utf-8"),
    ) as FrameGeoJSON;

    if (data.features.length !== 1) {
        throw new Error("Expected exactly one frame feature");
    }

    const coordinates =
        data.features[0].geometry.coordinates;

    if (coordinates.length < 4) {
        throw new Error("Frame does not contain enough coordinates");
    }

    const wkt = `LINESTRING(${coordinates
        .map(([x, y]) => `${x} ${y}`)
        .join(", ")})`;

    await sql`
        UPDATE cities
        SET
            boundary = ST_Transform(
                ST_MakePolygon(
                    ST_SetSRID(
                        ST_GeomFromText(${wkt}),
                        5070
                    )
                ),
                4326
            ),
            center = ST_Centroid(
                ST_Transform(
                    ST_MakePolygon(
                        ST_SetSRID(
                            ST_GeomFromText(${wkt}),
                            5070
                        )
                    ),
                    4326
                )
            ),
            updated_at = now()
        WHERE id = 1;
    `;

    console.log("City boundary and center updated.");

    await sql.end();
}

main().catch(async (error) => {
    console.error(
        "Failed to update city boundary:",
        error,
    );

    await sql.end();
    process.exit(1);
});