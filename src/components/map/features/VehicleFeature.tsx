"use client";

import { CircleMarker, Popup } from "react-leaflet";

import type { SimulationVehicle } from "../types/map.types";

type VehicleFeatureProps = {
    vehicle: SimulationVehicle;
};

export default function VehicleFeature({
    vehicle,
}: VehicleFeatureProps) {
    if (
        vehicle.status === "COMPLETED" ||
        !vehicle.position
    ) {
        return null;
    }

    const [longitude, latitude] =
        vehicle.position;

    return (
        <CircleMarker
            center={[latitude, longitude]}
            radius={6}
            pathOptions={{
                weight: 2,
            }}
        >
            <Popup>
                <strong>
                    Vehicle {vehicle.id}
                </strong>

                <br />

                Road:{" "}
                {vehicle.currentRoadId ?? "None"}

                <br />

                Route step:{" "}
                {vehicle.routeSequence}

                <br />

                Progress:{" "}
                {(vehicle.progress * 100).toFixed(1)}%

                <br />

                Speed:{" "}
                {vehicle.speedKmh} km/h

                <br />

                Status:{" "}
                {vehicle.status}
            </Popup>
        </CircleMarker>
    );
}