"""
Carb Absorption Optimizer — Phase 2: CI-Based Closed-Form ICR + L-BFGS-B for rate/impact.

Key design:
  - ICR is NOT gradient-optimised jointly with other params (that creates ISF entanglement).
  - Instead we solve ICR analytically per 4-hour time block:
      carb_glucose_rise  = glucose_change + (insulin_activity × ISF)   # remove insulin signal
      CI (mg/dL per g)   = carb_glucose_rise / carbs_absorbed           # directly observable
      ICR                = ISF / CI                                      # derived, not fitted
  - absorption_rate and min_carb_impact are then optimised with L-BFGS-B
    against the same meal windows using the fixed analytical ICR.
  - Bootstrap CIs for ICR come from resampling the analytical per-window CI values.
"""

import numpy as np
from scipy.optimize import minimize, Bounds
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel
import math

from .holistic_profile_analyzer import TimeWindow, HolisticProfileAnalyzer


class CarbAbsorptionResult(BaseModel):
    """Results from carb absorption optimization"""
    # Optimized parameters
    icr: List[float]                    # 6 four-hour blocks (derived from CI)
    ci_per_block: List[float]           # Carb Impact per gram, per block (the primary fitted value)
    absorption_rate: float
    min_carb_impact: float
    s_curve_params: Dict[str, float]

    # Confidence intervals (95%)
    icr_confidence: List[Tuple[float, float]]
    absorption_rate_confidence: Tuple[float, float]
    min_carb_impact_confidence: Tuple[float, float]

    # Quality metrics
    r_squared: float
    rmse: float
    mae: float
    meal_windows_analyzed: int
    windows_per_block: List[int]        # How many windows contributed to each ICR block

    # Analysis summary
    total_meal_events: int
    avg_meal_size: float
    meal_distribution_by_time: Dict[str, float]
    data_quality_score: float


# Minimum grams absorbed in a window for it to be usable for ICR fitting.
# Below this, noise dominates the CI estimate.
MIN_CARB_ABSORPTION_G = 5.0

# Minimum observable glucose rise from carbs to include a window in ICR fitting.
# Windows where carb effect is near zero yield unreliable CI.
MIN_CARB_GLUCOSE_RISE_MGDL = 10.0


