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

const ActivityItemSchema = z.object({
    type: z.string().meta({ example: 'hr-bpm' }),
    timeStamp: z.number().meta({ description: 'Epoch ms', example: 1699935150978 }),
    created_at: z.string().datetime(),
    bpm: z.number().optional(),
    steps: z.number().optional(),
    accuracy: z.number().optional()
}).meta({ description: 'Activity data item (heart rate, steps, etc.)' });

const ActivityPOSTRequestSchema = z.union([
    ActivityItemSchema,
    z.array(ActivityItemSchema)
]).meta({ description: 'Single activity item or array of items' });

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
        title: 'NightManager API',
        version: '1.0.0',
        description: 'Diabetes Management and Predictive Analysis API',
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
        '/activity': {
            post: {
                summary: 'Record new activity data',
                requestBody: {
                    content: { 'application/json': { schema: ActivityPOSTRequestSchema } }
                },
                responses: {
                    200: { description: 'Success', content: { 'application/json': { schema: ActivityPOSTResponseSchema } } }
                }
            }
        }
    }
});
