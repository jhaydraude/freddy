# Profile Parameter Tuning - Complete Implementation Plan

**Project**: Profile Analyzer Refresh - Comprehensive Parameter Tuning  
**Created**: 2026-01-17  
**Updated**: 2026-01-17  
**Status**: Planning

---

## Overview

This plan outlines the implementation of **comprehensive parameter tuning** functionality via a new dedicated **Tuning page**. The system will allow users to optimize all major profile parameters using historical data and advanced optimization algorithms.

**Note**: The existing Profile page (`/profile`) will be retained and marked for deprecation. All new tuning functionality will be implemented in a new Tuning page (`/tuning`).

### Complete Parameter Tuning Scope

This system will tune four major categories of parameters:

#### 1. **Insulin Response Parameters**
- **DIA (Duration of Insulin Action)** - Total duration insulin remains active (hours)
- **Peak Time** - Time when insulin activity reaches maximum (minutes)
- **ISF (Insulin Sensitivity Factor)** - How much 1U insulin lowers glucose (mg/dL per unit, 6 time blocks)

#### 2. **Carb Absorption Parameters**
- **ICR (Insulin to Carb Ratio)** - Grams of carbs covered by 1U insulin (6 time blocks)
- **Default Absorption Rate** - Base carb absorption speed (g/hr)
- **Min Carb Impact** - Minimum glucose impact per 5 minutes (mg/dL/5min)
- **Triangle S-Curve Parameters**:
  - Duration multiplier (curve shape)
  - Peak time ratio (when absorption peaks)
  - Minimum base rate (absorption floor)

#### 3. **Activity Impact Parameters**
- **Steps Per Minute Coefficient** - Glucose impact per step/min (mg/dL)
- **HR Spike Coefficient** - Glucose impact per HR elevation unit (mg/dL)
- **Calories Coefficient** - Glucose impact per kcal (mg/dL)
- **Stairs Coefficient** - Glucose impact per floor climbed (mg/dL)
- **User Baselines**:
  - Resting heart rate (bpm)
  - Baseline steps per minute (steps/min)

#### 4. **Basal Rates**
- **24-Hour Basal Profile** - Continuous background insulin (U/hr, 6 time blocks)
- **Basal Sensitivity** - How basal needs vary by time of day

**Implementation Phases**:
- **Phase 1**: Insulin Response Parameters (Weeks 1-4)
- **Phase 2**: Carb Absorption Parameters (Weeks 5-7)
- **Phase 3**: Basal Rates (Weeks 8-10)
- **Phase 4**: Activity Parameters (Weeks 11-13)
- **Phase 5**: Integration & Holistic Tuning (Weeks 14-16)

---

## Architecture Overview

### Data Flow

```
User Profile (Nightscout)
    ↓
Tuning Request → Backend Analysis → Optimization Results
    ↓
User Review & Approval
    ↓
Database Storage (tuned_parameters)
    ↓
Active Use in Calculations
```

### Storage Strategy

**Two-tier storage system**:
1. **Active Parameters** (`system_config` collection) - Currently used in calculations
2. **Tuning History** (`insulin_response_tuning` collection) - Historical runs and results

---

## Database Schema

### 1. New Collection: `insulin_response_tuning`

Stores tuning run results and history.

```typescript
interface IInsulinResponseTuning extends Document {
    // Metadata
    tuning_id: string;                    // UUID
    user_id: string;                      // For multi-user support
    created_at: Date;
    status: 'running' | 'completed' | 'failed' | 'applied';
    
    // Input Configuration
    config: {
        analysis_period_days: number;     // Default: 30
        window_hours: number;             // Default: 2
        include_activity: boolean;        // Default: true
        min_windows_required: number;     // Default: 10
    };
    
    // Current Values (baseline)
    current_values: {
        dia: number;
        peak: number;
        isf: number[];                    // 6 time blocks
        source: 'profile' | 'previous_tuning';
    };
    
    // Optimized Results
    optimized_values?: {
        dia: number;
        peak: number;
        isf: number[];                    // 6 time blocks
        
        // Confidence intervals
        dia_confidence: [number, number];
        peak_confidence: [number, number];
        isf_confidence: [number, number][];
        
        // Quality metrics
        r_squared: number;
        rmse: number;
        mae: number;
        windows_analyzed: number;
    };
    
    // Analysis Details
    analysis_summary?: {
        total_windows: number;
        stable_windows: number;
        meal_windows: number;
        activity_windows: number;
        data_quality_score: number;       // 0-1
    };
    
    // Application tracking
    applied_at?: Date;
    applied_by?: string;
    
    // Logs and diagnostics
    logs?: string[];
    error_message?: string;
}
```

### 2. Update Collection: `system_config`

Store active insulin response parameters.

```typescript
// New keys in system_config:
{
    key: 'insulin_response_parameters',
    value: {
        dia: number;
        peak: number;
        isf: number[];                    // 6 time blocks (4-hour each)
        last_tuned: Date;
        tuning_id: string;                // Reference to tuning run
        source: 'profile' | 'tuned';
    },
    updated_at: Date
}
```

### 3. Update Profile Schema

Add optional tuned parameters to profile store.

```typescript
interface IProfileStore {
    // ... existing fields ...
    
    // NEW: Tuned insulin response parameters (optional override)
    tuned_insulin_response?: {
        dia?: number;
        peak?: number;
        isf?: number[];                   // 6 time blocks
        enabled: boolean;                 // Whether to use tuned values
        last_updated: Date;
    };
}
```

---

## Backend Implementation

### 1. New API Endpoint: `/api/profile/tune-insulin-response`

**POST** - Start a new tuning run

```typescript
// Request
{
    analysis_period_days?: number;        // Default: 30
    window_hours?: number;                // Default: 2
    include_activity?: boolean;           // Default: true
}

// Response
{
    tuning_id: string;
    status: 'running';
    estimated_duration_seconds: number;
}
```

**GET** - Get tuning run status

```typescript
// Request: /api/profile/tune-insulin-response/:tuning_id

// Response
{
    tuning_id: string;
    status: 'running' | 'completed' | 'failed';
    progress?: number;                    // 0-100
    current_values: { dia, peak, isf };
    optimized_values?: { dia, peak, isf, confidence, metrics };
    analysis_summary?: { ... };
    logs?: string[];
    error_message?: string;
}
```

**POST** `/api/profile/tune-insulin-response/:tuning_id/apply` - Apply tuning results

```typescript
// Request
{
    apply_to_profile: boolean;            // Update Nightscout profile
    apply_to_system: boolean;             // Use in calculations immediately
}

// Response
{
    success: boolean;
    applied_at: Date;
    message: string;
}
```

**GET** `/api/profile/tune-insulin-response/history` - Get tuning history

```typescript
// Response
{
    tunings: Array<{
        tuning_id: string;
        created_at: Date;
        status: string;
        optimized_values?: { ... };
        applied_at?: Date;
    }>;
}
```

### 2. Backend Service: `InsulinResponseTuningService`

**Location**: `packages/webapp/lib/services/insulin-response-tuning.ts`

