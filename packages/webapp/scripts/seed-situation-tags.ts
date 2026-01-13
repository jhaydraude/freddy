import 'dotenv/config';
import { SituationTag } from '../lib/db/models';
import { connectToDatabase } from '../lib/db/connection';

const SEED_TAGS = [
    {
        tag_id: 'eating',
        display_name: 'Eating',
        description: 'Actively eating or digesting a meal',
        category: 'nutrition',
        color: '#4CAF50',
        typical_duration_min: 120,
        delayed_impact_hours: 0,
        prediction_adjustments: {
            cob_adjustment: 0
        },
        is_system: true
    },
    {
        tag_id: 'under_reported_carbs',
        display_name: 'Under-reported Carbs',
        description: 'More carbs consumed than logged in the system',
        category: 'nutrition',
        color: '#FF9800',
        typical_duration_min: 180,
        delayed_impact_hours: 0,
        prediction_adjustments: {
            cob_adjustment: 20
        },
        is_system: true
    },
    {
        tag_id: 'activity',
        display_name: 'Activity',
        description: 'Physical exercise or movement (intensity tracked via metadata)',
        category: 'activity',
        color: '#2196F3',
        typical_duration_min: 60,
        delayed_impact_hours: 6,
        prediction_adjustments: {
            isf_multiplier: 1.2
        },
        is_system: true,
        is_active: true
    },
    {
        tag_id: 'heavy_activity',
        display_name: 'Heavy Activity (Legacy)',
        description: 'Intense physical exercise or labor - DEPRECATED: Use activity tag',
        category: 'activity',
        color: '#2196F3',
        typical_duration_min: 60,
        delayed_impact_hours: 6,
        prediction_adjustments: {
            isf_multiplier: 1.3
        },
        is_system: true,
        is_active: false
    },
    {
        tag_id: 'light_activity',
        display_name: 'Light Activity (Legacy)',
        description: 'Light movement, walking, or chores - DEPRECATED: Use activity tag',
        category: 'activity',
        color: '#03A9F4',
        typical_duration_min: 45,
        delayed_impact_hours: 3,
        prediction_adjustments: {
            isf_multiplier: 1.15
        },
        is_system: true,
        is_active: false
    },
    {
        tag_id: 'compression_low',
        display_name: 'Compression Low',
        description: 'False low glucose due to pressure on sensor',
        category: 'sensor',
        color: '#9C27B0',
        typical_duration_min: 30,
        delayed_impact_hours: 0,
        prediction_adjustments: {
            confidence_penalty: 0.8
        },
        is_system: true
    },
    {
        tag_id: 'noisy_sensor',
        display_name: 'Noisy Sensor (Legacy)',
        description: 'Erratic or unstable sensor readings - DEPRECATED: Use sensor_failure',
        category: 'sensor',
        color: '#757575',
        typical_duration_min: 60,
        delayed_impact_hours: 0,
        prediction_adjustments: {
            confidence_penalty: 0.5
        },
        is_system: true,
        is_active: false
    },
    {
        tag_id: 'sensor_warmup',
        display_name: 'Sensor Warmup',
        description: 'New sensor started - readings may be absent or unreliable',
        category: 'sensor',
        color: '#607D8B',
        typical_duration_min: 120,
        delayed_impact_hours: 0,
        prediction_adjustments: {
            confidence_penalty: 0.3
        },
        is_system: true
    },
    {
        tag_id: 'sensor_failure',
        display_name: 'Sensor Failure',
        description: 'Sensor not reporting data or technical error',
        category: 'sensor',
        color: '#212121',
        typical_duration_min: 60,
        delayed_impact_hours: 0,
        prediction_adjustments: {
            confidence_penalty: 0.1
        },
        is_system: true
    },
    {
        tag_id: 'illness',
        display_name: 'Illness',
        description: 'Increased insulin resistance due to being sick',
        category: 'physiological',
        color: '#F44336',
        typical_duration_min: 1440,
        delayed_impact_hours: 0,
        prediction_adjustments: {
            isf_multiplier: 0.8
        },
        is_system: true
    },
    {
        tag_id: 'stress',
        display_name: 'Stress',
        description: 'Elevated glucose or resistance due to stress',
        category: 'physiological',
        color: '#E91E63',
        typical_duration_min: 120,
        delayed_impact_hours: 0,
        is_system: true
    },
    {
        tag_id: 'alcohol',
        display_name: 'Alcohol',
        description: 'Consumption of alcohol affecting metabolism',
        category: 'nutrition',
        color: '#795548',
        typical_duration_min: 480,
        delayed_impact_hours: 12,
        is_system: true
    },
    {
        tag_id: 'slow_absorption',
        display_name: 'Slow Absorption',
        description: 'Carbs are absorbing slower than the current model expects',
        category: 'nutrition',
        color: '#8BC34A',
        typical_duration_min: 240,
        delayed_impact_hours: 0,
        prediction_adjustments: {
            confidence_penalty: 0.9
        },
        is_system: true
    },
    {
        tag_id: 'rapid_absorption',
        display_name: 'Rapid Absorption',
        description: 'Fast-acting carbs (juice, glucose tabs, candy)',
        category: 'nutrition',
        color: '#FFEB3B',
        typical_duration_min: 30,
        delayed_impact_hours: 0,
        prediction_adjustments: {
            cob_adjustment: 10
        },
        is_system: true
    },
    {
        tag_id: 'site_failure',
        display_name: 'Site Failure',
        description: 'Infusion set occlusion or bad site placement',
        category: 'physiological',
        color: '#D32F2F',
        typical_duration_min: 180,
        delayed_impact_hours: 0,
        prediction_adjustments: {
            confidence_penalty: 0.8
        },
        is_system: true
    },
    {
        tag_id: 'dawn_phenomenon',
        display_name: 'Dawn Phenomenon',
        description: 'Morning rise from cortisol/growth hormone (4am-8am)',
        category: 'physiological',
        color: '#FF6F00',
        typical_duration_min: 240,
        delayed_impact_hours: 0,
        prediction_adjustments: {
            isf_multiplier: 0.8
        },
        is_system: true
    },
    {
        tag_id: 'over_correction',
        display_name: 'Over Correction',
        description: 'Too much insulin taken for a high or meal',
        category: 'physiological',
        color: '#FF5722',
        typical_duration_min: 180,
        delayed_impact_hours: 0,
        prediction_adjustments: {
            isf_multiplier: 0.9 // Be cautious, insulin is more effective or excessive
        },
        is_system: true
    },
    {
        tag_id: 'dont_use',
        display_name: "Don't Use",
        description: 'Exclude this window from model training (bad data/atypical)',
        category: 'other',
        color: '#000000',
        typical_duration_min: 0,
        delayed_impact_hours: 0,
        is_system: true
    },
    {
        tag_id: 'normal',
        display_name: 'Normal',
        description: 'Baseline state with no special conditions',
        category: 'other',
        color: '#9E9E9E',
        typical_duration_min: 0,
        delayed_impact_hours: 0,
        is_system: true
    }
];

async function seed() {
    try {
        await connectToDatabase();
        console.log('Connected to database');

        for (const tag of SEED_TAGS) {
            await SituationTag.findOneAndUpdate(
                { tag_id: tag.tag_id },
                { $set: tag },
                { upsert: true, new: true }
            );
            console.log(`Seeded tag: ${tag.tag_id}`);
        }

        console.log('Seeding complete');
        process.exit(0);
    } catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    }
}

seed();
