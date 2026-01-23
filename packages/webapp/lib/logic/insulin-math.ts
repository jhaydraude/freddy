/**
 * Exponential IOB decay function using an integrated Gamma-style activity curve.
 * This approach is very stable and ensures IOB(0)=1 and IOB(DIA)=0.
 */
export function decayIOB(t: number, dia: number, peak: number = 55): number {
    const td = dia * 60; // total duration in minutes
    if (t <= 0) return 1;
    if (t >= td) return 0;

    const tau = peak; // peak in minutes

    // We use a simplified numerical integration of (x/tau^2)*exp(-x/tau)
    // To be efficient, we'll use the analytical integral: 1 - (1 + t/tau)*exp(-t/tau)
    // But we must normalize it so that at t=td, the integral is 1.0 (so IOB is 0)

    const activityIntegral = (x: number) => 1 - (1 + x / tau) * Math.exp(-x / tau);
    const normalization = 1 / activityIntegral(td);

    const iob = 1 - (activityIntegral(t) * normalization);
    return Math.max(0, iob);
}

/**
 * Calculates the instantaneous insulin activity rate (derivative of decay).
 * Returns the fraction of insulin consumed per minute at time t.
 * Multiply this by initial insulin to get units/min.
 */
export function activityInsulin(t: number, dia: number, peak: number = 55): number {
    const td = dia * 60;
    if (t <= 0 || t >= td) return 0;

    const tau = peak;

    // The activity curve (PDF) is (t / tau^2) * exp(-t / tau)
    const pdf = (t / (tau * tau)) * Math.exp(-t / tau);

    // Normalization must match decayIOB to ensure integral is 1.0 (over [0, td])
    const activityIntegral = (x: number) => 1 - (1 + x / tau) * Math.exp(-x / tau);
    const normalization = 1 / activityIntegral(td);

    return pdf * normalization;
}