```typescript
class InsulinResponseTuningService {
    /**
     * Start a new tuning run
     */
    async startTuning(config: TuningConfig): Promise<string> {
        // 1. Create tuning record
        // 2. Fetch current profile values
        // 3. Generate time windows
        // 4. Call Python optimizer (extended version)
        // 5. Store results
        // 6. Return tuning_id
    }
    
    /**
     * Get tuning status and results
     */
    async getTuningStatus(tuning_id: string): Promise<TuningResult> {
        // Fetch from database
    }
    
    /**
     * Apply tuning results
     */
    async applyTuning(
        tuning_id: string,
        options: { apply_to_profile: boolean, apply_to_system: boolean }
    ): Promise<void> {
        // 1. Update system_config
        // 2. Optionally update Nightscout profile
        // 3. Mark tuning as applied
        // 4. Invalidate relevant caches
    }
    
    /**
     * Get active insulin response parameters
     */
    async getActiveParameters(): Promise<InsulinResponseParams> {
        // Check system_config first, fallback to profile
    }
}
```

### 3. Python Optimizer Extension

**Location**: `packages/predictive-models/app/services/insulin_response_optimizer.py`

Extend the existing `HolisticProfileAnalyzer` to optimize DIA and Peak.

```python
class InsulinResponseOptimizer(HolisticProfileAnalyzer):
    """
    Extends holistic analyzer to optimize DIA and Peak Time
    in addition to ISF, ICR, and Basal.
    """
    
    def analyze_insulin_response(
        self,
        windows: List[Dict[str, Any]],
        optimize_dia: bool = True,
        optimize_peak: bool = True,
        optimize_isf: bool = True
    ) -> InsulinResponseResult:
        """
        Optimize insulin response parameters.
        
        Parameters:
            - DIA: [3, 8] hours
            - Peak: [30, 75] minutes
            - ISF: [10, 200] mg/dL per unit (6 blocks)
        """
        
        # Initial guesses
        x0 = []
        bounds = []
        
        if optimize_dia:
            x0.append(5.0)  # hours
            bounds.append((3.0, 8.0))
        
        if optimize_peak:
            x0.append(45.0)  # minutes
            bounds.append((30.0, 75.0))
        
        if optimize_isf:
            x0.extend([50.0] * 6)
            bounds.extend([(10.0, 200.0)] * 6)
        
        # ... optimization logic ...
        
        return results
```

### 4. Update Existing Calculation Logic

**Files to update**:
- `packages/webapp/lib/logic/iob-logic.ts`
- `packages/webapp/lib/logic/profile-logic.ts`
- `packages/webapp/lib/logic/profile-analysis-logic.ts`

**Changes**:
```typescript
// Before
const dia = profileStore.dia || 5;
const peak = curveType === 'rapid-acting' ? 55 : 45;

// After
const insulinParams = await getActiveInsulinResponseParameters();
const dia = insulinParams.dia;
const peak = insulinParams.peak;
```

---

## Frontend Implementation

### 1. New Tuning Page

**Location**: `packages/webapp/app/tuning/page.tsx`

Create a new dedicated page for parameter tuning, separate from the existing Profile page.

#### Page Structure

```typescript
// packages/webapp/app/tuning/page.tsx
export default function TuningPage() {
    return (
        <div className="tuning-page">
            <PageHeader 
                title="Parameter Tuning"
                description="Optimize your diabetes management parameters using historical data"
            />
            
            <TuningDashboard />
        </div>
    );
}
```

#### Navigation Updates

Add "Tuning" link to main navigation:

```typescript
// packages/webapp/components/Navigation.tsx
const navItems = [
    { href: '/', label: 'Dashboard' },
    { href: '/profile', label: 'Profile', badge: 'Deprecated' },  // Mark as deprecated
    { href: '/tuning', label: 'Tuning', badge: 'New' },          // New tuning page
    { href: '/situation-modeller', label: 'Situation Modeller' },
    // ... other items
];
```

#### Profile Page Deprecation Notice

Add deprecation banner to existing profile page:

```typescript
// packages/webapp/app/profile/page.tsx
export default function ProfilePage() {
    return (
        <div className="profile-page">
            <DeprecationBanner 
                message="This page is being phased out. Please use the new Tuning page for parameter optimization."
                actionLabel="Go to Tuning"
                actionHref="/tuning"
            />
            
            {/* Existing profile page content */}
        </div>
    );
}
```

#### UI Components Structure

```
┌─────────────────────────────────────────────────────────┐
│ Parameter Tuning                                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ 📊 Insulin Response Parameters                  │   │
│ │ Last tuned: Never | Source: Profile             │   │
│ │ [View Details] [Start Tuning]                   │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ 🍽️ Carb Absorption Parameters                   │   │
│ │ Last tuned: Never | Source: Profile             │   │
│ │ [View Details] [Start Tuning]                   │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ 💉 Basal Rates                                  │   │
│ │ Last tuned: Never | Source: Profile             │   │
│ │ [View Details] [Start Tuning]                   │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ 🏃 Activity Parameters                          │   │
│ │ Last tuned: Never | Source: Defaults            │   │
│ │ [View Details] [Start Tuning]                   │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Quick Actions                                   │   │
│ │ [Tune All Parameters]  [View History]           │   │
│ └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

#### Detailed Parameter View (Expandable)

When user clicks "View Details" on any category:

```
┌─────────────────────────────────────────────────────────┐
│ Insulin Response Parameters                    [Tune]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ DIA (Duration of Insulin Action)                │   │
│ │ Current: 5.0 hours                    [Edit] [?]│   │
│ │ ┌─────────────────────────────────────────────┐ │   │
│ │ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │   │
│ │ │ 3h        5h (current)        8h            │ │   │
│ │ └─────────────────────────────────────────────┘ │   │
│ │ Source: Profile | Last tuned: Never             │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Peak Time                                       │   │
│ │ Current: 45 min (Ultra-rapid)         [Edit] [?]│   │
│ │ ┌─────────────────────────────────────────────┐ │   │
│ │ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │   │
│ │ │ 30min     45min (current)     75min         │ │   │
│ │ └─────────────────────────────────────────────┘ │   │
│ │ Source: Profile | Last tuned: Never             │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ ISF (Insulin Sensitivity Factor)                │   │
│ │ 6 time blocks (4-hour periods)        [Edit] [?]│   │
│ │                                                 │   │
│ │ 00:00-04:00  50 mg/dL/U  ━━━━━━━━━━━━━━━━━━━  │   │
│ │ 04:00-08:00  52 mg/dL/U  ━━━━━━━━━━━━━━━━━━━━ │   │
│ │ 08:00-12:00  48 mg/dL/U  ━━━━━━━━━━━━━━━━━━   │   │
│ │ 12:00-16:00  45 mg/dL/U  ━━━━━━━━━━━━━━━━     │   │
│ │ 16:00-20:00  47 mg/dL/U  ━━━━━━━━━━━━━━━━━    │   │
│ │ 20:00-24:00  51 mg/dL/U  ━━━━━━━━━━━━━━━━━━━  │   │
│ │                                                 │   │
│ │ Source: Profile | Last tuned: Never             │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ [Reset to Profile Defaults]  [Start Tuning Run]       │
└─────────────────────────────────────────────────────────┘
```

### 2. New Component: `TuningDashboard`

**Location**: `packages/webapp/components/TuningDashboard.tsx`

Main dashboard component for the tuning page.

```typescript
interface TuningDashboardProps {
    // Optional: can be empty for initial implementation
}

