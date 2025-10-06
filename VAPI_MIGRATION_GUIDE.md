# Dashboard Migration: Supabase to Vapi API

## Overview

This document outlines the migration strategy to replace Supabase call data queries with Vapi API calls in the dashboard page. The goal is to simplify data architecture and reduce costs by using Vapi as the single source of truth for call data.

## Current Dashboard Data Sources (Supabase)

The dashboard currently fetches data from these Supabase tables:

### 1. Recent Calls (`calls` table)
```typescript
// Current query
supabase
  .from("calls")
  .select("id, customer_name, customer_phone, call_type, status, duration, notes, created_at")
  .in("user_id", owners)
  .order("created_at", { ascending: false })
  .limit(10)
```

**Used for:**
- Recent calls table (inbound/outbound tabs)
- Call summaries in modal dialogs

### 2. Call Statistics (`calls` table)
```typescript
// Current query
supabase
  .from("calls")
  .select("call_type, status")
  .in("user_id", owners)
  .limit(1000)
```

**Used for:**
- Inbound calls pie chart (Resolved/Not Resolved/Forwarded percentages)
- Outbound calls pie chart (Follow Up/Not Interested/Not Answered percentages)

### 3. Call Metrics (`call_history` table)
```typescript
// Current query
supabase
  .from("call_history")
  .select("duration, cost, ai_summary, notes, call_date")
  .in("user_id", owners)
  .order("call_date", { ascending: false })
  .limit(500)
```

**Used for:**
- Remaining Minutes card (total/used/percentage calculations)
- Average Call Duration card

### 4. Other Data Sources (Keep as-is)
- `campaigns` table - Keep using Supabase
- `talking_points_events` table - Keep using Supabase
- `account_users` table - Keep using Supabase for collaborator permissions

## Vapi API Integration

### Environment Variables (Already Configured)
```bash
VAPI_API_KEY=your_api_key
VAPI_PHONE_NUMBER_ID=your_phone_number_id
VAPI_BASE_URL=https://api.vapi.ai  # optional, defaults to this
```

### Available Vapi Endpoints

#### 1. List Calls API
**Endpoint:** `GET /api/vapi/calls`
**Current Implementation:** Already exists in `/app/api/vapi/calls/route.ts`

```typescript
// Automatically filters by VAPI_PHONE_NUMBER_ID from environment
const vapi = new VapiClient()
const calls = await vapi.listCalls({
  limit?: number,
  createdAtGte?: string,  // ISO-8601
  createdAtLte?: string,  // ISO-8601
})
```

#### 2. Analytics API
**Endpoint:** `GET /api/vapi/analytics`
**Current Implementation:** Already exists in `/app/api/vapi/analytics/route.ts`

```typescript
const analyticsRequest: VapiAnalyticsRequest = {
  queries: [{
    table: 'call',
    name: 'call_stats',
    operations: [
      { operation: 'count', column: 'id' },
      { operation: 'sum', column: 'duration' },
      { operation: 'avg', column: 'duration' }
    ],
    timeRange: {
      step: 'day',
      start: '2024-01-01T00:00:00Z',
      end: '2024-12-31T23:59:59Z',
      timezone: 'UTC'
    },
    groupBy: ['status', 'direction'],  // direction = inbound/outbound
    filters: {
      phoneNumberId: 'auto-injected-from-env'
    }
  }]
}
```

## Migration Strategy

### Phase 1: Replace Recent Calls Data

**Current Supabase Query:**
```typescript
const { data: calls } = await supabase
  .from("calls")
  .select("id, customer_name, customer_phone, call_type, status, duration, notes, created_at")
  .in("user_id", owners)
  .order("created_at", { ascending: false })
  .limit(10)
```

