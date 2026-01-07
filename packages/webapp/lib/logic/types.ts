
export interface IGlucoseResult {
    timestamp: string;
    units: string;
    current: {
        sgv: number;
        direction: string;
        trend: number;
        delta5m: number | null;
        delta10m: number | null;
        delta15m: number | null;
        delta30m: number | null;
        history30m: number[];
        rateOfChange: number | null;
    };
    sensor: {
        age: number | null;
        device: string;
        noise?: number;
        rssi?: number;
        calibration?: {
            mbg: number;
            timeSince: number;
        };
    };
}

export interface IIOBResult {
    timestamp: string;
    units: string;
    lookbackMinutes: number;
    settings: {
        isf: number;
        dia: number;
        autosensRatio: number;
        effectiveISF: number;
    };
    calculated: {
        totalIOB: number;
        bolusIOB: number;
        basalIOB: number;
        smbIOB: number;
        glucoseImpact: number;
        bolusCount: number;
        smbCount: number;
    };
    reported: {
        totalIOB: number;
        bolusIOB: number;
        basalIOB: number;
        timestamp: string;
    };
    timeseries?: {
        intervalMinutes: number;
        startTime: string;
        endTime: string;
        length: number;
        data: Array<{
            timestamp: string;
            totalIOB: number;
            bolusIOB: number;
            basalIOB: number;
            activity: number;
            glucoseImpact: number;
        }>;
        nowIndex: number;
    };
}

export interface ICOBResult {
    timestamp: string;
    units: string;
    lookbackMinutes: number;
    settings: {
        isf: number;
        cr: number;
        minCarbImpact: number;
        absorptionRate: number;
    };
    calculated: {
        cob: number;
        pendingCOB: number;
        activeCOB: number;
        glucoseImpact: number;
        eventCount: number;
        avgEventSize: number;
        observedDeviation: number;
        estimatedAbsorption: number;
    };
    reported: {
        cob: number;
        timestamp: string;
    };
    timeseries?: {
        intervalMinutes: number;
        startTime: string;
        endTime: string;
        length: number;
        data: Array<{
            timestamp: string;
            cob: number;
            pendingCOB: number;
            activeCOB: number;
            absorption: number;
            glucoseImpact: number;
        }>;
        nowIndex: number;
    };
}

export interface IAttributionTimeframe {
    timeframe: '5min' | '10min' | '15min' | '30min';
    minutes: number;
    glucoseChange: {
        actual: number;
        predicted: number;
    };
    components: {
        insulin: {
            value: number;
            activity: number;
            isf: number;
        };
        carbs: {
            value: number;
            absorption: number;
            carbRatio: number;
        };
        basal: {
            value: number;
            deviation: number;
        };
        activity: {
            value: number;
            steps: number;
            calories: number;
            stairs: number;
            heartRate: number;
            intensity: string;
            dataAvailable: boolean;
        };
        unexplained: number;
    };
}

export interface IAttributionHistoryPoint {
    timestamp: string;
    actual: number;
    predicted: number;
    unexplained: number;
    components: {
        insulin: number;
        carbs: number;
        basal: number;
        activity: number;
    };
}

export interface IAttributionResult {
    timestamp: string;
    timeframes: IAttributionTimeframe[];
    history?: IAttributionHistoryPoint[];
}

export interface IStatusResult {
    pump: {
        basal: any;
        pumpAge: number | null;
        reservoir: number | undefined;
        clock: string | undefined;
        status: any;
    };
    iob: IIOBResult;
    cob: ICOBResult;
    glucose: IGlucoseResult;
    profile: any;
    attribution?: IAttributionResult;
    uploader: {
        battery: number | undefined;
        device: string;
    };
    meta: {
        reported_date: string | undefined;
        status_date: string;
        created_date: string;
        app: string;
    };
}