export function TuningDashboard() {
    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
    
    return (
        <div className="tuning-dashboard">
            <div className="category-cards">
                <CategoryCard
                    id="insulin-response"
                    title="Insulin Response Parameters"
                    icon="📊"
                    lastTuned={null}
                    source="profile"
                    onExpand={() => setExpandedCategory('insulin-response')}
                    onStartTuning={() => {/* Start tuning */}}
                />
                
                <CategoryCard
                    id="carb-absorption"
                    title="Carb Absorption Parameters"
                    icon="🍽️"
                    lastTuned={null}
                    source="profile"
                    onExpand={() => setExpandedCategory('carb-absorption')}
                    onStartTuning={() => {/* Start tuning */}}
                />
                
                <CategoryCard
                    id="basal-rates"
                    title="Basal Rates"
                    icon="💉"
                    lastTuned={null}
                    source="profile"
                    onExpand={() => setExpandedCategory('basal-rates')}
                    onStartTuning={() => {/* Start tuning */}}
                />
                
                <CategoryCard
                    id="activity"
                    title="Activity Parameters"
                    icon="🏃"
                    lastTuned={null}
                    source="defaults"
                    onExpand={() => setExpandedCategory('activity')}
                    onStartTuning={() => {/* Start tuning */}}
                />
            </div>
            
            {expandedCategory && (
                <ParameterDetailsPanel
                    category={expandedCategory}
                    onClose={() => setExpandedCategory(null)}
                />
            )}
            
            <QuickActions />
        </div>
    );
}
```

### 3. New Component: `CategoryCard`

**Location**: `packages/webapp/components/CategoryCard.tsx`

Displays summary of a parameter category.

```typescript
interface CategoryCardProps {
    id: string;
    title: string;
    icon: string;
    lastTuned: Date | null;
    source: 'profile' | 'tuned' | 'defaults';
    onExpand: () => void;
    onStartTuning: () => void;
}

export function CategoryCard({ title, icon, lastTuned, source, onExpand, onStartTuning }: CategoryCardProps) {
    return (
        <div className="category-card">
            <div className="card-header">
                <span className="icon">{icon}</span>
                <h3>{title}</h3>
            </div>
            
            <div className="card-metadata">
                <span>Last tuned: {lastTuned ? formatDate(lastTuned) : 'Never'}</span>
                <span>Source: {source}</span>
            </div>
            
            <div className="card-actions">
                <Button onClick={onExpand} variant="secondary">
                    View Details
                </Button>
                <Button onClick={onStartTuning} variant="primary">
                    Start Tuning
                </Button>
            </div>
        </div>
    );
}
```

### 4. New Component: `DeprecationBanner`

**Location**: `packages/webapp/components/DeprecationBanner.tsx`

Banner to show on deprecated profile page.

```typescript
interface DeprecationBannerProps {
    message: string;
    actionLabel: string;
    actionHref: string;
}

export function DeprecationBanner({ message, actionLabel, actionHref }: DeprecationBannerProps) {
    return (
        <div className="deprecation-banner">
            <div className="banner-content">
                <span className="icon">⚠️</span>
                <p>{message}</p>
            </div>
            <Link href={actionHref} className="banner-action">
                {actionLabel} →
            </Link>
        </div>
    );
}
```

### 5. New Component: `InsulinResponseTuner`

**Location**: `packages/webapp/components/InsulinResponseTuner.tsx`

```typescript
interface InsulinResponseTunerProps {
    currentValues: {
        dia: number;
        peak: number;
        isf: number[];
    };
    onStartTuning: () => void;
    onApplyResults: (tuningId: string) => void;
}

export function InsulinResponseTuner({ ... }: InsulinResponseTunerProps) {
    const [tuningStatus, setTuningStatus] = useState<TuningStatus | null>(null);
    const [showResults, setShowResults] = useState(false);
    
    // Poll for tuning status
    useEffect(() => {
        if (tuningStatus?.status === 'running') {
            const interval = setInterval(async () => {
                const status = await fetchTuningStatus(tuningStatus.tuning_id);
                setTuningStatus(status);
                
                if (status.status === 'completed') {
                    setShowResults(true);
                }
            }, 5000);
            
            return () => clearInterval(interval);
        }
    }, [tuningStatus]);
    
    return (
        <div className="insulin-response-tuner">
            {/* Parameter displays */}
            {/* Tuning controls */}
            {/* Results modal */}
        </div>
    );
}
```

### 3. New Component: `ParameterCard`

**Location**: `packages/webapp/components/ParameterCard.tsx`

Reusable component for displaying and editing individual parameters.

```typescript
interface ParameterCardProps {
    name: string;
    description: string;
    currentValue: number | number[];
    unit: string;
    range: [number, number];
    source: 'profile' | 'tuned';
    lastTuned?: Date;
    tunedValue?: number | number[];
    confidence?: [number, number] | [number, number][];
    onEdit: (value: number | number[]) => void;
    helpContent: React.ReactNode;
}

export function ParameterCard({ ... }: ParameterCardProps) {
    return (
        <div className="parameter-card">
            <div className="parameter-header">
                <h3>{name}</h3>
                <button onClick={onEdit}>Edit</button>
                <HelpTooltip content={helpContent} />
            </div>
            
            <div className="parameter-value">
                {/* Display current value */}
                {/* Show slider/input for editing */}
                {/* Show confidence interval if available */}
            </div>
            
            <div className="parameter-metadata">
                <span>Source: {source}</span>
                {lastTuned && <span>Last tuned: {formatDate(lastTuned)}</span>}
            </div>
        </div>
    );
}
```

### 4. New Component: `TuningResultsModal`

**Location**: `packages/webapp/components/TuningResultsModal.tsx`

Modal to display tuning results and allow user to review/apply.

```typescript
interface TuningResultsModalProps {
    tuningId: string;
    currentValues: InsulinResponseParams;
    optimizedValues: InsulinResponseParams;
    metrics: {
        r_squared: number;
        rmse: number;
        mae: number;
        windows_analyzed: number;
    };
    onApply: (options: ApplyOptions) => void;
    onCancel: () => void;
}

export function TuningResultsModal({ ... }: TuningResultsModalProps) {
    return (
        <Modal>
            <h2>Tuning Results</h2>
            
            {/* Comparison table: Current vs Optimized */}
            <ComparisonTable
                current={currentValues}
                optimized={optimizedValues}
            />
            
            {/* Quality metrics */}
            <MetricsDisplay metrics={metrics} />
            
            {/* Confidence intervals visualization */}
            <ConfidenceChart values={optimizedValues} />
            
            {/* Apply options */}
            <div className="apply-options">
                <Checkbox label="Update Nightscout profile" />
                <Checkbox label="Use in calculations immediately" />
            </div>
            
            <div className="actions">
                <Button onClick={onCancel}>Cancel</Button>
                <Button onClick={onApply} variant="primary">
                    Apply Changes
                </Button>
            </div>
        </Modal>
    );
}
```

### 5. Help Content / Educational Tooltips

Each parameter should have comprehensive help content explaining:

#### DIA Help Content
```markdown
**Duration of Insulin Action (DIA)**

How long insulin remains active in your body after injection.

**Impact of Changes**:
- ⬆️ Increase DIA → Insulin effect spreads over longer time
  - More conservative IOB calculations
  - Slower predicted glucose drops
  
- ⬇️ Decrease DIA → Insulin effect concentrated in shorter time
  - More aggressive IOB calculations
  - Faster predicted glucose drops

**Typical Values**:
- Rapid-acting (Humalog/Novolog): 5-6 hours
- Ultra-rapid (Fiasp/Lyumjev): 4-5 hours

