/**
 * APPAI Authenticated HTTP Client
 * Connects the React UI to the local Better Auth and A-P-P-A-I API server.
 */

export interface MemberSession {
  user: {
    id: string
    name: string
    email: string
  }
  session: {
    id: string
    userId: string
    expiresAt: string
  }
}

export interface ApiInstruction {
  id: string
  promptText?: string
  memberCategory: string
  kind: string
  category: string | null
  mode: string
  state: "DRAFT" | "ACTIVE" | "PAUSED" | "CANCELLED" | "EXPIRED" | "COMPLETED"
  executionEnvironment?: string | null
  budgetId: string | null
  currency: string | null
  version: number | string
  maxTotalMinor: string | null
  validFrom: string | null
  validUntil: string | null
  timezoneSnapshot: string | null
  nextRunAt: string | null
  structuredConstraints: {
    description?: string
    title?: string
    directive?: string
    paymentRail?: string
    intent?: string
    requirements?: string
    recommendations?: Array<{
      vendor?: string
      title?: string
      price?: number
      delivery?: string
      returns?: string
      url?: string
      paypalAccepted?: boolean
    }>
    categoryDetails?: Record<string, unknown>
  }
  createdAt: string
}

export interface ApiMessage {
  id: string
  sequenceNumber: number
  role: "MEMBER" | "ASSISTANT" | "SYSTEM" | "TOOL"
  content: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface ApiAgreement {
  id: string
  agreementVersion: number
  planSnapshot: Record<string, unknown>
  unresolvedDetails: unknown[]
  confirmedByMemberAt: string | null
  createdAt: string
}

export interface ApiBudget {
  id: string
  name: string
  currency: string
  allocationLimitMinor: string
  validFrom: string | null
  validUntil: string | null
  active: boolean
}

export interface ApiCatalogueSupplier {
  id: string
  name: string
  categories: string[]
  serviceAreas: string[]
  status: string
}

export interface ApiPrivateSupplier {
  id: string
  name: string
  categories: string[]
  serviceAreas: string[]
  privateNotes: string | null
  lastConfirmedUseAt: string | null
  version: number | string
}

class ApiClient {
  private baseUrl = ""

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const headers = new Headers(options.headers || {})

