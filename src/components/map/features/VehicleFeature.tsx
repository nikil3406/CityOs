"use client";

import { CircleMarker, Popup, Tooltip } from "react-leaflet";

import type { SimulationVehicle } from "../types/map.types";

type VehicleFeatureProps = {
    vehicle: SimulationVehicle;
    rerouted?: boolean;
};

export default function VehicleFeature({
    vehicle,
    rerouted = false,
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
        <>
        {rerouted && <CircleMarker
            center={[latitude, longitude]}
            radius={13}
            interactive={false}
            pathOptions={{ color: "#f97316", weight: 4, opacity: 0.95, fillColor: "#fb923c", fillOpacity: 0.22 }}
        />}
        <CircleMarker
            center={[latitude, longitude]}
            radius={rerouted ? 8 : 6}
            pathOptions={{
                color: rerouted ? "#c2410c" : "#ffffff",
                weight: rerouted ? 3 : 2,
                fillColor: rerouted ? "#fb923c" : "#3388ff",
                fillOpacity: 1,
            }}
        >
            {rerouted && <Tooltip permanent direction="top" offset={[0, -10]}>
                <span className="font-semibold text-orange-700">REROUTED</span>
            </Tooltip>}
            <Popup>
                <strong>
                    Vehicle {vehicle.id}
                </strong>

                {rerouted && <><br /><strong className="text-orange-700">Route changed just now</strong></>}

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
        </>
    );
}