**Tuning Method**: Analyzes your historical IOB decay patterns
to find the DIA that best matches your actual insulin absorption.
```

#### Peak Time Help Content
```markdown
**Peak Time**

When your insulin activity reaches maximum effect.

**Impact of Changes**:
- ⬆️ Increase Peak → Insulin acts more slowly
  - Delayed glucose drop after bolus
  - Different IOB curve shape
  
- ⬇️ Decrease Peak → Insulin acts more quickly
  - Faster glucose drop after bolus
  - Steeper IOB curve

**Typical Values**:
- Rapid-acting: 50-60 minutes
- Ultra-rapid: 40-50 minutes

**Tuning Method**: Analyzes when glucose drops are steepest
after boluses to determine your actual peak time.
```

#### ISF Help Content
```markdown
**Insulin Sensitivity Factor (ISF)**

How much 1 unit of insulin lowers your blood glucose.

**Impact of Changes**:
- ⬆️ Increase ISF → More sensitive to insulin
  - Larger predicted glucose drops
  - More conservative correction recommendations
  
- ⬇️ Decrease ISF → Less sensitive to insulin
  - Smaller predicted glucose drops
  - More aggressive correction recommendations

**Time-of-Day Variation**: ISF often varies throughout the day
due to circadian rhythms, hormones, and activity patterns.

**Tuning Method**: Analyzes your glucose response to insulin
across different times of day to optimize ISF for 6 time blocks.
```

---

## Implementation Phases

### Phase 1: Database & Backend (Week 1)
- [ ] Create `insulin_response_tuning` collection schema
- [ ] Update `system_config` for active parameters
- [ ] Implement `InsulinResponseTuningService`
- [ ] Create API endpoints
- [ ] Update calculation logic to use tuned parameters

### Phase 2: Python Optimizer (Week 1-2)
- [ ] Extend `HolisticProfileAnalyzer` for DIA/Peak optimization
- [ ] Implement objective function with DIA/Peak variables
- [ ] Add confidence interval calculation for DIA/Peak
- [ ] Test optimizer with historical data
- [ ] Validate results against known scenarios

### Phase 3: Frontend Components (Week 2)
- [ ] Create `ParameterCard` component
- [ ] Create `InsulinResponseTuner` component
- [ ] Create `TuningResultsModal` component
- [ ] Add help content and tooltips
- [ ] Implement polling for tuning status

### Phase 4: Integration (Week 3)
- [ ] Integrate components into Profile page
- [ ] Add tuning history view
- [ ] Implement apply/reset functionality
- [ ] Add loading states and error handling
- [ ] Test end-to-end flow

### Phase 5: Testing & Refinement (Week 3-4)
- [ ] Unit tests for backend services
- [ ] Integration tests for API endpoints
- [ ] Frontend component tests
- [ ] Manual testing with real data
- [ ] Performance optimization
- [ ] Documentation

---

## Technical Considerations

### 1. Optimization Challenges

**DIA and Peak Optimization**:
- These parameters affect the shape of the IOB curve
- Changes create non-linear effects on predictions
- Requires careful initialization and bounds
- May need multiple optimization passes

**Solution**:
- Use hierarchical optimization: First optimize DIA/Peak, then ISF
- Or use simultaneous optimization with proper regularization
- Include smoothness constraints on ISF across time blocks

### 2. Data Requirements

**Minimum Data Quality**:
- At least 30 days of CGM data
- At least 50 bolus events
- Good meal logging (for separating insulin vs carb effects)
- Activity data (optional but recommended)

**Quality Checks**:
- Warn user if data quality is insufficient
- Show data quality score before tuning
- Filter out unreliable windows

### 3. Performance

**Optimization Runtime**:
- Expected: 30-60 seconds for 30 days of data
- Use background job processing
- Implement progress tracking
- Allow cancellation

**Caching Strategy**:
- Cache active parameters in memory
- Invalidate caches when parameters change
- Pre-calculate common scenarios

### 4. Safety & Validation

**Parameter Bounds**:
- Enforce physiological limits (DIA: 3-8 hours, Peak: 30-75 min)
- Warn if optimized values are at bounds
- Require user confirmation for large changes

**Change Limits**:
- Limit single-step changes (e.g., max 20% change in ISF)
- Show impact preview before applying
- Allow gradual rollout

---

## User Experience Flow

### 1. Initial View
```
User navigates to /tuning page
  → Sees parameter tuning dashboard
  → Four parameter categories displayed
  → Each shows current source (Profile/Tuned/Defaults)
  → "Start Tuning" button available for each category
```

### 2. Starting Tuning
```
User clicks "Start Tuning" on a category (e.g., Insulin Response)
  → Parameter details expand or navigate to detail view
  → Configuration modal appears
  → User selects analysis period (default 30 days)
  → User confirms
  → Tuning starts, progress indicator shown
```

### 3. During Tuning
```
Progress indicator updates every 5 seconds
  → Shows: "Analyzing 245 time windows... 60% complete"
  → User can navigate away, tuning continues
  → Notification when complete
```

### 4. Reviewing Results
```
Tuning completes
  → Results modal appears
  → Shows comparison table (current vs optimized)
  → Shows confidence intervals
  → Shows quality metrics (R², RMSE)
  → Explains what changed and why
```

### 5. Applying Results
```
User reviews results
  → Decides to apply
  → Chooses options:
    - ✓ Update Nightscout profile
    - ✓ Use in calculations immediately
  → Confirms
  → Parameters updated
  → Success message shown
```

### 6. Post-Application
```
Parameters now show "Source: Tuned"
  → Last tuned date displayed
  → Can view tuning history
  → Can reset to profile defaults
  → Can run tuning again
```

---

## API Examples

### Start Tuning
```bash
POST /api/profile/tune-insulin-response
Content-Type: application/json

{
    "analysis_period_days": 30,
    "window_hours": 2,
    "include_activity": true
}

# Response
{
    "tuning_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "running",
    "estimated_duration_seconds": 45
}
```

### Check Status
```bash
GET /api/profile/tune-insulin-response/550e8400-e29b-41d4-a716-446655440000

# Response
{
    "tuning_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed",
    "current_values": {
        "dia": 5.0,
        "peak": 45,
        "isf": [50, 50, 50, 50, 50, 50]
    },
    "optimized_values": {
        "dia": 5.2,
        "peak": 48,
        "isf": [52, 54, 48, 45, 47, 51],
        "dia_confidence": [4.8, 5.6],
        "peak_confidence": [44, 52],
        "isf_confidence": [
            [48, 56], [50, 58], [44, 52],
            [41, 49], [43, 51], [47, 55]
        ],
        "r_squared": 0.78,
        "rmse": 12.3,
        "mae": 9.1,
        "windows_analyzed": 245
    },
    "analysis_summary": {
        "total_windows": 360,
        "stable_windows": 120,
        "meal_windows": 180,
        "activity_windows": 95,
        "data_quality_score": 0.85
    }
}
```

### Apply Results
```bash
POST /api/profile/tune-insulin-response/550e8400-e29b-41d4-a716-446655440000/apply
Content-Type: application/json

{
    "apply_to_profile": true,
    "apply_to_system": true
}

