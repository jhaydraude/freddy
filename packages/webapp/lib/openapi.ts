import { z } from 'zod';
import { createDocument } from 'zod-openapi';


// --- Commmon Schemas ---

const UnitsEnum = z.enum(['mg/dL', 'mmol']).meta({
    description: 'Glucose units',
    example: 'mg/dL'
});

const TimeseriesSchema = z.object({
    intervalMinutes: z.number(),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    length: z.number(),
    nowIndex: z.number()
});

// --- Glucose Schemas ---

const GlucoseResponseSchema = z.object({
    timestamp: z.string().datetime(),
    units: UnitsEnum,
    current: z.object({
        sgv: z.number(),
        trend: z.number(),
        direction: z.string(),
        delta5m: z.number().nullable(),
        delta10m: z.number().nullable(),
        delta15m: z.number().nullable(),
        delta30m: z.number().nullable(),
        history30m: z.array(z.number()),
        rateOfChange: z.number().nullable()
    }),
    sensor: z.object({
        age: z.number().nullable(),
        device: z.string(),
        noise: z.number().optional(),
        rssi: z.number().optional()
    })
}).meta({ description: 'Glucose reading and sensor information' });

// --- IOB Schemas ---

const IOBResponseSchema = z.object({
    timestamp: z.string().datetime(),
    units: UnitsEnum,
    lookbackMinutes: z.number(),
    settings: z.object({
        isf: z.number(),
        dia: z.number(),
        autosensRatio: z.number(),
        effectiveISF: z.number()
    }),
    calculated: z.object({
        totalIOB: z.number(),
        bolusIOB: z.number(),
        basalIOB: z.number(),
        smbIOB: z.number(),
        glucoseImpact: z.number(),
        bolusCount: z.number(),
        smbCount: z.number()
    }),
    reported: z.object({
        totalIOB: z.number(),
        bolusIOB: z.number(),
        basalIOB: z.number(),
        timestamp: z.string()
    }),
    timeseries: TimeseriesSchema.extend({
        data: z.array(z.object({
            timestamp: z.string().datetime(),
            totalIOB: z.number(),
            bolusIOB: z.number(),
            basalIOB: z.number(),
            activity: z.number(),
            glucoseImpact: z.number()
        }))
    }).optional()
}).meta({ description: 'Insulin on board calculation with optional timeseries' });

// --- COB Schemas ---

const COBResponseSchema = z.object({
    timestamp: z.string().datetime(),
    units: UnitsEnum,
    lookbackMinutes: z.number(),
    settings: z.object({
        isf: z.number(),
        cr: z.number(),
        minCarbImpact: z.number(),
        absorptionRate: z.number()
    }),
    calculated: z.object({
        cob: z.number(),
        pendingCOB: z.number(),
        activeCOB: z.number(),
        glucoseImpact: z.number(),
        eventCount: z.number(),
        avgEventSize: z.number(),
        observedDeviation: z.number(),
        estimatedAbsorption: z.number()
    }),
    reported: z.object({
        cob: z.number(),
        timestamp: z.string()
    }),
    timeseries: TimeseriesSchema.extend({
        data: z.array(z.object({
            timestamp: z.string().datetime(),
            cob: z.number(),
            pendingCOB: z.number(),
            activeCOB: z.number(),
            absorption: z.number(),
            glucoseImpact: z.number()
        }))
    }).optional()
}).meta({ description: 'Carbs on board calculation with optional timeseries' });

// --- Activity Schemas ---

// --- New Activity Schemas (UploadRequest Spec) ---

const PointHeartRateSchema = z.object({
    bpm: z.number().meta({ example: 72.5 }),
    accuracy: z.number().int().min(0).max(2).optional().meta({ description: '0: Unknown, 1: Low, 2: High' })
});

const AggregateHeartRateSchema = z.object({
    bpm_avg: z.number().optional(),
    bpm_min: z.number().optional(),
    bpm_max: z.number().optional(),
    measurement_count: z.number().int().optional(),
    accuracy: z.number().int().min(0).max(2).optional().meta({ description: '0: Unknown, 1: Low, 2: High' })
}).refine(data => data.bpm_avg !== undefined || data.bpm_min !== undefined || data.bpm_max !== undefined, {
    message: "At least one of bpm_avg, bpm_min, or bpm_max must be provided"
});

const HeartRateDataSchema = z.union([PointHeartRateSchema, AggregateHeartRateSchema]);

const StepsDataSchema = z.object({
    count: z.number().int().meta({ example: 1250 }),
    distance_meters: z.number().nullable().optional(),
    calories_kcal: z.number().int().nullable().optional(),
    floors_climbed_total: z.number().nullable().optional(),
    accuracy: z.number().int().min(0).max(2).optional().meta({ description: '0: Unknown, 1: Low, 2: High' })
});

const ExerciseDataSchema = z.object({
    exercise_type: z.string().meta({ example: 'running' }),
    duration_minutes: z.number().int(),
    calories_kcal: z.number().int().nullable().optional(),
    title: z.string().nullable().optional()
});

