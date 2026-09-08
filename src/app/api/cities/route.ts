import { NextResponse } from "next/server";

import { db } from "@/db";
import { cities } from "@/db/schema";

export async function GET() {
  try {
    const result = await db
      .select({
        id: cities.id,
        name: cities.name,
        country: cities.country,
        center: cities.center,
        createdAt: cities.createdAt,
        updatedAt: cities.updatedAt,
      })
      .from(cities)
      .orderBy(cities.name);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch cities:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch cities",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      name,
      country,
      longitude,
      latitude,
    } = body;

    if (
      typeof name !== "string" ||
      typeof country !== "string" ||
      typeof longitude !== "number" ||
      typeof latitude !== "number"
    ) {
      return NextResponse.json(
        {
          error:
            "name, country, longitude, and latitude are required",
        },
        {
          status: 400,
        },
      );
    }

    if (name.trim().length === 0 || country.trim().length === 0) {
      return NextResponse.json(
        {
          error: "name and country cannot be empty",
        },
        {
          status: 400,
        },
      );
    }

    if (longitude < -180 || longitude > 180) {
      return NextResponse.json(
        {
          error: "longitude must be between -180 and 180",
        },
        {
          status: 400,
        },
      );
    }

    if (latitude < -90 || latitude > 90) {
      return NextResponse.json(
        {
          error: "latitude must be between -90 and 90",
        },
        {
          status: 400,
        },
      );
    }

    const result = await db
      .insert(cities)
      .values({
        name: name.trim(),
        country: country.trim(),
        center: [longitude, latitude],
      })
      .returning({
        id: cities.id,
        name: cities.name,
        country: cities.country,
        center: cities.center,
        createdAt: cities.createdAt,
        updatedAt: cities.updatedAt,
      });

    return NextResponse.json(result[0], {
      status: 201,
    });
  } catch (error) {
    console.error("Failed to create city:", error);

    return NextResponse.json(
      {
        error: "Failed to create city",
      },
      {
        status: 500,
      },
    );
  }
}