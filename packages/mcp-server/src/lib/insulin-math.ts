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
