import { useState, useRef, useCallback } from "react"
import { api, type ApiInstruction, type ApiMessage, type ApiAgreement } from "../api/client"
import { mapApiInstructionToDomain } from "../api/mappers"
import type {
  Instruction,
  VendorOffer,
  Operation,
  InboxItem,
  BudgetState,
  ProviderConnection,
  PrivateSupplier,
  AuthorityMode,
  MutationResult,
  EligibilityResult,
} from "../types/appai"
import {
  type AppaiState,
  type DomainCommand,
  type SavedConversationData,
  getInitialState,
  transition,
  checkEligibility,
  type ScenarioPreset,
  type DiagnosticLog,
} from "./domainCore"

export type { ScenarioPreset, DiagnosticLog }

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

export function useAppaiStore() {
  const [state, setState] = useState<AppaiState>(getInitialState)
  const stateRef = useRef(state)
  stateRef.current = state

  const [isHydrating, setIsHydrating] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  const dispatch = useCallback(
    (command: DomainCommand): MutationResult<any> => {
      const { nextState, result } = transition(stateRef.current, command)
      stateRef.current = nextState
      setState(nextState)
      return result
    },
    [],
  )

  // Hydrate store from backend API when authenticated
  const hydrateFromApi = useCallback(async () => {
    setIsHydrating(true)
    try {
      const session = await api.getSession()
      if (!session) {
        setIsAuthenticated(false)
        return { authenticated: false }
      }
      setIsAuthenticated(true)

      const [instructionsRes, budgetsRes] = await Promise.allSettled([
        api.getInstructions(),
        api.getBudgets(),
      ])

      if (instructionsRes.status === "fulfilled" && instructionsRes.value.length > 0) {
        const domainInstructions = instructionsRes.value.map(mapApiInstructionToDomain)
        dispatch({ type: "HYDRATE_INSTRUCTIONS", instructions: domainInstructions })
      }

      if (budgetsRes.status === "fulfilled" && budgetsRes.value.length > 0) {
        const activeBudget = budgetsRes.value.find((b) => b.active) || budgetsRes.value[0]
        if (activeBudget) {
          const limit = parseFloat(activeBudget.allocationLimitMinor) / 100
          dispatch({
            type: "HYDRATE_BUDGET",
            budget: {
              currency: activeBudget.currency,
              limit: Number.isFinite(limit) ? limit : 1200,
            },
          })
        }
      }

      return { authenticated: true }
    } catch (err) {
      console.warn("Hydration from API failed; continuing in fixture mode", err)
      return { authenticated: false, error: err }
    } finally {
      setIsHydrating(false)
    }
  }, [dispatch])

  // Stable mutation methods calling atomic dispatch
  const executePayment = useCallback(
    (offerId: string, expectedEpoch?: number): MutationResult<Operation> => {
      return dispatch({ type: "EXECUTE_PAYMENT", offerId, expectedEpoch })
    },
    [dispatch],
  )

  const executePaymentWithSchedule = useCallback(
    (
      offerId: string,
      activateSchedule: boolean,
      expectedEpoch?: number,
    ): MutationResult<Operation> => {
      return dispatch({
        type: "EXECUTE_PAYMENT",
        offerId,
        activateSchedule,
        expectedEpoch,
      })
    },
    [dispatch],
  )

  const confirmShippingAddress = useCallback(
    (
      operationId: string,
      address: string,
      expectedEpoch?: number,
    ): MutationResult<Operation> => {
      return dispatch({
        type: "CONFIRM_SHIPPING_ADDRESS",
        operationId,
        address,
        expectedEpoch,
      })
    },
    [dispatch],
  )

  const approveOffer = useCallback(
    (offerId: string): MutationResult<VendorOffer> => {
      return dispatch({ type: "APPROVE_OFFER", offerId })
    },
    [dispatch],
  )

  const rejectOffer = useCallback(
    (offerId: string, reason: string) => {
      dispatch({ type: "REJECT_OFFER", offerId, reason })
    },
    [dispatch],
  )

  const requestCancellation = useCallback(
    (operationId: string) => {
      dispatch({ type: "REQUEST_CANCELLATION", operationId })
    },
    [dispatch],
  )

  const updateInstruction = useCallback(
    (id: string, updates: Partial<Instruction>) => {
      return dispatch({ type: "UPDATE_INSTRUCTION", id, updates })
    },
    [dispatch],
  )

  const togglePauseInstruction = useCallback(
    (id: string) => {
      const currentInst = stateRef.current.instructions.find((i) => i.id === id)
      const res = dispatch({ type: "TOGGLE_PAUSE_INSTRUCTION", id })
      if (currentInst && isUuid(id)) {
        const nextAction = currentInst.status === "PAUSED" ? "RESUME" : "PAUSE"
        api.updateInstructionLifecycle(id, nextAction, currentInst.agreementVersion || 1).catch((err) => {
          console.warn("Failed to sync instruction pause/resume with backend:", err)
        })
      }
      return res
    },
    [dispatch],
  )

  const revokeInstruction = useCallback(
    (id: string) => {
      const currentInst = stateRef.current.instructions.find((i) => i.id === id)
      const res = dispatch({ type: "REVOKE_INSTRUCTION", id })
      if (currentInst && isUuid(id)) {
        api.updateInstructionLifecycle(id, "REVOKE", currentInst.agreementVersion || 1).catch((err) => {
          console.warn("Failed to sync instruction revocation with backend:", err)
        })
      }
      return res
    },
    [dispatch],
  )

  const createInstruction = useCallback(
    (
      title: string,
      category: string,
      criteria: string,
      authority: AuthorityMode,
      priceCeiling: number,
      stopRule?: string,
      timing?: string,
      extra?: {
        prompt?: string
        recommendations?: any[]
        selectedProvider?: string
        budgetId?: string
        memberCategory?: string
      },
    ) => {
      const res = dispatch({
        type: "CREATE_INSTRUCTION",
        payload: {
          title,
          category,
          criteria,
          authority,
          priceCeiling,
          stopRule,
          timing,
        },
      })
      const created = res.data as Instruction

      // Asynchronously persist to backend PostgreSQL if connected
      api.createInstruction({
        prompt: extra?.prompt || criteria || title,
        title,
        directive: criteria,
        category: category.toUpperCase().includes("COFFEE") || category.toUpperCase().includes("CHAIR") ? "PRODUCT" : "PRODUCT",
        mode: authority,
        maximumTotal: priceCeiling.toString(),
        budgetId: extra?.budgetId,
        recommendations: extra?.recommendations,
        selectedProvider: extra?.selectedProvider,
        memberCategory: extra?.memberCategory || "OTHER",
      }).then((apiRes) => {
        if (apiRes?.instruction) {
          const domainInst = mapApiInstructionToDomain(apiRes.instruction)
          dispatch({
            type: "UPSERT_INSTRUCTION",
            instruction: domainInst,
          })
          const oldConv = stateRef.current.savedConversations[`inst-${created.id}`]
          if (oldConv) {
            dispatch({
              type: "SAVE_CONVERSATION",
              key: `inst-${domainInst.id}`,
              data: oldConv,
            })
          }
        }
      }).catch((err) => {
        console.warn("Failed to persist instruction to backend (continuing in local state):", err)
      })

      return created
    },
    [dispatch],
  )

  // Conversation history and message persistence hooks
  const fetchConversation = useCallback(
    async (instructionId: string): Promise<{ messages: ApiMessage[]; agreement: ApiAgreement | null } | null> => {
      if (!isUuid(instructionId)) {
        return null
      }
      try {
        const conv = await api.getConversation(instructionId)
        return conv
      } catch (err) {
        console.warn(`Failed to fetch conversation for instruction ${instructionId}:`, err)
        return null
      }
    },
    [],
  )

  const sendConversationMessage = useCallback(
    async (
      instructionId: string,
      content: string,
      role: "MEMBER" | "ASSISTANT" = "MEMBER",
      metadata: Record<string, unknown> = {},
    ): Promise<ApiMessage | null> => {
      if (!isUuid(instructionId)) {
        return null
      }
      try {
        const res = await api.sendMessage(instructionId, content, role, metadata)
        return res.message
      } catch (err) {
        console.warn(`Failed to persist message for ${instructionId}:`, err)
        return null
      }
    },
    [],
  )

  const confirmAgreement = useCallback(
    async (
      instructionId: string,
      data: {
        selectedProvider?: unknown
        budgetId?: string
        maximumTotal?: string
      },
    ) => {
      if (!isUuid(instructionId)) {
        return null
      }
      try {
        const res = await api.confirmAgreement(instructionId, data)
        if (res?.instruction) {
          const domainInst = mapApiInstructionToDomain(res.instruction)
          dispatch({ type: "UPSERT_INSTRUCTION", instruction: domainInst })
        }
        return res
      } catch (err) {
        console.warn(`Failed to confirm agreement for ${instructionId}:`, err)
        return null
      }
    },
    [dispatch],
  )

  const requestFreshQuote = useCallback(
    (offerId: string) => {
      return dispatch({ type: "REQUEST_FRESH_QUOTE", offerId })
    },
    [dispatch],
  )

  const reconnectProvider = useCallback(
    (providerId: string) => {
      return dispatch({ type: "RECONNECT_PROVIDER", providerId })
    },
    [dispatch],
  )

  const updateBudgetLimit = useCallback(
    (newLimit: number) => {
      return dispatch({ type: "UPDATE_BUDGET_LIMIT", newLimit })
    },
    [dispatch],
  )

  const updatePreferences = useCallback(
    (
      currency: string,
      timezone: string,
      notificationPreferences?: {
        offerDecisions: boolean
        dispatchAlerts: boolean
      },
    ) => {
      return dispatch({
        type: "UPDATE_PREFERENCES",
        currency,
        timezone,
        notificationPreferences,
      })
    },
    [dispatch],
  )

  const addPrivateSupplier = useCallback(
    (supplier: Omit<PrivateSupplier, "id">) => {
      return dispatch({ type: "ADD_PRIVATE_SUPPLIER", supplier })
    },
    [dispatch],
  )

  const updatePrivateSupplier = useCallback(
    (id: string, updates: Partial<PrivateSupplier>) => {
      return dispatch({ type: "UPDATE_PRIVATE_SUPPLIER", id, updates })
    },
    [dispatch],
  )

  const removePrivateSupplier = useCallback(
    (id: string) => {
      return dispatch({ type: "REMOVE_PRIVATE_SUPPLIER", id })
    },
    [dispatch],
  )

  const loadScenario = useCallback(
    (scenario: ScenarioPreset) => {
      return dispatch({ type: "LOAD_SCENARIO", scenario })
    },
    [dispatch],
  )

  const saveConversation = useCallback(
    (key: string, data: SavedConversationData) => {
      return dispatch({ type: "SAVE_CONVERSATION", key, data })
    },
    [dispatch],
  )

  const getSavedConversation = useCallback((key: string) => {
    return stateRef.current.savedConversations[key] || null
  }, [])

  const checkPaymentEligibility = useCallback(
    (offerId: string): EligibilityResult => {
      return checkEligibility(stateRef.current, offerId)
    },
    [],
  )

  return {
    scenarioEpoch: state.scenarioEpoch,
    activeScenario: state.activeScenario,
    instructions: state.instructions,
    offers: state.offers,
    operations: state.operations,
    inboxItems: state.inboxItems,
    budget: state.budget,
    providers: state.providers,
    privateSuppliers: state.privateSuppliers,
    diagnostics: state.diagnostics,
    isHydrating,
    isAuthenticated,
    hydrateFromApi,
    fetchConversation,
    sendConversationMessage,
    confirmAgreement,
    checkPaymentEligibility,
    togglePauseInstruction,
    revokeInstruction,
    updateInstruction,
    getSavedConversation,
    saveConversation,
    approveOffer,
    rejectOffer,
    executePayment,
    executePaymentWithSchedule,
    requestCancellation,
    confirmShippingAddress,
    updateBudgetLimit,
    updatePreferences,
    createInstruction,
    reconnectProvider,
    requestFreshQuote,
    removePrivateSupplier,
    addPrivateSupplier,
    updatePrivateSupplier,
    loadScenario,
  }
}

export type AppaiStoreType = ReturnType<typeof useAppaiStore>