**New Vapi API Call:**
```typescript
const response = await fetch('/api/vapi/calls')
const { data: vapiCalls } = await response.json()

// Transform Vapi data to match current interface
const calls = vapiCalls.slice(0, 10).map(vapiCall => ({
  id: vapiCall.id,
  customer_name: vapiCall.customer?.name || 'Unknown',
  customer_phone: vapiCall.customer?.number || vapiCall.phoneNumber,
  call_type: vapiCall.type || 'outbound', // Vapi calls are typically outbound
  status: mapVapiStatus(vapiCall.status), // Map Vapi status to our status
  duration: vapiCall.duration || 0,
  notes: vapiCall.summary || vapiCall.transcript || '',
  created_at: vapiCall.createdAt
}))
```

### Phase 2: Replace Call Statistics

**Current Logic:**
- Filters calls by `call_type` (inbound/outbound)
- Groups by `status` (completed/missed/in_progress)

**New Vapi Analytics Approach:**
```typescript
const analyticsRequest = {
  queries: [{
    table: 'call',
    name: 'status_breakdown',
    operations: [{ operation: 'count', column: 'id' }],
    groupBy: ['status', 'type'], // type might be available in Vapi
    filters: {
      phoneNumberId: 'auto-injected'
    }
  }]
}

const response = await fetch('/api/vapi/analytics', {
  method: 'POST',
  body: JSON.stringify(analyticsRequest)
})
```

### Phase 3: Replace Call Metrics

**Current Calculation:**
- Total package minutes: 5000 (hardcoded)
- Used minutes: Sum of all call durations
- Average duration: Total duration / call count

**New Vapi Analytics Approach:**
```typescript
const metricsRequest = {
  queries: [{
    table: 'call',
    name: 'call_metrics',
    operations: [
      { operation: 'sum', column: 'duration' },
      { operation: 'count', column: 'id' },
      { operation: 'avg', column: 'duration' }
    ],
    filters: {
      phoneNumberId: 'auto-injected'
    }
  }]
}
```

## Data Mapping

### Vapi Call Object Structure (Expected)
```typescript
interface VapiCall {
  id: string
  status: 'queued' | 'ringing' | 'in-progress' | 'forwarding' | 'ended'
  type?: 'inbound' | 'outbound'
  phoneNumberId: string
  customer?: {
    number: string
    name?: string
    email?: string
  }
  duration?: number // in seconds
  cost?: number
  createdAt: string // ISO-8601
  updatedAt: string // ISO-8601
  endedAt?: string // ISO-8601
  summary?: string
  transcript?: string
  recordingUrl?: string
  // ... other fields
}
```

### Status Mapping
```typescript
function mapVapiStatus(vapiStatus: string): 'completed' | 'missed' | 'in_progress' {
  switch (vapiStatus) {
    case 'ended':
      return 'completed'
    case 'queued':
    case 'ringing':
    case 'in-progress':
    case 'forwarding':
      return 'in_progress'
    default:
      return 'missed'
  }
}
```

## Implementation Steps

### Step 1: Update Dashboard Data Fetching
Replace the current `fetchData` function in `/app/dashboard/page.tsx`:

```typescript
const fetchData = async (uid?: string) => {
  try {
    // Keep existing auth and collaborator logic
    // ...

    // Replace Supabase calls with Vapi API calls
    const results = await Promise.allSettled([
      // NEW: Fetch calls from Vapi
      fetch('/api/vapi/calls').then(res => res.json()),
      
      // NEW: Fetch call analytics from Vapi
      fetch('/api/vapi/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: [{
            table: 'call',
            name: 'dashboard_stats',
            operations: [
              { operation: 'count', column: 'id' },
              { operation: 'sum', column: 'duration' },
              { operation: 'avg', column: 'duration' }
            ],
            groupBy: ['status'],
            filters: { phoneNumberId: 'auto-injected' }
          }]
        })
      }).then(res => res.json()),
      
      // KEEP: Existing Supabase queries for campaigns and talking points
      supabase.from("campaigns").select("..."),
      supabase.from("talking_points_events").select("...")
    ])

    // Transform and set data
    if (results[0].status === 'fulfilled') {
      const vapiCalls = results[0].value.data || []
      setCalls(transformVapiCalls(vapiCalls))
    }

    if (results[1].status === 'fulfilled') {
      const analytics = results[1].value.data || []
      calculateCallStatsFromVapi(analytics)
      calculateCallMetricsFromVapi(analytics)
    }

    // Handle other results...
  } catch (error) {
    console.error("Error fetching data:", error)
  }
}
```

