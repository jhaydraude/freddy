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
    bpm: z.number().int().meta({ example: 72 }),
    accuracy: z.number().int().min(0).max(2).optional().meta({ description: '0: Unknown, 1: Low, 2: High' })
});

const AggregateHeartRateSchema = z.object({
    bpm_avg: z.number().int().optional(),
    bpm_min: z.number().int().optional(),
    bpm_max: z.number().int().optional(),
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

// --- Insulin Response Tuning Schemas ---

const InsulinResponseTuningConfigSchema = z.object({
    analysis_period_days: z.number().int().positive().optional().default(30).meta({ description: 'Days of historical data to analyze' }),
    window_hours: z.number().positive().optional().default(2).meta({ description: 'Time window size in hours' }),
    include_activity: z.boolean().optional().default(true).meta({ description: 'Include activity data in analysis' })
}).meta({ description: 'Configuration for insulin response tuning' });

const InsulinResponseValuesSchema = z.object({
    dia: z.number().min(3).max(8).meta({ description: 'Duration of Insulin Action in hours' }),
    peak: z.number().min(30).max(75).meta({ description: 'Peak insulin activity time in minutes' }),
    isf: z.array(z.number().min(10).max(200)).length(6).meta({ description: 'Insulin Sensitivity Factor for 6 time blocks (mg/dL per unit)' }),
    source: z.enum(['profile', 'previous_tuning']).meta({ description: 'Source of current values' })
}).meta({ description: 'Insulin response parameter values' });

const InsulinResponseOptimizedValuesSchema = z.object({
    dia: z.number(),
    peak: z.number(),
    isf: z.array(z.number()).length(6),
    dia_confidence: z.tuple([z.number(), z.number()]).meta({ description: '95% confidence interval for DIA' }),
    peak_confidence: z.tuple([z.number(), z.number()]).meta({ description: '95% confidence interval for peak' }),
    isf_confidence: z.array(z.tuple([z.number(), z.number()])).length(6).meta({ description: '95% confidence intervals for ISF' }),
    r_squared: z.number().meta({ description: 'Model fit quality (R²)' }),
    rmse: z.number().meta({ description: 'Root mean squared error' }),
    mae: z.number().meta({ description: 'Mean absolute error' }),
    windows_analyzed: z.number().int().meta({ description: 'Number of time windows analyzed' })
}).meta({ description: 'Optimized insulin response parameters with quality metrics' });

const InsulinResponseAnalysisSummarySchema = z.object({
    total_windows: z.number().int(),
    stable_windows: z.number().int(),
    meal_windows: z.number().int(),
    activity_windows: z.number().int(),
    data_quality_score: z.number().min(0).max(1).meta({ description: 'Overall data quality score (0-1)' })
}).meta({ description: 'Summary of analysis data' });

const InsulinResponseTuningResponseSchema = z.object({
    tuning_id: z.string().uuid().meta({ description: 'Unique identifier for this tuning run' }),
    user_id: z.string(),
    created_at: z.string().datetime(),
    status: z.enum(['running', 'completed', 'failed', 'applied']),
    config: InsulinResponseTuningConfigSchema,
    current_values: InsulinResponseValuesSchema,
    optimized_values: InsulinResponseOptimizedValuesSchema.optional(),
    analysis_summary: InsulinResponseAnalysisSummarySchema.optional(),
    applied_at: z.string().datetime().optional(),
    logs: z.array(z.string()).optional(),
    error_message: z.string().optional()
}).meta({ description: 'Insulin response tuning run result' });

const TuningStartResponseSchema = z.object({
    tuning_id: z.string().uuid(),
    status: z.literal('running'),
    estimated_duration_seconds: z.number().int()
}).meta({ description: 'Response when starting a new tuning run' });

const TuningApplyRequestSchema = z.object({
    apply_to_profile: z.boolean().meta({ description: 'Update Nightscout profile with optimized values' }),
    apply_to_system: z.boolean().meta({ description: 'Use optimized values in calculations immediately' })
}).meta({ description: 'Options for applying tuning results' });

const TuningApplyResponseSchema = z.object({
    success: z.boolean(),
    applied_at: z.string().datetime(),
    message: z.string()
}).meta({ description: 'Response after applying tuning results' });

const TuningHistoryResponseSchema = z.object({
    tunings: z.array(z.object({
        tuning_id: z.string().uuid(),
        created_at: z.string().datetime(),
        status: z.enum(['running', 'completed', 'failed', 'applied']),
        optimized_values: InsulinResponseOptimizedValuesSchema.optional(),
        applied_at: z.string().datetime().optional()
    }))
}).meta({ description: 'List of historical tuning runs' });


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
        },
        '/profile/tune-insulin-response': {
            post: {
                summary: 'Start insulin response tuning',
                description: 'Initiates a new tuning run to optimize DIA, Peak Time, and ISF parameters using historical data',
                tags: ['Profile Tuning'],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: InsulinResponseTuningConfigSchema
                        }
                    }
                },
                responses: {
                    '200': {
                        description: 'Tuning started successfully',
                        content: {
                            'application/json': {
                                schema: TuningStartResponseSchema
                            }
                        }
                    }
                }
            },
            get: {
                summary: 'Get tuning history',
                description: 'Retrieves list of past tuning runs',
                tags: ['Profile Tuning'],
                parameters: [
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 }, description: 'Maximum number of results' }
                ],
                responses: {
                    '200': {
                        description: 'Tuning history retrieved',
                        content: {
                            'application/json': {
                                schema: TuningHistoryResponseSchema
                            }
                        }
                    }
                }
            }
        },
        '/profile/tune-insulin-response/{tuning_id}': {
            get: {
                summary: 'Get tuning run status',
                description: 'Retrieves status and results of a specific tuning run',
                tags: ['Profile Tuning'],
                parameters: [
                    { name: 'tuning_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
                ],
                responses: {
                    '200': {
                        description: 'Tuning status retrieved',
                        content: {
                            'application/json': {
                                schema: InsulinResponseTuningResponseSchema
                            }
                        }
                    },
                    '404': {
                        description: 'Tuning run not found'
                    }
                }
            }
        },
        '/profile/tune-insulin-response/{tuning_id}/apply': {
            post: {
                summary: 'Apply tuning results',
                description: 'Applies optimized parameters to the system and/or Nightscout profile',
                tags: ['Profile Tuning'],
                parameters: [
                    { name: 'tuning_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: TuningApplyRequestSchema
                        }
                    }
                },
                responses: {
                    '200': {
                        description: 'Tuning applied successfully',
                        content: {
                            'application/json': {
                                schema: TuningApplyResponseSchema
                            }
                        }
                    },
                    '404': {
                        description: 'Tuning run not found'
                    },
                    '400': {
                        description: 'Cannot apply tuning (not completed or invalid)'
                    }
                }
            }
        }
    }
});