const ActivityRecordSchema = z.object({
    id: z.string().meta({ description: 'Unique client-side ID' }),
    type: z.enum(['heart_rate', 'steps', 'exercise']),
    timestamp: z.number().int().optional().meta({ description: 'Epoch ms for point data (HR)' }),
    startTime: z.number().int().optional().meta({ description: 'Epoch ms for intervals' }),
    endTime: z.number().int().optional().meta({ description: 'Epoch ms for intervals' }),
    data: z.union([HeartRateDataSchema, StepsDataSchema, ExerciseDataSchema])
});

export const UploadRequestSchema = z.object({
    metadata: z.object({
        device_id: z.string().meta({ example: 'pixel-8-pro-abc' }),
        source_app: z.string().meta({ example: 'com.example.littlefred' }),
        sync_timestamp: z.string().datetime().optional()
    }),
    activities: z.array(ActivityRecordSchema)
}).meta({ description: 'Upload request for new activity records' });

// --- Cache Schemas ---

const RecalculateRequestSchema = z.object({
    startTime: z.string().datetime().meta({ description: 'Start of time range to recalculate' }),
    endTime: z.string().datetime().optional().meta({ description: 'End of time range (defaults to now)' }),
    bucketSize: z.number().int().positive().optional().meta({ description: 'Bucket size in minutes (default: 5)' }),
    includeAttribution: z.boolean().optional().meta({ description: 'Include attribution calculations (default: true)' })
}).meta({ description: 'Request to recalculate cached statuses' });

const RecalculateResponseSchema = z.object({
    success: z.boolean(),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    bucketSize: z.number(),
    totalBuckets: z.number(),
    calculated: z.number(),
    failed: z.number(),
    message: z.string()
}).meta({ description: 'Result of cache recalculation' });

const ActivityPOSTResponseSchema = z.object({
    success: z.boolean(),
    count: z.number(),
    message: z.string()
}).meta({ description: 'Activity POST response' });

// --- Status Schemas ---

const StatusResponseSchema = z.object({
    pump: z.object({
        basal: z.any(),
        pumpAge: z.number().nullable(),
        reservoir: z.number().optional(),
        clock: z.string().optional(),
        status: z.any()
    }),
    iob: IOBResponseSchema,
    cob: COBResponseSchema,
    glucose: GlucoseResponseSchema,
    profile: z.any(),
    uploader: z.object({
        battery: z.number().optional(),
        device: z.string()
    }),
    meta: z.object({
        reported_date: z.string().optional(),
        status_date: z.string(),
        created_date: z.string(),
        app: z.string()
    })
}).meta({ description: 'Complete system status including pump, IOB, COB, and glucose' });


export const openApiDocument = createDocument({
    openapi: '3.1.0',
    info: {
        title: 'Freddy API',
        version: '1.0.0',
        description: 'The Intelligent Loop Manager - AI-powered diabetes management and predictive analysis API',
    },
    servers: [{ url: '/api' }],
    paths: {
        '/status': {
            get: {
                summary: 'Get complete system status',
                parameters: [
                    { name: 'timestamp', in: 'query', schema: { type: 'string', format: 'date-time' } },
                    { name: 'includeTimeseries', in: 'query', schema: { type: 'boolean', default: true } }
                ],
                responses: {
                    200: { description: 'Success', content: { 'application/json': { schema: StatusResponseSchema } } }
                }
            }
        },
        '/iob': {
            get: {
                summary: 'Get Insulin On Board',
                parameters: [
                    { name: 'timestamp', in: 'query', schema: { type: 'string', format: 'date-time' } },
                    { name: 'includeTimeseries', in: 'query', schema: { type: 'boolean', default: true } }
                ],
                responses: {
                    200: { description: 'Success', content: { 'application/json': { schema: IOBResponseSchema } } }
                }
            }
        },
        '/cob': {
            get: {
                summary: 'Get Carbs On Board',
                parameters: [
                    { name: 'timestamp', in: 'query', schema: { type: 'string', format: 'date-time' } },
                    { name: 'includeTimeseries', in: 'query', schema: { type: 'boolean', default: true } }
                ],
                responses: {
                    200: { description: 'Success', content: { 'application/json': { schema: COBResponseSchema } } }
                }
            }
        },
        '/glucose': {
            get: {
                summary: 'Get Glucose status',
                parameters: [
                    { name: 'timestamp', in: 'query', schema: { type: 'string', format: 'date-time' } }
                ],
                responses: {
                    200: { description: 'Success', content: { 'application/json': { schema: GlucoseResponseSchema } } }
                }
            }
        },
        '/activities': {
            post: {
                summary: 'Upload activity records',
                description: 'Batch upload activity records (steps, heart rate, exercise)',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: UploadRequestSchema
                        }
                    }
                },
                responses: {
                    '200': {
                        description: 'Activities uploaded successfully',
                        content: {
                            'application/json': {
                                schema: z.object({
                                    success: z.boolean(),
                                    inserted: z.number(),
                                    updated: z.number()
                                })
                            }
                        }
                    }
                }
            }
        },
        '/cache/recalculate': {
            post: {
                summary: 'Recalculate cached statuses',
                description: 'Recalculates and caches computed statuses for a given time range. Useful for cache invalidation after retroactive edits.',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: RecalculateRequestSchema
                        }
                    }
                },
                responses: {
                    '200': {
                        description: 'Recalculation completed',
                        content: {
                            'application/json': {
                                schema: RecalculateResponseSchema
                            }
                        }
                    }
                }
            }
        }
    }
});