# Response
{
    "success": true,
    "applied_at": "2026-01-17T23:45:00Z",
    "message": "Insulin response parameters updated successfully"
}
```

---

## Future Enhancements

### Phase 2 Features (Future)
1. **Autosens Tuning** - Optimize autosens sensitivity ratio
2. **Curve Shape Optimization** - Fine-tune insulin activity curve beyond peak
3. **Meal-Type Specific ISF** - Different ISF for high-fat vs high-carb meals
4. **Exercise ISF** - Separate ISF during/after activity
5. **Time-of-Month Variations** - Hormonal cycle adjustments (if applicable)

### Advanced Features
1. **A/B Testing** - Compare tuned vs profile parameters over time
2. **Automatic Re-tuning** - Periodic background tuning with notifications
3. **Confidence Scoring** - Show confidence level for each parameter
4. **What-If Analysis** - Preview impact of parameter changes
5. **Export/Import** - Share tuned parameters between devices

---

## PHASE 2: Carb Absorption Parameters Tuning

### Overview

Carb absorption parameters control how the system models carbohydrate digestion and glucose impact. Optimizing these parameters improves COB calculations and meal-related predictions.

### Parameters to Tune

1. **ICR (Insulin to Carb Ratio)** - 6 time blocks
2. **Default Absorption Rate** - Base rate (g/hr)
3. **Min Carb Impact** - Minimum glucose impact (mg/dL/5min)
4. **S-Curve Shape Parameters**:
   - Duration multiplier
   - Peak time ratio  
   - Minimum base rate

### Database Schema Extension

#### New Collection: `carb_absorption_tuning`

```typescript
interface ICarbAbsorptionTuning extends Document {
    tuning_id: string;
    user_id: string;
    created_at: Date;
    status: 'running' | 'completed' | 'failed' | 'applied';
    
    config: {
        analysis_period_days: number;
        window_hours: number;
        min_meal_events: number;          // Minimum carb events required
    };
    
    current_values: {
        icr: number[];                     // 6 time blocks
        default_absorption_rate: number;   // g/hr
        min_carb_impact: number;           // mg/dL/5min
        s_curve_params: {
            duration_multiplier: number;   // Default: 1.2
            peak_time_ratio: number;       // Default: 0.25
            min_base_rate: number;         // Default: 10 g/hr
        };
        source: 'profile' | 'previous_tuning';
    };
    
    optimized_values?: {
        icr: number[];
        default_absorption_rate: number;
        min_carb_impact: number;
        s_curve_params: {
            duration_multiplier: number;
            peak_time_ratio: number;
            min_base_rate: number;
        };
        
        // Confidence intervals
        icr_confidence: [number, number][];
        absorption_rate_confidence: [number, number];
        min_carb_impact_confidence: [number, number];
        
        // Quality metrics
        r_squared: number;
        rmse: number;
        mae: number;
        meal_windows_analyzed: number;
    };
    
    analysis_summary?: {
        total_meal_events: number;
        avg_meal_size: number;
        meal_distribution_by_time: Record<string, number>;
        data_quality_score: number;
    };
    
    applied_at?: Date;
    logs?: string[];
    error_message?: string;
}
```

#### Update `system_config`

```typescript
{
    key: 'carb_absorption_parameters',
    value: {
        icr: number[];                     // 6 time blocks
        default_absorption_rate: number;
        min_carb_impact: number;
        s_curve_params: {
            duration_multiplier: number;
            peak_time_ratio: number;
            min_base_rate: number;
        };
        last_tuned: Date;
        tuning_id: string;
        source: 'profile' | 'tuned';
    },
    updated_at: Date
}
```

### API Endpoints

**POST** `/api/profile/tune-carb-absorption`
**GET** `/api/profile/tune-carb-absorption/:tuning_id`
**POST** `/api/profile/tune-carb-absorption/:tuning_id/apply`
**GET** `/api/profile/tune-carb-absorption/history`

### Python Optimizer Extension

```python
class CarbAbsorptionOptimizer(HolisticProfileAnalyzer):
    """
    Optimizes carb absorption parameters using meal response data.
    """
    
    def analyze_carb_absorption(
        self,
        windows: List[Dict[str, Any]],
        optimize_icr: bool = True,
        optimize_absorption_rate: bool = True,
        optimize_curve_params: bool = False
    ) -> CarbAbsorptionResult:
        """
        Optimize carb absorption parameters.
        
        Parameters:
            - ICR: [3, 50] g/U (6 blocks)
            - Absorption Rate: [10, 60] g/hr
            - Min Carb Impact: [3, 15] mg/dL/5min
            - Duration Multiplier: [1.0, 1.5]
            - Peak Time Ratio: [0.15, 0.35]
            - Min Base Rate: [5, 20] g/hr
        """
        
        # Filter for meal windows
        meal_windows = [w for w in windows if w['has_meals']]
        
        if len(meal_windows) < 20:
            raise ValueError("Insufficient meal data for tuning")
        
        # Initial guesses
        x0 = []
        bounds = []
        
        if optimize_icr:
            x0.extend([10.0] * 6)
            bounds.extend([(3.0, 50.0)] * 6)
        
        if optimize_absorption_rate:
            x0.append(30.0)  # g/hr
            bounds.append((10.0, 60.0))
        
        if optimize_curve_params:
            x0.extend([1.2, 0.25, 10.0])  # multiplier, peak_ratio, min_rate
            bounds.extend([(1.0, 1.5), (0.15, 0.35), (5.0, 20.0)])
        
        # Optimize...
        return results
```

### UI Components

#### Carb Absorption Tuner UI

```
┌─────────────────────────────────────────────────────────┐
│ Carb Absorption Parameters                     [Tune]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ ICR (Insulin to Carb Ratio)                     │   │
│ │ 6 time blocks (4-hour periods)        [Edit] [?]│   │
│ │                                                 │   │
│ │ 00:00-04:00  10 g/U  ━━━━━━━━━━━━━━━━━━━━━━━  │   │
│ │ 04:00-08:00  12 g/U  ━━━━━━━━━━━━━━━━━━━━━━━━ │   │
│ │ 08:00-12:00   9 g/U  ━━━━━━━━━━━━━━━━━━━━━    │   │
│ │ 12:00-16:00   8 g/U  ━━━━━━━━━━━━━━━━━━       │   │
│ │ 16:00-20:00  10 g/U  ━━━━━━━━━━━━━━━━━━━━━━━  │   │
│ │ 20:00-24:00  11 g/U  ━━━━━━━━━━━━━━━━━━━━━━━━ │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Default Absorption Rate                         │   │
│ │ Current: 30 g/hr                      [Edit] [?]│   │
│ │ ┌─────────────────────────────────────────────┐ │   │
│ │ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │   │
│ │ │ 10 g/hr    30 g/hr (current)    60 g/hr     │ │   │
│ │ └─────────────────────────────────────────────┘ │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Min Carb Impact                                 │   │
│ │ Current: 8 mg/dL per 5min             [Edit] [?]│   │
│ │ ┌─────────────────────────────────────────────┐ │   │
│ │ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │   │
│ │ │ 3        8 (current)        15              │ │   │
│ │ └─────────────────────────────────────────────┘ │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Advanced: S-Curve Parameters          [Expand] │   │
│ │ Duration Multiplier: 1.2                        │   │
│ │ Peak Time Ratio: 0.25                           │   │
│ │ Min Base Rate: 10 g/hr                          │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ [Reset to Defaults]  [Start Tuning Run]                │
└─────────────────────────────────────────────────────────┘
```

### Help Content

#### ICR Help Content
```markdown
**Insulin to Carb Ratio (ICR)**

How many grams of carbs are covered by 1 unit of insulin.

