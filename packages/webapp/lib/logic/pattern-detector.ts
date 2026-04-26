import { ComputedStatus } from '../db/models';
import { SurfacedPattern, ISurfacedPattern, PatternType } from '../db/models/surfaced-pattern';
import { randomUUID } from 'crypto';

export interface PatternDetectionResult {
    scannedDays: number;
    patternsFound: number;
    upsertedCount: number;
}

export async function detectRecurringPatterns(lookbackDays: number = 14): Promise<PatternDetectionResult> {
    const end = new Date();
    const start = new Date(end.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

    const { resolveActiveProfile } = await import('./profile-logic');
    const profile = await resolveActiveProfile(end, true);
    const unit = profile?.profileData?.units === 'mmol/L' || profile?.profileData?.units === 'mmol' ? 'mmol/L' : 'mg/dL';
    const threshold = unit === 'mmol/L' ? 0.8 : 15;

    // 1. Aggregate ComputedStatus to find adjusted unexplained delta by day & 2-hour block
    // We adjust by adding the activity value back into unexplained (to ignore activity impacts)
    const pipeline = [
        {
            $match: {
                timestamp: { $gte: start, $lte: end },
                'status.attribution': { $exists: true }
            }
        },
        {
            $addFields: {
                hourOfDay: { $hour: '$timestamp' },
                dateKey: {
                    $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
                },
                tf30: {
                    $arrayElemAt: [
                        {
                            $filter: {
                                input: { $ifNull: ['$status.attribution.timeframes', []] },
                                as: 'tf',
                                cond: { $eq: ['$$tf.minutes', 30] }
                            }
                        },
                        0
                    ]
                }
            }
        },
        {
            $match: { tf30: { $ne: null } }
        },
        {
            $addFields: {
                adjustedUnexplained: {
                    $add: [
                        { $ifNull: ['$tf30.components.unexplained', 0] },
                        { $ifNull: ['$tf30.components.activity.value', 0] }
                    ]
                },
                block: { $floor: { $divide: ['$hourOfDay', 2] } } // 0-11 for 2-hour blocks
            }
        },
        // Group by day and block to get the average adjusted unexplained for that block on that day
        {
            $group: {
                _id: { date: '$dateKey', block: '$block' },
                dailyBlockAvg: { $avg: '$adjustedUnexplained' },
                dailyBlockMax: { $max: { $abs: '$adjustedUnexplained' } }
            }
        },
        // Group by block to find the recurring pattern across days
        {
            $group: {
                _id: '$_id.block',
                daysObserved: {
                    $sum: {
                        $cond: [{ $gt: [{ $abs: '$dailyBlockAvg' }, threshold] }, 1, 0]
                    }
                },
                meanMagnitude: { $avg: '$dailyBlockAvg' },
                maxMagnitude: { $max: '$dailyBlockMax' },
                datesObserved: {
                    $push: {
                        $cond: [{ $gt: [{ $abs: '$dailyBlockAvg' }, threshold] }, '$_id.date', null]
                    }
                }
            }
        },
        // Filter out nulls from datesObserved
        {
            $project: {
                daysObserved: 1,
                meanMagnitude: 1,
                maxMagnitude: 1,
                datesObserved: {
                    $filter: {
                        input: '$datesObserved',
                        as: 'd',
                        cond: { $ne: ['$$d', null] }
                    }
                }
            }
        },
        // Filter blocks where the anomaly occurred on > 5 days
        {
            $match: {
                daysObserved: { $gt: 5 }
            }
        }
    ];

    const blockData = await ComputedStatus.aggregate(pipeline);

    let patternsFound = 0;
    let upsertedCount = 0;

    for (const b of blockData) {
        patternsFound++;
        const blockIndex = b._id;
        const startHour = blockIndex * 2;
        const endHour = startHour + 2;
        
        // Simple classification mapping
        let patternType: PatternType = 'time_of_day_hypo';
        if (startHour >= 0 && startHour < 6) {
            patternType = 'overnight_unexplained_delta';
        } else if (b.meanMagnitude > 0) {
             // Heuristically call positive drifts during day "persistent high" or we can use time_of_day_hypo for drops
             patternType = 'persistent_high_unexplained';
        }

        const dates = b.datesObserved.map((d: string) => new Date(d)).sort((a: any, b: any) => a - b);
        const firstObserved = dates.length > 0 ? dates[0] : start;
        const lastObserved = dates.length > 0 ? dates[dates.length - 1] : end;
        const direction = b.meanMagnitude >= 0 ? 'positive' : 'negative';

        // Check if a pattern for this exact type and window already exists and is active
        const existing = await SurfacedPattern.findOne({
            pattern_type: patternType,
            status: 'active',
            'time_window.start_hour': startHour,
            'time_window.end_hour': endHour
        });

        if (existing) {
            existing.last_observed = lastObserved;
            existing.occurrence_count = b.daysObserved;
            existing.magnitude.mean = Math.round(b.meanMagnitude * 10) / 10;
            existing.magnitude.max = Math.round(b.maxMagnitude * 10) / 10;
            existing.magnitude.direction = direction;
            existing.updated_at = new Date();
            await existing.save();
            upsertedCount++;
        } else {
            await SurfacedPattern.create({
                pattern_id: randomUUID(),
                pattern_type: patternType,
                first_observed: firstObserved,
                last_observed: lastObserved,
                occurrence_count: b.daysObserved,
                days_in_window: lookbackDays,
                time_window: {
                    start_hour: startHour,
                    end_hour: endHour
                },
                magnitude: {
                    mean: Math.round(b.meanMagnitude * 10) / 10,
                    max: Math.round(b.maxMagnitude * 10) / 10,
                    direction: direction
                },
                concurrent_factors: {},
                confidence: b.daysObserved >= 10 ? 'high' : 'medium',
                status: 'active'
            });
            upsertedCount++;
        }
    }

    // Auto-resolve patterns that haven't been seen in the last 5 days
    const staleCutoff = new Date(end.getTime() - 5 * 24 * 60 * 60 * 1000);
    await SurfacedPattern.updateMany({
        status: 'active',
        last_observed: { $lt: staleCutoff }
    }, {
        $set: { status: 'resolved', resolution_notes: 'Auto-resolved after 5 days of inactivity' }
    });

    return {
        scannedDays: lookbackDays,
        patternsFound,
        upsertedCount
    };
}
