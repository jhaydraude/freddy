import numpy as np
from scipy.optimize import minimize, Bounds
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel
import math

from .holistic_profile_analyzer import TimeWindow, HolisticProfileAnalyzer

class BasalRateResult(BaseModel):
    rates: List[float]                  # 12 two-hour blocks
    rates_confidence: List[Tuple[float, float]]
    drift_per_block: List[float]
    windows_per_block: List[int]
    rmse: float
    mae: float
    r_squared: float
    clean_windows_analyzed: int

class BasalRateOptimizer(HolisticProfileAnalyzer):
    def __init__(self):
        super().__init__()
        self.logs = []
        self.current_rates = [1.0] * 12
        self.current_isf = [50.0] * 12

    def analyze_basal_rates(
        self,
        windows: List[Any],
        current_rates: List[float],
        current_isf: List[float],
        lambda_l2: float = 0.5,
        lambda_smooth: float = 0.3
    ) -> Optional[BasalRateResult]:
        
        window_objects = []
        for w in windows:
            if isinstance(w, dict):
                # Ensure basal_drift is handled if missing
                if 'basal_drift' not in w and 'glucose_change' in w:
                    w['basal_drift'] = w.get('glucose_change', 0)
                window_objects.append(TimeWindow(**w))
            else:
                window_objects.append(w)

        # Filter clean basal windows
        clean_windows = [
            w for w in window_objects 
            if not getattr(w, 'has_meals', False) and 
               w.data_quality.get('readings_count', 0) >= 6 and 
               getattr(w, 'basal_drift', None) is not None and
               getattr(w, 'isolation_confidence', 0.0) >= 0.2
        ]

        if len(clean_windows) < 10:
            print(f"Insufficient pure basal windows: {len(clean_windows)} < 10")
            return None

        self.current_rates = current_rates if current_rates and len(current_rates) == 12 else [1.0] * 12
        self.current_isf = current_isf if current_isf and len(current_isf) == 12 else [50.0] * 12

        # Assign weights based on duration, data quality, and isolation confidence
        weights = []
        for w in clean_windows:
            rc = w.data_quality.get('readings_count', 6)
            q = min(1.0, rc / 12.0)
            conf = getattr(w, 'isolation_confidence', 1.0)
            weights.append(q * conf * w.duration_hours)
        self.weights = np.array(weights)

        # Optimize
        opt_rates, conf_intervals = self._fit_lbfgs_b(clean_windows, lambda_l2, lambda_smooth)

        # Metrics
        windows_per_block = [0] * 12
        drift_per_block = [0.0] * 12
        drift_sums = [0.0] * 12

        for w in clean_windows:
            block_idx = min(11, int(w.hour_of_day // 2))
            windows_per_block[block_idx] += 1
            drift_sums[block_idx] += w.basal_drift or 0.0

        for i in range(12):
            if windows_per_block[i] > 0:
                drift_per_block[i] = drift_sums[i] / windows_per_block[i]

        predictions = np.array([self._predict(w, opt_rates) for w in clean_windows])
        actuals = np.array([self._get_pure_drift(w) for w in clean_windows])

        ss_res = np.sum(self.weights * (actuals - predictions) ** 2)
        ss_tot = np.sum(self.weights * (actuals - np.average(actuals, weights=self.weights)) ** 2)
        r_squared = float(1 - ss_res / ss_tot) if ss_tot > 0 else 0.0
        
        rmse = float(np.sqrt(np.average((actuals - predictions) ** 2, weights=self.weights)))
        mae = float(np.average(np.abs(actuals - predictions), weights=self.weights))

        return BasalRateResult(
            rates=[round(r, 3) for r in opt_rates],
            rates_confidence=[(round(lo, 3), round(hi, 3)) for lo, hi in conf_intervals],
            drift_per_block=[round(d, 2) for d in drift_per_block],
            windows_per_block=windows_per_block,
            rmse=round(rmse, 2),
            mae=round(mae, 2),
            r_squared=round(r_squared, 4),
            clean_windows_analyzed=len(clean_windows)
        )

    def _get_pure_drift(self, window: TimeWindow) -> float:
        # basal_drift from TypeScript is already the pure biological drift (assuming 0 insulin and 0 activity)
        return getattr(window, 'basal_drift', 0.0)

    def _predict(self, window: TimeWindow, rates: List[float]) -> float:
        block_idx = min(11, int(window.hour_of_day // 2))
        candidate_rate = rates[block_idx]
        autosens = getattr(window, 'autosens_ratio', 1.0)
        isf = self.current_isf[block_idx]
        
        # Expected drop in BG caused by this candidate basal rate
        expected_drop = candidate_rate * window.duration_hours * isf * autosens
        return expected_drop

    def _objective(self, rates: np.ndarray, windows: List[TimeWindow], lambda_l2: float, lambda_smooth: float) -> float:
        total_error = 0.0
        for i, w in enumerate(windows):
            pure_drift = self._get_pure_drift(w)
            pred_drop = self._predict(w, rates)
            residual = pure_drift - pred_drop
            total_error += self.weights[i] * (residual ** 2)

        # L2 Regularization towards current profile
        l2_penalty = lambda_l2 * np.sum((rates - np.array(self.current_rates)) ** 2)

        # Smoothness penalty
        diffs = np.diff(rates)
        # also wrap around (midnight)
        wrap_diff = rates[0] - rates[-1]
        smoothness_penalty = lambda_smooth * (np.sum(diffs ** 2) + wrap_diff ** 2)

        return float(total_error + l2_penalty + smoothness_penalty)

    def _fit_lbfgs_b(self, windows: List[TimeWindow], lambda_l2: float, lambda_smooth: float) -> Tuple[List[float], List[Tuple[float, float]]]:
        bounds = Bounds([0.0] * 12, [3.0] * 12)
        x0 = np.array(self.current_rates)

        res = minimize(
            self._objective,
            x0,
            args=(windows, lambda_l2, lambda_smooth),
            method='L-BFGS-B',
            bounds=bounds
        )

        opt_rates = res.x

        # Bootstrap for CIs
        n_bootstraps = 50
        n_windows = len(windows)
        bootstrap_results = []

        if n_windows > 0:
            # We don't want the bootstrap to be completely unbounded and drift far from local minimum
            # Just add some regularisation logic directly here
            indices = np.arange(n_windows)
            
            for b in range(n_bootstraps):
                sample_idx = np.random.choice(indices, size=n_windows, replace=True)
                sample_windows = [windows[i] for i in sample_idx]
                
                # Temporarily swap weights
                old_weights = self.weights
                self.weights = np.array([old_weights[i] for i in sample_idx])
                
                b_res = minimize(
                    self._objective,
                    opt_rates, # start at optimum
                    args=(sample_windows, lambda_l2, lambda_smooth),
                    method='L-BFGS-B',
                    bounds=bounds
                )
                bootstrap_results.append(b_res.x)
                
                self.weights = old_weights

        bootstrap_results = np.array(bootstrap_results)
        conf_intervals = []
        for i in range(12):
            if len(bootstrap_results) > 0:
                lo = np.percentile(bootstrap_results[:, i], 2.5)
                hi = np.percentile(bootstrap_results[:, i], 97.5)
            else:
                lo, hi = opt_rates[i], opt_rates[i]
            conf_intervals.append((float(lo), float(hi)))

        return opt_rates.tolist(), conf_intervals
