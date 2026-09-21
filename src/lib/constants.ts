export const SimulationConfig = {
    tickIntervalMs: 3000,
    simulationSecondsPerTick: 1,

    trafficLightStopDistanceMeters: 10,

    defaultVehicleSpeedKmh: 30,

    vehicleFollowing: {
        safeDistanceMeters: 8,
        detectionDistanceMeters: 25,
        minimumSpeedKmh: 0,
    },
} as const;