class CarbAbsorptionOptimizer(HolisticProfileAnalyzer):
    """
    Two-stage carb absorption optimizer:

    Stage 1 — Analytical ICR per block (closed-form, no gradient):
        CI_block = weighted_mean(carb_glucose_rise / carbs_absorbed)
        ICR_block = ISF_block / CI_block

    Stage 2 — L-BFGS-B for absorption_rate and min_carb_impact only,
        using the Stage 1 ICR as fixed input.
    """

    def __init__(self):
        super().__init__()
        self.logs = []  # Required by HolisticProfileAnalyzer
        self.current_icr = [10.0] * 6
        self.current_isf = [50.0] * 6
        self.current_absorption_rate = 30.0
        self.current_min_carb_impact = 8.0

    # =========================================================================
    # Public entry point
    # =========================================================================

    def analyze_carb_absorption(
        self,
        windows: List[Any],
        current_icr: Optional[List[float]] = None,
        current_isf: Optional[List[float]] = None,
        current_absorption_rate: float = 30.0,
        current_min_carb_impact: float = 8.0,
        optimize_icr: bool = True,
        optimize_absorption_rate: bool = True,
        optimize_min_carb_impact: bool = True,
        lambda_l2: float = 0.1,
        lambda_smooth: float = 0.05
    ) -> Optional[CarbAbsorptionResult]:

        # Convert dicts → TimeWindow
        window_objects = []
        for w in windows:
            if isinstance(w, dict):
                window_objects.append(TimeWindow(**w))
            else:
                window_objects.append(w)

        # Keep only meal windows
        meal_windows = [w for w in window_objects if w.has_meals or w.carbs_consumed > 0]
        if len(meal_windows) < 10:
            print(f"Insufficient meal windows: {len(meal_windows)} < 10")
            return None

        self.current_icr = current_icr if current_icr else [10.0] * 6
        self.current_isf = current_isf if current_isf and len(current_isf) == 6 else [50.0] * 6
        self.current_absorption_rate = current_absorption_rate
        self.current_min_carb_impact = current_min_carb_impact
        self.window_weights = self._calculate_window_weights(meal_windows)

        # ── Stage 1: Analytical ICR ───────────────────────────────────────────
        if optimize_icr:
            opt_icr, ci_per_block, icr_confidence, windows_per_block = \
                self._fit_icr_analytically(meal_windows)
        else:
            opt_icr = list(self.current_icr)
            ci_per_block = [self.current_isf[i] / max(opt_icr[i], 0.01) for i in range(6)]
            icr_confidence = [(v * 0.85, v * 1.15) for v in opt_icr]
            windows_per_block = [0] * 6

        # ── Stage 2: L-BFGS-B for rate + impact ──────────────────────────────
        if optimize_absorption_rate or optimize_min_carb_impact:
            opt_abs_rate, opt_min_impact, abs_conf, impact_conf = \
                self._fit_rate_and_impact(
                    meal_windows, opt_icr,
                    optimize_absorption_rate, optimize_min_carb_impact,
                    lambda_l2
                )
        else:
            opt_abs_rate = current_absorption_rate
            opt_min_impact = current_min_carb_impact
            abs_conf = (opt_abs_rate, opt_abs_rate)
            impact_conf = (opt_min_impact, opt_min_impact)

        # ── Quality metrics ───────────────────────────────────────────────────
        predictions = np.array([
            self._predict(w, opt_icr, opt_abs_rate, opt_min_impact)
            for w in meal_windows
        ])
        actuals = np.array([w.glucose_change for w in meal_windows])

        ss_res = np.sum((actuals - predictions) ** 2)
        ss_tot = np.sum((actuals - np.mean(actuals)) ** 2)
        r_squared = float(1 - ss_res / ss_tot) if ss_tot > 0 else 0.0
        rmse = float(np.sqrt(np.mean((actuals - predictions) ** 2)))
        mae = float(np.mean(np.abs(actuals - predictions)))

        avg_quality = float(np.mean([
            w.data_quality.get('readings_count', 6) / 12.0
            for w in meal_windows
        ]))
        avg_quality = max(0.0, min(1.0, avg_quality))

        return CarbAbsorptionResult(
            icr=[round(v, 2) for v in opt_icr],
            ci_per_block=[round(v, 4) for v in ci_per_block],
            absorption_rate=round(float(opt_abs_rate), 2),
            min_carb_impact=round(float(opt_min_impact), 2),
            s_curve_params={"duration_multiplier": 1.2, "peak_time_ratio": 0.25, "min_base_rate": 10.0},
            icr_confidence=[(round(lo, 2), round(hi, 2)) for lo, hi in icr_confidence],
            absorption_rate_confidence=(round(abs_conf[0], 2), round(abs_conf[1], 2)),
            min_carb_impact_confidence=(round(impact_conf[0], 2), round(impact_conf[1], 2)),
            r_squared=round(r_squared, 4),
            rmse=round(rmse, 2),
            mae=round(mae, 2),
            meal_windows_analyzed=len(meal_windows),
            windows_per_block=windows_per_block,
            total_meal_events=len(meal_windows),
            avg_meal_size=float(np.mean([w.carbs_consumed for w in meal_windows if w.carbs_consumed > 0])) if meal_windows else 0.0,
            meal_distribution_by_time={},
            data_quality_score=avg_quality
        )

    # =========================================================================
    # Stage 1: Closed-form ICR per block
    # =========================================================================

    def _carb_glucose_rise(self, window: TimeWindow) -> float:
        """
        Remove the insulin signal from the observed glucose change to isolate
        the carb-only contribution.

            carb_glucose_rise = ΔGlucose + insulin_drop
                              = glucose_change + (insulin_activity × ISF)

        Positive value means carbs pushed BG up after netting out insulin's drop.
        """
        block_idx = min(window.hour_of_day // 4, 5)
        isf = self.current_isf[block_idx]
        return window.glucose_change + (window.insulin_activity * isf)

    def _fit_icr_analytically(
        self,
        meal_windows: List[TimeWindow],
        n_bootstrap: int = 100
    ) -> Tuple[List[float], List[float], List[Tuple[float, float]], List[int]]:
        """
        For each 4-hour block, compute CI as a weighted mean:
            CI_block = Σ(weight_i × rise_i / absorbed_i) / Σ(weight_i)
        Then derive ICR:
            ICR_block = ISF_block / CI_block

        Only includes windows where:
          - carbs_absorbed > MIN_CARB_ABSORPTION_G
          - carb_glucose_rise > MIN_CARB_GLUCOSE_RISE_MGDL  (real observable response)

        Confidence intervals via bootstrap resampling of the per-window CI values.
        Falls back to the current ICR for blocks with insufficient data.
        """
        # Group windows by block
        blocks: Dict[int, List[Tuple[float, float, float]]] = {i: [] for i in range(6)}
        for i, w in enumerate(meal_windows):
            if w.carb_absorption < MIN_CARB_ABSORPTION_G:
                continue
            rise = self._carb_glucose_rise(w)
            if rise < MIN_CARB_GLUCOSE_RISE_MGDL:
                continue
            ci_obs = rise / w.carb_absorption   # mg/dL per gram
            block_idx = min(w.hour_of_day // 4, 5)
            weight = self.window_weights[i] if i < len(self.window_weights) else 1.0
            blocks[block_idx].append((ci_obs, weight, w.carbs_consumed))

        opt_icr = []
        ci_per_block = []
        icr_confidence = []
        windows_per_block = []

        for b in range(6):
            isf = self.current_isf[b]
            entries = blocks[b]
            windows_per_block.append(len(entries))

            if len(entries) < 3:
                # Not enough data — keep current ICR for this block
                icr_fallback = self.current_icr[b]
                ci_fallback = isf / icr_fallback if icr_fallback > 0 else 1.0
                opt_icr.append(icr_fallback)
                ci_per_block.append(ci_fallback)
                icr_confidence.append((icr_fallback * 0.85, icr_fallback * 1.15))
                continue

            ci_vals = np.array([e[0] for e in entries])
            weights  = np.array([e[1] for e in entries])
            weights  = weights / weights.sum()

            ci_mean = float(np.average(ci_vals, weights=weights))
            ci_mean = max(ci_mean, 0.01)  # Guard against near-zero

            # Bootstrap CI for this block
            n = len(ci_vals)
            boot_cis = []
            for _ in range(n_bootstrap):
                idx = np.random.choice(n, size=n, replace=True)
                bw = weights[idx]; bw = bw / bw.sum()
                boot_cis.append(float(np.average(ci_vals[idx], weights=bw)))

            ci_lo = float(np.percentile(boot_cis, 2.5))
            ci_hi = float(np.percentile(boot_cis, 97.5))

            # Derive ICR = ISF / CI  (note: CI > 0 guaranteed by guard above)
            icr_mean = isf / ci_mean
            icr_lo   = isf / ci_hi    # dividing flips the interval
            icr_hi   = isf / ci_lo

            # Clamp to physiological range
            icr_mean = float(np.clip(icr_mean, 3.0, 50.0))
            icr_lo   = float(np.clip(icr_lo,   3.0, 50.0))
            icr_hi   = float(np.clip(icr_hi,   3.0, 50.0))

            opt_icr.append(icr_mean)
            ci_per_block.append(ci_mean)
            icr_confidence.append((min(icr_lo, icr_hi), max(icr_lo, icr_hi)))

        return opt_icr, ci_per_block, icr_confidence, windows_per_block

    # =========================================================================
    # Stage 2: L-BFGS-B for absorption_rate and min_carb_impact
    # =========================================================================

    def _fit_rate_and_impact(
        self,
        meal_windows: List[TimeWindow],
        fixed_icr: List[float],
        optimize_absorption_rate: bool,
        optimize_min_carb_impact: bool,
        lambda_l2: float
    ) -> Tuple[float, float, Tuple[float, float], Tuple[float, float]]:

        x0 = []
        bounds_list = []
        if optimize_absorption_rate:
            x0.append(self.current_absorption_rate)
            bounds_list.append((10.0, 60.0))
        if optimize_min_carb_impact:
            x0.append(self.current_min_carb_impact)
            bounds_list.append((3.0, 15.0))

        if not x0:
            return (self.current_absorption_rate, self.current_min_carb_impact,
                    (self.current_absorption_rate,) * 2,
                    (self.current_min_carb_impact,) * 2)

        x0_arr = np.array(x0)
        bounds = Bounds([b[0] for b in bounds_list], [b[1] for b in bounds_list])

        def objective(params):
            abs_rate = params[0] if optimize_absorption_rate else self.current_absorption_rate
            min_imp  = params[-1] if optimize_min_carb_impact else self.current_min_carb_impact
            err = 0.0
            for i, w in enumerate(meal_windows):
                pred = self._predict(w, fixed_icr, abs_rate, min_imp)
                wt = self.window_weights[i] if i < len(self.window_weights) else 1.0
                err += wt * (w.glucose_change - pred) ** 2
            err += lambda_l2 * np.sum((params - x0_arr) ** 2)
            return err

        result = minimize(objective, x0_arr, method='L-BFGS-B', bounds=bounds,
                          options={'maxiter': 500})

        params = result.x
        abs_rate = float(params[0]) if optimize_absorption_rate else self.current_absorption_rate
        min_imp  = float(params[-1]) if optimize_min_carb_impact else self.current_min_carb_impact

        # Bootstrap CIs for rate/impact
        n = len(meal_windows)
        boot_rates, boot_impacts = [], []
        for _ in range(50):
            idx = np.random.choice(n, size=n, replace=True)
            sampled = [meal_windows[i] for i in idx]
            sampled_weights = [self.window_weights[i] if i < len(self.window_weights) else 1.0 for i in idx]
            _orig = self.window_weights
            self.window_weights = sampled_weights

            res2 = minimize(objective, params, method='L-BFGS-B', bounds=bounds,
                            options={'maxiter': 100})
            self.window_weights = _orig
            if res2.success:
                boot_rates.append(float(res2.x[0]) if optimize_absorption_rate else abs_rate)
                boot_impacts.append(float(res2.x[-1]) if optimize_min_carb_impact else min_imp)

        abs_conf = (
            (float(np.percentile(boot_rates, 2.5)), float(np.percentile(boot_rates, 97.5)))
            if boot_rates else (abs_rate * 0.85, abs_rate * 1.15)
        )
        impact_conf = (
            (float(np.percentile(boot_impacts, 2.5)), float(np.percentile(boot_impacts, 97.5)))
            if boot_impacts else (min_imp * 0.85, min_imp * 1.15)
        )

        return abs_rate, min_imp, abs_conf, impact_conf

    # =========================================================================
    # Shared prediction formula
    # =========================================================================

    def _predict(
        self,
        window: TimeWindow,
        icr_rates: List[float],
        abs_rate: float,
        min_impact: float
    ) -> float:
        block_idx = min(window.hour_of_day // 4, 5)
        icr = icr_rates[block_idx]
        isf = self.current_isf[block_idx]

        carb_impact   = (window.carb_absorption / icr) * isf if icr > 0 else 0.0
        insulin_drop  = window.insulin_activity * isf
        return carb_impact - insulin_drop + window.activity_impact

    # Keep the old name as an alias so nothing else breaks
    def _predict_glucose_change_with_params(self, window, icr_rates, abs_rate, min_impact):
        return self._predict(window, icr_rates, abs_rate, min_impact)
