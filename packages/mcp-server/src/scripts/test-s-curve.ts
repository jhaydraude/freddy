
/**
 * Prototype for S-Curve Absorption Model
 * 
 * Objectives:
 * 1. Define S-curve function A(t) for cumulative absorption.
 * 2. Define Rate function R(t) = dA/dt.
 * 3. Implement superposition for distributed carbs.
 * 4. Verify total area under curve = total carbs.
 */

// --- 1. The Model ---
// We'll use a standard bilinear model often used in artificial pancreas systems:
// Ramp up to Peak time (t_p), then exponential or linear decay.
// Actually, a simple biexponential "Wilska" model or "Scheiner" model is standard.
// Let's use a simplified version:
// A(t) = Carbs * (1 - e^(-kt)) ?? No, that's just decay.
// We want a delay.
// Let's stick to the "Linear-Parabolic" or just a simple piecewise model for predictability.
//
// Model:
// Rate(t) rises linearly from 0 to PeakRate at PeakTime (tp).
// Then decays linearly to 0 at EndTime (te).
// This forms a triangle. Area = 0.5 * te * PeakRate = Total Carbs.
// So PeakRate = 2 * Carbs / te.
//
// However, end time is effectively infinite in exponential, but we need a finite end for display.
// Let's calculate `te` based on user's "absorption duration" setting (3h, 4h, etc).
// Profile "min_5m_carbimpact" effectively sets the rate.
//
// Let's assume a fixed S-curve shape where "Duration" is the primary parameter.
// But we don't have a "Duration" for normal meals, we have "Rate" (ISF/CR based).
//
// Let T_absorb = (Carbs / Rate_linear). This is the EndTime for the rectangle model.
// For a triangle model with same duration T_absorb:
// Peak = 2 * Rate_linear.
// 
// Let's implement the refined Linear Decay we analyzed in the walkthrough (S-curve suggestion).
// Actually, simple S-curve: 
// t^2 / (t^2 + T_50^2) ? Hill equation.
//
// Let's try the "Scheiner" curve logic approximated:
// Activity = (2 * Carbs / Duration) * (t / PeakTime)   for t < PeakTime
// Activity = (2 * Carbs / Duration) * ((Duration - t) / (Duration - PeakTime)) for t > Peak and < Duration
//
// We can define PeakTime as a fraction of total duration (e.g. 1/3 or fixed 45 mins).

function getTriangleParameters(carbs: number, absorbRateGPer5Min: number) {
    // Current linear model: Time = Carbs / Rate
    const linearDurationMin = (carbs / absorbRateGPer5Min) * 5;

    // For the new model to respect the same "speed", let's say the Triangle 
    // should have roughly the same effective duration.
    // Let's set Total Duration = 1.5 * LinearDuration (to allow for the tail).
    const durationMin = linearDurationMin * 1.5;

    // Peak at 1/3 of duration ?? Or 45 mins?
    // "Fast" carbs peak at 45-60m. 
    // Let's define peak relative to duration.
    const peakTimeMin = Math.max(15, durationMin * 0.3);

    return { durationMin, peakTimeMin };
}

function getInstantBolusRate(t_min: number, carbs: number, durationMin: number, peakTimeMin: number): number {
    if (t_min < 0) return 0;
    if (t_min >= durationMin) return 0;

    const peakRate = (2 * carbs) / durationMin; // Conservation of mass: Area = 0.5 * base * height

    if (t_min < peakTimeMin) {
        // Ramp up phase
        return peakRate * (t_min / peakTimeMin);
    } else {
        // Decay phase
        return peakRate * ((durationMin - t_min) / (durationMin - peakTimeMin));
    }
}

// --- 2. Distributed Bolus ---
function getDistributedBolusRate(t_min: number, carbs: number, distributionDurationMin: number, absorbRate: number) {
    // High-resolution numerical integration (1 minute steps)
    // This simulates the superposition of many small carb events.
    const steps = distributionDurationMin; // 1 step per minute
    const stepSize = 1; // 1 minute
    const carbsPerStep = carbs / steps;

    // Kernel Approach:
    // We define the "shape" of digestion for a standard slice of this meal.
    // But importantly, the shape params depend on the TOTAL meal size (carbs),
    // not the slice size, because we assume the digestive kinetics are set by the total load.
    // This scales the "15g curve" down to "1/60th amplitude", rather than
    // creating a "tiny super-fast 0.25g curve".
    const kernelParams = getTriangleParameters(carbs, absorbRate);

    let totalRate = 0;

    for (let i = 0; i < steps; i++) {
        const entryTime = i * stepSize;
        if (t_min >= entryTime) {
            // Rate contributed by this slice at time t
            const sliceRate = getInstantBolusRate(
                t_min - entryTime,
                carbsPerStep,
                kernelParams.durationMin,
                kernelParams.peakTimeMin
            );
            totalRate += sliceRate;
        }
    }

    return totalRate;
}

const testCarbs = 15;
const testDuration = 60;
const testRate = 2.5; // 2.5g/5min = 30g/hr = 0.5g/min.

console.log('--- Instant Bolus (15g) ---');
let sumInstant = 0;
const instantParams = getTriangleParameters(testCarbs, testRate);
console.log(`Params: Dur=${instantParams.durationMin}, Peak=${instantParams.peakTimeMin}`);
for (let t = 0; t <= instantParams.durationMin + 10; t += 5) {
    const rate = getInstantBolusRate(t, testCarbs, instantParams.durationMin, instantParams.peakTimeMin);
    // rate is g/min ?? No my function return unit?
    // Formula: Peak = 2*C/D. Units: g/min.
    // So to get g/5min we * 5.
    const rate5 = rate * 5;
    sumInstant += rate5;
    if (t % 10 === 0) console.log(`T=${t}: ${rate5.toFixed(2)} g/5min`);
}
console.log(`Total Absorbed: ${sumInstant.toFixed(2)}g`);


console.log('\n--- Distributed Bolus (15g / 60min) ---');
let sumDist = 0;
// We assume the "packets" use the same logic implies strictly linear superposition
// We simulate this by summing "rates"
for (let t = 0; t <= 120; t += 5) {
    // For distribution, we pass the total carbs and the distribution window
    // The internal logic slices it.
    const rate = getDistributedBolusRate(t, testCarbs, testDuration, testRate);
    const rate5 = rate * 5; // convert rate(g/min) to g/5min
    sumDist += rate5;
    if (t % 10 === 0) console.log(`T=${t}: ${rate5.toFixed(2)} g/5min`);
}
console.log(`Total Absorbed: ${sumDist.toFixed(2)}g`);