**Impact of Changes**:
- ⬆️ Increase ICR → Less insulin needed per gram of carbs
  - Lower COB glucose impact
  - More conservative meal dosing recommendations
  
- ⬇️ Decrease ICR → More insulin needed per gram of carbs
  - Higher COB glucose impact
  - More aggressive meal dosing recommendations

**Time-of-Day Variation**: ICR often varies due to:
- Dawn phenomenon (morning insulin resistance)
- Activity patterns
- Meal composition differences

**Tuning Method**: Analyzes glucose response to meals across
different times of day to optimize ICR for 6 time blocks.
```

#### Absorption Rate Help Content
```markdown
**Default Absorption Rate**

Base speed at which carbohydrates are absorbed (grams per hour).

**Impact of Changes**:
- ⬆️ Increase Rate → Faster carb absorption
  - Shorter COB duration
  - Steeper glucose rise predictions
  
- ⬇️ Decrease Rate → Slower carb absorption
  - Longer COB duration
  - Gradual glucose rise predictions

**Typical Values**: 20-40 g/hr for most people
- High-GI foods: 40-60 g/hr
- Low-GI foods: 15-25 g/hr

**Tuning Method**: Analyzes how quickly your glucose rises
after meals to determine your typical absorption rate.
```

---

## PHASE 3: Basal Rates Tuning

### Overview

Basal rate tuning optimizes the 24-hour background insulin delivery profile by analyzing periods without meals or corrections.

### Parameters to Tune

1. **Basal Rates** - 6 time blocks (4-hour periods)
2. **Basal Sensitivity** - How basal needs vary by time of day

### Database Schema Extension

#### New Collection: `basal_tuning`

```typescript
interface IBasalTuning extends Document {
    tuning_id: string;
    user_id: string;
    created_at: Date;
    status: 'running' | 'completed' | 'failed' | 'applied';
    
    config: {
        analysis_period_days: number;
        min_stable_windows: number;        // Minimum stable periods required
        stability_threshold: number;       // mg/dL change threshold
    };
    
    current_values: {
        basal_rates: number[];             // 6 time blocks (U/hr)
        source: 'profile' | 'previous_tuning';
    };
    
    optimized_values?: {
        basal_rates: number[];
        
        // Confidence intervals
        basal_confidence: [number, number][];
        
        // Quality metrics
        r_squared: number;
        rmse: number;
        mae: number;
        stable_windows_analyzed: number;
        
        // Validation metrics
        fasting_glucose_stability: number;  // Lower is better
        overnight_drift: number;            // mg/dL per hour
    };
    
    analysis_summary?: {
        total_stable_windows: number;
        windows_by_time_block: number[];   // Count per block
        avg_glucose_by_block: number[];    // Average BG per block
        data_quality_score: number;
    };
    
    applied_at?: Date;
    logs?: string[];
    error_message?: string;
}
```

#### Update `system_config`

```typescript
{
    key: 'basal_rates',
    value: {
        rates: number[];                   // 6 time blocks (U/hr)
        last_tuned: Date;
        tuning_id: string;
        source: 'profile' | 'tuned';
    },
    updated_at: Date
}
```

### API Endpoints

**POST** `/api/profile/tune-basal-rates`
**GET** `/api/profile/tune-basal-rates/:tuning_id`
**POST** `/api/profile/tune-basal-rates/:tuning_id/apply`
**GET** `/api/profile/tune-basal-rates/history`

### Python Optimizer Extension

```python
class BasalRateOptimizer(HolisticProfileAnalyzer):
    """
    Optimizes basal rates using stable (fasting) periods.
    """
    
    def analyze_basal_rates(
        self,
        windows: List[Dict[str, Any]],
        stability_threshold: float = 20.0  # mg/dL
    ) -> BasalRateResult:
        """
        Optimize basal rates using stable windows.
        
        Strategy:
        1. Filter for stable windows (no meals, no corrections)
        2. Analyze glucose drift in each time block
        3. Optimize basal rates to minimize drift
        
        Parameters:
            - Basal Rates: [0.1, 5.0] U/hr (6 blocks)
        """
        
        # Filter for stable windows
        stable_windows = [
            w for w in windows 
            if w['is_stable'] 
            and not w['has_meals'] 
            and not w['has_corrections']
            and abs(w['glucose_change']) < stability_threshold
        ]
        
        if len(stable_windows) < 30:
            raise ValueError("Insufficient stable periods for basal tuning")
        
        # Initial guess from current profile
        x0 = [1.0] * 6  # U/hr
        bounds = [(0.1, 5.0)] * 6
        
        # Optimize to minimize glucose drift
        # Objective: Keep glucose stable during fasting periods
        
        return results
```

### UI Components

#### Basal Rates Tuner UI

```
┌─────────────────────────────────────────────────────────┐
│ Basal Rates                                     [Tune]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ 24-Hour Basal Profile                           │   │
│ │ 6 time blocks (4-hour periods)        [Edit] [?]│   │
│ │                                                 │   │
│ │ 00:00-04:00  0.95 U/hr  ━━━━━━━━━━━━━━━━━━━   │   │
│ │ 04:00-08:00  1.10 U/hr  ━━━━━━━━━━━━━━━━━━━━━ │   │
│ │ 08:00-12:00  1.05 U/hr  ━━━━━━━━━━━━━━━━━━━━  │   │
│ │ 12:00-16:00  0.90 U/hr  ━━━━━━━━━━━━━━━━━━    │   │
│ │ 16:00-20:00  0.95 U/hr  ━━━━━━━━━━━━━━━━━━━   │   │
│ │ 20:00-24:00  1.00 U/hr  ━━━━━━━━━━━━━━━━━━━━  │   │
│ │                                                 │   │
│ │ Total Daily Basal: 23.4 U                       │   │
│ │ Average Rate: 0.98 U/hr                         │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Basal Profile Visualization              [View]│   │
│ │                                                 │   │
│ │  1.2 U/hr ┤                                     │   │
│ │  1.0 U/hr ┤   ╭─╮                               │   │
│ │  0.8 U/hr ┤ ╭─╯ ╰─╮                             │   │
│ │  0.6 U/hr ┤─╯     ╰─────╮                       │   │
│ │           └─────────────────────────────────    │   │
│ │            00  04  08  12  16  20  24 (hour)    │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Tuning Requirements                             │   │
│ │ ✓ 30+ stable periods found                      │   │
│ │ ✓ Coverage across all time blocks               │   │
│ │ ⚠ Limited data for 04:00-08:00 block            │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ [Reset to Profile Defaults]  [Start Tuning Run]       │
└─────────────────────────────────────────────────────────┘
```

### Help Content

#### Basal Rates Help Content
```markdown
**Basal Rates**

Background insulin delivery rate (units per hour) when fasting.

**Impact of Changes**:
- ⬆️ Increase Basal → More background insulin
  - Lower fasting glucose
  - Less glucose rise without food
  
- ⬇️ Decrease Basal → Less background insulin
  - Higher fasting glucose
  - More glucose rise without food

**Time-of-Day Variation**: Basal needs vary due to:
- Dawn phenomenon (4am-8am increase)
- Circadian rhythms
- Activity patterns
- Sleep quality

**Tuning Method**: Analyzes glucose drift during stable periods
(no meals, no corrections) to find basal rates that keep glucose
stable throughout the day.

