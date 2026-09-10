"use client";

import {
    MapContainer,
    TileLayer,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

export default function CityMap() {
    return (
        <MapContainer
            center={[12.9716, 77.5946]}
            zoom={13}
            style={{ height: "100vh", width: "100%" }}
        >
            <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
        </MapContainer>
    );
}