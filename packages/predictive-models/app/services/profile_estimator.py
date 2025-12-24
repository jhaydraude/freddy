"""
Profile parameter estimation from observed physiological effects.
"""

import numpy as np
from typing import List, Dict, Any, Optional
from pydantic import BaseModel


class CorrectionEvent(BaseModel):
    """Single insulin correction event"""
    timestamp: str
    insulin_delivered: float
    iob_before: float
    iob_after: float
    total_active_insulin: float
    glucose_before: float
    glucose_after: float
    glucose_change: float
    dia_hours: float
    quality: str  # 'high', 'medium', 'low'


class ISFEstimationResult(BaseModel):
    """ISF estimation results"""
    estimated_isf: float
    confidence_interval_lower: float
    confidence_interval_upper: float
    sample_count: int
    high_quality_count: int
    quality: str  # 'high', 'medium', 'low'
    individual_estimates: List[float]


class ProfileEstimator:
    """Estimate ISF and ICR from observed physiological effects"""
    
    def estimate_isf(
        self, 
        correction_events: List[Dict[str, Any]]
    ) -> Optional[ISFEstimationResult]:
        """
        Estimate ISF from insulin correction events.
        
        Uses median of observed glucose changes per unit of total active insulin.
        Filters for high-quality events and provides confidence intervals.
        
        Args:
            correction_events: List of correction event dictionaries
            
        Returns:
            ISFEstimationResult or None if insufficient data
        """
        if not correction_events:
            return None
        
        # Convert to Pydantic models for validation
        try:
            events = [CorrectionEvent(**e) for e in correction_events]
        except Exception as e:
            print(f"Error validating events: {e}")
            return None
        
        # Filter for valid events
        valid_events = [
            e for e in events
            if e.quality in ['high', 'medium']
            and e.iob_before < 1.0  # Low initial IOB
            and e.iob_after < 0.3   # Insulin mostly acted
            and abs(e.glucose_change) > 10  # Meaningful change
            and e.total_active_insulin > 0.1  # Avoid division by near-zero
        ]
        
        if len(valid_events) < 3:
            return None  # Not enough data
        
        # Calculate ISF from each event
        # ISF = |glucose_change| / total_active_insulin
        isf_estimates = [
            abs(e.glucose_change) / e.total_active_insulin
            for e in valid_events
        ]
        
        # Use median to avoid outliers
        estimated_isf = float(np.median(isf_estimates))
        
        # Calculate confidence interval (25th and 75th percentiles)
        q25, q75 = np.percentile(isf_estimates, [25, 75])
        
        # Count high quality events
        high_quality_count = len([e for e in valid_events if e.quality == 'high'])
        
        # Determine overall quality
        if len(valid_events) >= 10 and high_quality_count >= 5:
            quality = 'high'
        elif len(valid_events) >= 5:
            quality = 'medium'
        else:
            quality = 'low'
        
        return ISFEstimationResult(
            estimated_isf=estimated_isf,
            confidence_interval_lower=float(q25),
            confidence_interval_upper=float(q75),
            sample_count=len(valid_events),
            high_quality_count=high_quality_count,
            quality=quality,
            individual_estimates=isf_estimates
        )
    
    def estimate_icr_conservative(
        self,
        meal_events: List[Dict[str, Any]],
        estimated_isf: float
    ) -> Optional[Dict[str, Any]]:
        """
        Estimate conservative lower bound for ICR from meal events.
        
        Note: Carbs are often under-reported, so this provides a minimum ICR.
        True ICR is likely higher than this estimate.
        
        Args:
            meal_events: List of meal event dictionaries
            estimated_isf: Previously estimated ISF value
            
        Returns:
            Dictionary with ICR estimate and metadata, or None
        """
        # TODO: Implement when meal event detection is ready
        return None