    if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
      headers.set("Content-Type", "application/json")
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: "include", // Send session cookies
    })

    if (!response.ok) {
      let errorData: any
      try {
        errorData = await response.json()
      } catch {
        errorData = { message: response.statusText }
      }
      const err = new Error(errorData.message || errorData.code || `HTTP error ${response.status}`)
      ;(err as any).status = response.status
      ;(err as any).data = errorData
      throw err
    }

    if (response.status === 204) {
      return {} as T
    }

    return response.json() as Promise<T>
  }

  // --- Auth Endpoints ---

  async getSession(): Promise<MemberSession | null> {
    try {
      const res = await this.request<MemberSession>("/api/auth/get-session", {
        method: "GET",
      })
      return res?.user ? res : null
    } catch {
      return null
    }
  }

  async signIn(email: string, password: string): Promise<MemberSession> {
    return this.request<MemberSession>("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    })
  }

  async signOut(): Promise<void> {
    await this.request<void>("/api/auth/sign-out", {
      method: "POST",
      body: JSON.stringify({}),
    })
  }

  // --- Instructions Endpoints ---

  async getInstructions(): Promise<ApiInstruction[]> {
    const res = await this.request<{ instructions: ApiInstruction[] }>(
      "/api/v1/instructions",
      {
        method: "GET",
      },
    )
    return res.instructions || []
  }

  async createInstruction(data: {
    prompt: string
    title: string
    directive?: string
    category?: string
    mode?: string
    maximumTotal?: string
    budgetId?: string
    kind?: string
    memberCategory?: string
    recommendations?: Array<any>
    selectedProvider?: string
  }): Promise<{ id: string; instruction: ApiInstruction }> {
    const idempotencyKey = crypto.randomUUID()
    const res = await this.request<{ instruction: ApiInstruction }>(
      "/api/v1/instructions",
      {
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          description: data.prompt,
          prompt: data.prompt,
          title: data.title,
          directive: data.directive,
          category: data.category || "PRODUCT",
          mode: data.mode || "REVIEW_REQUIRED",
          kind: data.kind || "ONE_TIME",
          memberCategory: data.memberCategory || "OTHER",
          maximumTotal: data.maximumTotal,
          budgetId: data.budgetId,
          recommendations: data.recommendations,
          selectedProvider: data.selectedProvider,
        }),
      },
    )
    return { id: res.instruction.id, instruction: res.instruction }
  }

  async updateInstructionLifecycle(
    instructionId: string,
    action: "PAUSE" | "RESUME" | "REVOKE" | "pause" | "resume" | "revoke",
    version: number | string = 1,
  ): Promise<{ instruction?: ApiInstruction; fixtureOnly?: boolean }> {
    const actionLower = action.toLowerCase()
    const idempotencyKey = crypto.randomUUID()
    return this.request<{ instruction?: ApiInstruction; fixtureOnly?: boolean }>(
      `/api/v1/instructions/${instructionId}/${actionLower}`,
      {
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKey,
          "If-Match": `"${version}"`,
        },
      },
    )
  }

  async checkReadiness(instructionId: string): Promise<{
    instructionId: string
    state: string
    canActivate: boolean
    canActivateFixture: boolean
    fixtureLabel?: string
    blockers: Array<{ code: string; title: string; detail: string }>
    fixtureBlockers: Array<{ code: string; title: string; detail: string }>
  }> {
    return this.request(`/api/v1/instructions/${instructionId}/readiness`, {
      method: "GET",
    })
  }

  async activateFixture(
    instructionId: string,
    version: number | string = 1,
  ): Promise<{
    instruction: ApiInstruction
    fixtureLabel: string
  }> {
    const idempotencyKey = crypto.randomUUID()
    return this.request(`/api/v1/instructions/${instructionId}/activate-fixture`, {
      method: "POST",
      headers: {
        "Idempotency-Key": idempotencyKey,
        "If-Match": `"${version}"`,
      },
      body: JSON.stringify({}),
    })
  }

  // --- Conversation & Agreement Endpoints ---

  async getConversation(
    instructionId: string,
  ): Promise<{ messages: ApiMessage[]; agreement: ApiAgreement | null }> {
    return this.request<{
      messages: ApiMessage[]
      agreement: ApiAgreement | null
    }>(`/api/v1/instructions/${instructionId}/messages`, {
      method: "GET",
    })
  }

  async sendMessage(
    instructionId: string,
    content: string,
    role: "MEMBER" | "ASSISTANT" = "MEMBER",
    metadata: Record<string, unknown> = {},
  ): Promise<{ message: ApiMessage }> {
    return this.request<{ message: ApiMessage }>(
      `/api/v1/instructions/${instructionId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ content, role, metadata }),
      },
    )
  }

  async confirmAgreement(
    instructionId: string,
    data: {
      selectedProvider?: unknown
      budgetId?: string
      maximumTotal?: string
    },
  ): Promise<{ instruction?: ApiInstruction; agreement: ApiAgreement }> {
    return this.request<{ instruction?: ApiInstruction; agreement: ApiAgreement }>(
      `/api/v1/instructions/${instructionId}/agreement/confirm`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    )
  }

  // --- Budgets Endpoints ---

  async getBudgets(): Promise<ApiBudget[]> {
    const res = await this.request<{ budgets: ApiBudget[] }>("/api/v1/budgets", {
      method: "GET",
    })
    return res.budgets || []
  }

  // --- Suppliers Endpoints ---

  async getSuppliers(): Promise<{
    catalogue: ApiCatalogueSupplier[]
    mySuppliers: ApiPrivateSupplier[]
  }> {
    return this.request<{
      catalogue: ApiCatalogueSupplier[]
      mySuppliers: ApiPrivateSupplier[]
    }>("/api/v1/suppliers", {
      method: "GET",
    })
  }

  async createPrivateSupplier(data: {
    name: string
    categories: string[]
    serviceAreas?: string[]
    privateNotes?: string
  }): Promise<{ supplier: ApiPrivateSupplier }> {
    const idempotencyKey = crypto.randomUUID()
    return this.request<{ supplier: ApiPrivateSupplier }>("/api/v1/member-suppliers", {
      method: "POST",
      headers: {
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(data),
    })
  }

  async updatePrivateSupplier(
    id: string,
    version: number | string,
    data: {
      name: string
      categories: string[]
      serviceAreas?: string[]
      privateNotes?: string
    },
  ): Promise<{ supplier: ApiPrivateSupplier }> {
    return this.request<{ supplier: ApiPrivateSupplier }>(
      `/api/v1/member-suppliers/${id}`,
      {
        method: "PATCH",
        headers: {
          "If-Match": `"${version}"`,
        },
        body: JSON.stringify(data),
      },
    )
  }

  async deletePrivateSupplier(
    id: string,
    version: number | string,
  ): Promise<void> {
    return this.request<void>(`/api/v1/member-suppliers/${id}`, {
      method: "DELETE",
      headers: {
        "If-Match": `"${version}"`,
      },
    })
  }
}

export const api = new ApiClient()