### Step 2: Remove Supabase Realtime Subscription
Since Vapi doesn't support realtime updates, replace the realtime subscription with periodic polling:

```typescript
useEffect(() => {
  const interval = setInterval(() => {
    if (currentUserId) {
      fetchData(currentUserId)
    }
  }, 30000) // Poll every 30 seconds

  return () => clearInterval(interval)
}, [currentUserId])
```

### Step 3: Update Helper Functions
Create new helper functions to process Vapi data:

```typescript
function transformVapiCalls(vapiCalls: any[]): Call[] {
  return vapiCalls.map(call => ({
    id: call.id,
    user_id: 'vapi', // Not applicable for Vapi calls
    customer_name: call.customer?.name || 'Unknown',
    customer_phone: call.customer?.number || call.phoneNumber,
    call_type: call.type || 'outbound',
    status: mapVapiStatus(call.status),
    duration: call.duration || 0,
    notes: call.summary || call.transcript || '',
    created_at: call.createdAt,
    updated_at: call.updatedAt
  }))
}

function calculateCallStatsFromVapi(analytics: any[]) {
  // Process Vapi analytics results to calculate inbound/outbound stats
  // Implementation depends on actual Vapi analytics response structure
}

function calculateCallMetricsFromVapi(analytics: any[]) {
  // Process Vapi analytics results to calculate duration metrics
  // Implementation depends on actual Vapi analytics response structure
}
```

## Testing Strategy

### 1. Environment Setup
Ensure these environment variables are set:
```bash
VAPI_API_KEY=your_actual_api_key
VAPI_PHONE_NUMBER_ID=your_actual_phone_number_id
```

### 2. API Testing
Test the existing Vapi endpoints:
```bash
# Test calls endpoint
curl http://localhost:3000/api/vapi/calls

# Test analytics endpoint
curl -X POST http://localhost:3000/api/vapi/analytics \
  -H "Content-Type: application/json" \
  -d '{"queries":[{"table":"call","name":"test","operations":[{"operation":"count","column":"id"}]}]}'
```

### 3. Data Validation
Compare data between Supabase and Vapi:
- Call counts should match (for overlapping time periods)
- Duration calculations should be consistent
- Status mappings should be logical

## Rollback Plan

If issues arise, the migration can be rolled back by:

1. **Feature Flag Approach:** Add an environment variable to toggle between data sources:
```typescript
const USE_VAPI_DATA = process.env.NEXT_PUBLIC_USE_VAPI_DATA === 'true'

const fetchData = async () => {
  if (USE_VAPI_DATA) {
    // Use Vapi API
  } else {
    // Use existing Supabase queries
  }
}
```

2. **Gradual Migration:** Migrate one data source at a time, keeping others on Supabase until fully tested.

## Benefits of Migration

1. **Cost Reduction:** Eliminates Supabase database costs for call data storage
2. **Simplified Architecture:** Single source of truth for call data
3. **Real-time Data:** Always up-to-date call information from Vapi
4. **Reduced Complexity:** No need to sync call data between systems

## Considerations

1. **Rate Limits:** Vapi API may have rate limits - implement appropriate caching
2. **Error Handling:** Robust error handling for API failures
3. **Performance:** API calls may be slower than database queries - implement loading states
4. **Data Retention:** Understand Vapi's data retention policies vs. current Supabase storage
5. **Filtering:** Ensure proper filtering by `phoneNumberId` to show only relevant calls

## Next Steps

1. Test existing Vapi API endpoints with real data
2. Implement data transformation functions
3. Create feature flag for gradual rollout
4. Update dashboard component with new data fetching logic
5. Test thoroughly in development environment
6. Deploy with feature flag disabled initially
7. Enable feature flag and monitor for issues
8. Remove old Supabase code once migration is confirmed successful