**Data Requirements**:
- At least 30 stable periods (2+ hours each)
- Coverage across all time blocks
- Minimal temp basal usage
```

---

## PHASE 4: Activity Parameters Tuning

### Overview

Activity parameter tuning optimizes the coefficients that model how physical activity affects glucose levels.

### Parameters to Tune

1. **Steps Per Minute Coefficient** - Aerobic activity impact (mg/dL per step/min)
2. **HR Spike Coefficient** - Heart rate elevation impact (mg/dL per unit)
3. **Calories Coefficient** - Energy expenditure impact (mg/dL per kcal)
4. **Stairs Coefficient** - Anaerobic activity impact (mg/dL per floor)
5. **User Baselines**:
   - Resting heart rate (bpm)
   - Baseline steps per minute (steps/min)

### Database Schema Extension

#### New Collection: `activity_tuning`

```typescript
interface IActivityTuning extends Document {
    tuning_id: string;
    user_id: string;
    created_at: Date;
    status: 'running' | 'completed' | 'failed' | 'applied';
    
    config: {
        analysis_period_days: number;
        min_activity_windows: number;      // Minimum windows with activity
        activity_threshold: number;        // Min steps to count as active
    };
    
    current_values: {
        steps_per_minute_coeff: number;    // mg/dL per step/min
        hr_spike_coeff: number;            // mg/dL per unit elevation
        calories_coeff: number;            // mg/dL per kcal
        stairs_coeff: number;              // mg/dL per floor
        user_baselines: {
            resting_hr: number;            // bpm
            baseline_steps_per_min: number; // steps/min
        };
        source: 'defaults' | 'previous_tuning';
    };
    
    optimized_values?: {
        steps_per_minute_coeff: number;
        hr_spike_coeff: number;
        calories_coeff: number;
        stairs_coeff: number;
        user_baselines: {
            resting_hr: number;
            baseline_steps_per_min: number;
        };
        
        // Confidence intervals
        steps_coeff_confidence: [number, number];
        hr_coeff_confidence: [number, number];
        calories_coeff_confidence: [number, number];
        stairs_coeff_confidence: [number, number];
        
        // Quality metrics
        r_squared: number;
        rmse: number;
        mae: number;
        activity_windows_analyzed: number;
    };
    
    analysis_summary?: {
        total_activity_windows: number;
        avg_steps_per_window: number;
        avg_hr_elevation: number;
        activity_intensity_distribution: Record<string, number>;
        data_quality_score: number;
    };
    
    applied_at?: Date;
    logs?: string[];
    error_message?: string;
}
```

#### Update `system_config`

```typescript
{
    key: 'activity_parameters',
    value: {
        coefficients: {
            steps_per_minute: number;
            hr_spike: number;
            calories: number;
            stairs: number;
        };
        baselines: {
            resting_hr: number;
            baseline_steps_per_min: number;
        };
        last_tuned: Date;
        tuning_id: string;
        source: 'defaults' | 'tuned';
    },
    updated_at: Date
}
```

### API Endpoints

**POST** `/api/profile/tune-activity-parameters`
**GET** `/api/profile/tune-activity-parameters/:tuning_id`
**POST** `/api/profile/tune-activity-parameters/:tuning_id/apply`
**GET** `/api/profile/tune-activity-parameters/history`

### Python Optimizer Extension

```python
class ActivityParameterOptimizer(HolisticProfileAnalyzer):
    """
    Optimizes activity impact coefficients using activity data.
    """
    
    def analyze_activity_parameters(
        self,
        windows: List[Dict[str, Any]]
    ) -> ActivityParameterResult:
        """
        Optimize activity impact coefficients.
        
        Strategy:
        1. Calculate user baselines (resting HR, typical steps/min)
        2. Filter for windows with significant activity
        3. Optimize coefficients to explain glucose changes
        
        Parameters:
            - Steps/min coeff: [-5.0, 0.0] mg/dL per step/min
            - HR spike coeff: [0.0, 50.0] mg/dL per unit
            - Calories coeff: [-2.0, 0.0] mg/dL per kcal
            - Stairs coeff: [0.0, 30.0] mg/dL per floor
        """
        
        # Calculate baselines first
        baselines = self._calculate_user_baselines(windows)
        
        # Filter for activity windows
        activity_windows = [
            w for w in windows 
            if w['data_quality']['has_activity_data']
            and (w['activity_steps'] > 0 or w['activity_heart_rate'] > 0)
        ]
        
        if len(activity_windows) < 20:
            raise ValueError("Insufficient activity data for tuning")
        
        # Initial guesses
        x0 = [-1.0, 15.0, -0.4, 10.0]  # steps, hr, calories, stairs
        bounds = [
            (-5.0, 0.0),   # steps (negative = lowers glucose)
            (0.0, 50.0),   # hr (positive = raises glucose)
            (-2.0, 0.0),   # calories (negative = lowers glucose)
            (0.0, 30.0)    # stairs (positive = raises glucose)
        ]
        
        # Optimize...
        return results
```

### UI Components

#### Activity Parameters Tuner UI

```
┌─────────────────────────────────────────────────────────┐
│ Activity Impact Parameters                      [Tune]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ User Baselines (Calculated from Data)           │   │
│ │                                                 │   │
│ │ Resting Heart Rate: 68 bpm                      │   │
│ │ Baseline Steps/Min: 45 steps/min               │   │
│ │                                                 │   │
│ │ Based on 30 days of activity data               │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Steps Per Minute Coefficient                    │   │
│ │ Current: -1.0 mg/dL per step/min    [Edit] [?] │   │
│ │ ┌─────────────────────────────────────────────┐ │   │
│ │ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │   │
│ │ │ -5.0    -1.0 (current)    0.0               │ │   │
│ │ └─────────────────────────────────────────────┘ │   │
│ │ Effect: Aerobic activity lowers glucose         │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ HR Spike Coefficient                            │   │
│ │ Current: +15.0 mg/dL per unit       [Edit] [?] │   │
│ │ ┌─────────────────────────────────────────────┐ │   │
│ │ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ │   │
│ │ │ 0.0     15.0 (current)    50.0              │ │   │
│ │ └─────────────────────────────────────────────┘ │   │
│ │ Effect: High HR elevation raises glucose        │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Advanced Coefficients                 [Expand]  │   │
│ │ Calories: -0.4 mg/dL per kcal                   │   │
│ │ Stairs: +10.0 mg/dL per floor                   │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Activity Data Availability                      │   │
│ │ ✓ Heart rate data: 28 days                      │   │
│ │ ✓ Step count data: 30 days                      │   │
│ │ ✓ 95 windows with significant activity          │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ [Reset to Defaults]  [Start Tuning Run]                │
└─────────────────────────────────────────────────────────┘
```

### Help Content

#### Steps Coefficient Help Content
```markdown
**Steps Per Minute Coefficient**

Glucose impact of aerobic activity (walking, running).

**Impact of Changes**:
- More negative → Stronger glucose-lowering effect
  - Larger predicted drops during activity
  - May need less insulin or more carbs
  
- Less negative → Weaker glucose-lowering effect
  - Smaller predicted drops during activity
  - Less adjustment needed

**Typical Values**: -0.5 to -2.0 mg/dL per step/min above baseline

**Tuning Method**: Analyzes glucose changes during periods with
elevated step count to determine your personal activity sensitivity.

**Note**: Effect is calculated relative to your baseline activity
level, so only sustained elevated activity has significant impact.
```

#### HR Spike Coefficient Help Content
```markdown
**HR Spike Coefficient**

Glucose impact of heart rate elevation (anaerobic activity).

