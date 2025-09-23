/**
 * Vapi API client (server-side only)
 * - Provides minimal wrapper for Create Campaign
 * - Reads API key and default phone number ID from env when not passed explicitly
 */

export type VapiSchedulePlan = {
  earliestAt?: string; // ISO-8601
  latestAt?: string;   // ISO-8601
};

export type VapiCustomer = {
  number?: string;         // E.164 target number
  sipUri?: string;         // alternative to number
  name?: string;
  email?: string;
  externalId?: string;     // our contact_id for correlation
  extension?: string;
  numberE164CheckEnabled?: boolean;
  assistantOverrides?: Record<string, unknown>;
};

export type VapiCreateCampaignRequest = {
  name: string;
  phoneNumberId: string; // required by Vapi
  customers: VapiCustomer[]; // required by Vapi
  assistantId?: string; // mutually exclusive with workflowId
  workflowId?: string;  // mutually exclusive with assistantId
  schedulePlan?: VapiSchedulePlan;
};

export type VapiCreateCampaignResponse = {
  id: string;
  status: 'scheduled' | 'in-progress' | 'ended';
  name: string;
  phoneNumberId: string;
  assistantId?: string | null;
  workflowId?: string | null;
  schedulePlan?: VapiSchedulePlan | null;
  // additional fields omitted
};

export type VapiAnalyticsOperation = {
  operation: 'sum' | 'count' | 'avg' | 'min' | 'max';
  column: string;
};

export type VapiAnalyticsQuery = {
  table: 'call';
  name: string;
  operations: VapiAnalyticsOperation[];
  timeRange?: {
    step?: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month';
    start: string; // ISO-8601
    end: string;   // ISO-8601
    timezone?: string;
  };
  groupBy?: string[];
  filters?: Record<string, any>;
};

export type VapiAnalyticsRequest = {
  queries: VapiAnalyticsQuery[];
};

export type VapiAnalyticsResult = {
  name: string;
  timeRange?: {
    step: string;
    start: string;
    end: string;
    timezone?: string;
  };
  result: Record<string, any>[];
};

export type VapiAnalyticsResponse = VapiAnalyticsResult[];

export class VapiClient {
  private baseUrl: string;
  private token: string;
  private phoneNumberId?: string;

  constructor(params?: { baseUrl?: string; token?: string; phoneNumberId?: string }) {
    this.baseUrl = params?.baseUrl || process.env.VAPI_BASE_URL || 'https://api.vapi.ai';
    const token = params?.token || process.env.VAPI_API_KEY;
    if (!token) throw new Error('VAPI_API_KEY is not set');
    this.token = token;
    this.phoneNumberId = params?.phoneNumberId || process.env.VAPI_PHONE_NUMBER_ID;
  }

  private async fetchJson<T>(path: string, init: Omit<RequestInit, 'body'> & { body?: any }): Promise<T> {
    const url = `${this.baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(url, {
      method: init.method || 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(init.headers || {}),
      },
      body: init.body ? (typeof init.body === 'string' ? init.body : JSON.stringify(init.body)) : undefined,
    });

    const text = await res.text();
    let data: any = undefined;
    try { data = text ? JSON.parse(text) : undefined; } catch { /* leave as text */ }

    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || text || `HTTP ${res.status}`;
      const err = new Error(`Vapi request failed: ${msg}`) as Error & { status?: number; raw?: any };
      (err as any).status = res.status;
      (err as any).raw = data ?? text;
      throw err;
    }

    return data as T;
  }

  /**
   * Create a Vapi Campaign.
   * If phoneNumberId is not provided in request, uses process.env.VAPI_PHONE_NUMBER_ID.
   */
  async createCampaign(req: Partial<VapiCreateCampaignRequest> & Pick<VapiCreateCampaignRequest, 'name' | 'customers'>): Promise<VapiCreateCampaignResponse> {
    const phoneNumberId = req.phoneNumberId || this.phoneNumberId;
    if (!phoneNumberId) throw new Error('VAPI_PHONE_NUMBER_ID is not set');

    if (!Array.isArray(req.customers) || req.customers.length === 0) {
      throw new Error('customers array is required and must be non-empty');
    }

    if (req.assistantId && req.workflowId) {
      throw new Error('Provide either assistantId or workflowId, not both');
    }

    const body: VapiCreateCampaignRequest = {
      name: req.name,
      phoneNumberId,
      customers: req.customers,
      assistantId: req.assistantId,
      workflowId: req.workflowId,
      schedulePlan: req.schedulePlan,
    };

    return this.fetchJson<VapiCreateCampaignResponse>('/campaign', { method: 'POST', body });
  }

  /**
   * Query Vapi Analytics API.
   * Filters by phoneNumberId from environment if available.
   */
  async getAnalytics(req: VapiAnalyticsRequest): Promise<VapiAnalyticsResponse> {
    // Add phoneNumberId filter if available
    const queries = req.queries.map(query => {
      if (this.phoneNumberId && !query.filters?.phoneNumberId) {
        return {
          ...query,
          filters: {
            ...query.filters,
            phoneNumberId: this.phoneNumberId
          }
        };
      }
      return query;
    });

    const body: VapiAnalyticsRequest = { queries };
    return this.fetchJson<VapiAnalyticsResponse>('/analytics', { method: 'POST', body });
  }
}

export function buildVapiCustomersFromQueueRows(rows: Array<{
  target_phone?: string | null;
  contact_id?: string | null;
  payload?: any;
}>): VapiCustomer[] {
  return rows.map((r) => {
    const snap = (r?.payload && r.payload.contact_snapshot) || {};
    const name = snap?.name ?? null;
    const email = snap?.email ?? null;
    const number = (r?.target_phone || snap?.phone || '').toString().trim() || undefined;
    const externalId = r?.contact_id || undefined;
    return {
      number,
      name: name || undefined,
      email: email || undefined,
      externalId,
      numberE164CheckEnabled: true,
    } as VapiCustomer;
  });
}