**Impact of Changes**:
- Higher value → Stronger glucose-raising effect
  - Larger predicted spikes during intense exercise
  - May need corrections after high-intensity workouts
  
- Lower value → Weaker glucose-raising effect
  - Smaller predicted spikes
  - Less adjustment needed

**Typical Values**: 10-25 mg/dL per unit of HR elevation

**Tuning Method**: Analyzes glucose changes when heart rate is
significantly elevated (>30% above resting) to determine your
response to anaerobic stress.

**Note**: This captures the adrenaline/stress response that can
temporarily raise glucose during intense exercise.
```

---

## PHASE 5: Holistic Tuning & Integration

### Overview

The final phase integrates all parameter tuning capabilities and adds a holistic tuning mode that optimizes all parameters simultaneously.

### Holistic Tuning Mode

#### Features

1. **Simultaneous Optimization** - Tune all parameters together
2. **Cross-Parameter Constraints** - Ensure physiological consistency
3. **Hierarchical Optimization** - Optimize in logical order:
   - First: DIA, Peak (affect all other calculations)
   - Second: Basal Rates (baseline insulin needs)
   - Third: ISF, ICR (insulin response)
   - Fourth: Activity Coefficients (external factors)
   - Fifth: Carb Absorption (meal dynamics)

4. **Validation & Testing** - Compare against individual tuning results

#### API Endpoint

**POST** `/api/profile/tune-holistic`

```typescript
{
    analysis_period_days: number;
    parameters_to_tune: {
        insulin_response: boolean;
        carb_absorption: boolean;
        basal_rates: boolean;
        activity: boolean;
    };
    optimization_strategy: 'simultaneous' | 'hierarchical';
}
```

### Profile Page Integration

#### Unified Tuning Dashboard

```
┌─────────────────────────────────────────────────────────┐
│ Profile Parameter Tuning                                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Quick Actions                                   │   │
│ │                                                 │   │
│ │ [Tune All Parameters]  [View Tuning History]   │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ 📊 Insulin Response Parameters                  │   │
│ │ Last tuned: 2026-01-15 | Source: Tuned         │   │
│ │ [View Details] [Tune] [Reset]                   │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ 🍽️ Carb Absorption Parameters                   │   │
│ │ Last tuned: Never | Source: Profile             │   │
│ │ [View Details] [Tune] [Reset]                   │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ 💉 Basal Rates                                  │   │
│ │ Last tuned: 2026-01-10 | Source: Tuned         │   │
│ │ [View Details] [Tune] [Reset]                   │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ 🏃 Activity Parameters                          │   │
│ │ Last tuned: Never | Source: Defaults            │   │
│ │ [View Details] [Tune] [Reset]                   │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Updated Implementation Timeline

**Total Duration**: 16 weeks

| Phase | Weeks | Focus | Deliverables |
|-------|-------|-------|--------------|
| **Phase 1** | 1-4 | Insulin Response | DIA, Peak, ISF tuning complete |
| **Phase 2** | 5-7 | Carb Absorption | ICR, absorption rate, S-curve tuning |
| **Phase 3** | 8-10 | Basal Rates | 24-hour basal profile optimization |
| **Phase 4** | 11-13 | Activity | Activity coefficient tuning |
| **Phase 5** | 14-16 | Integration | Holistic tuning, testing, polish |

### Detailed Phase Breakdown

#### Phase 1: Insulin Response (Weeks 1-4)
- Week 1: Database schema, API endpoints, backend service
- Week 2: Python optimizer extension, calculation logic updates
- Week 3: Frontend components, UI integration
- Week 4: Testing, refinement, documentation

#### Phase 2: Carb Absorption (Weeks 5-7)
- Week 5: Database schema, API endpoints, backend service
- Week 6: Python optimizer, frontend components
- Week 7: Integration, testing, documentation

#### Phase 3: Basal Rates (Weeks 8-10)
- Week 8: Database schema, API endpoints, backend service
- Week 9: Python optimizer, frontend components
- Week 10: Integration, testing, documentation

#### Phase 4: Activity (Weeks 11-13)
- Week 11: Database schema, API endpoints, backend service
- Week 12: Python optimizer, frontend components
- Week 13: Integration, testing, documentation

#### Phase 5: Integration & Holistic (Weeks 14-16)
- Week 14: Holistic tuning mode, unified dashboard
- Week 15: Cross-parameter validation, testing
- Week 16: Performance optimization, final documentation

---

## Success Metrics

### Technical Metrics
- Optimization completes in < 60 seconds for 30 days of data
- R² > 0.7 for successful tuning runs
- 95% confidence intervals within ±20% of optimized value

### User Metrics
- User applies tuning results > 50% of the time
- Improved glucose predictions (lower RMSE) after applying tuning
- Reduced time in hypo/hyper ranges

### Quality Metrics
- No crashes or errors during tuning
- Clear, understandable result explanations
- Positive user feedback on UI/UX

---

## Risk Mitigation

### Risk 1: Poor Optimization Results
**Mitigation**:
- Require minimum data quality threshold
- Show confidence intervals prominently
- Allow user to reject results
- Provide detailed logs for debugging

### Risk 2: User Applies Unsafe Parameters
**Mitigation**:
- Enforce hard bounds on all parameters
- Warn on large changes (>20%)
- Require explicit confirmation
- Allow easy rollback to previous values

### Risk 3: Performance Issues
**Mitigation**:
- Run optimization in background
- Implement timeout (5 minutes max)
- Cache intermediate results
- Allow cancellation

### Risk 4: Data Privacy
**Mitigation**:
- All processing happens on user's server
- No data sent to external services
- Tuning results stored securely
- User controls all data

---

## Documentation Requirements

### User Documentation
1. **Getting Started Guide** - How to run first tuning
2. **Parameter Explanations** - What each parameter means
3. **Interpreting Results** - How to read tuning output
4. **Troubleshooting** - Common issues and solutions
5. **FAQ** - Frequently asked questions

### Developer Documentation
1. **API Reference** - Complete endpoint documentation
2. **Database Schema** - Collection structures
3. **Optimization Algorithm** - Mathematical details
4. **Testing Guide** - How to test tuning
5. **Deployment Guide** - How to deploy changes

---

## Next Steps

### Immediate Actions (Week 1)

1. ✅ Review and approve this comprehensive plan
2. Create GitHub project board: "Profile Parameter Tuning"
3. Create milestone structure for all 5 phases
4. Set up development branch: `feature/profile-parameter-tuning`
5. Schedule bi-weekly progress reviews

### Phase 1 Kickoff (Week 1)

1. Create detailed GitHub issues for Phase 1 tasks
2. Set up database migration scripts for new collections
3. Design API endpoint specifications
4. Create wireframes for insulin response tuner UI
5. Schedule team alignment meeting

### Documentation Setup

1. Create user documentation structure in `/docs/user-guides/`
2. Create developer documentation in `/docs/dev-guides/`
3. Set up API documentation with examples
4. Create parameter tuning best practices guide

### Testing Strategy

1. **Unit Tests**: Each optimizer class, API endpoint, UI component
2. **Integration Tests**: End-to-end tuning flows
3. **Performance Tests**: Optimization runtime benchmarks
4. **User Acceptance Tests**: Real-world tuning scenarios
5. **Regression Tests**: Ensure tuned parameters improve predictions

---

*Plan Version: 2.0*  
*Last Updated: 2026-01-17*  
*Author: Freddy Development Team*  
*Status: Ready for Implementation*
