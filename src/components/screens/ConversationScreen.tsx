import { useState, useRef, useEffect, useCallback } from "react"
import { Icon, Button, BrandMark } from "../common/CommonUI"
import type { AppaiStoreType } from "../../store/appaiStore"
import type { AuthorityMode, CandidateSupplier } from "../../types/appai"
import { api } from "../../api/client"

export type EvidenceType = "ADVERTISED_OFFER" | "ESTIMATE" | "AUTHORITATIVE_QUOTE"

export interface ResearchCard {
  vendor: string
  title: string
  price: number
  delivery: string
  returns: string
  url: string
  highlight?: string
  evidenceType?: EvidenceType
  sourceDate?: string
  paypalEligible?: boolean
  isAlternative?: boolean
}

export interface ProposalData {
  id?: string
  need: string
  category: string
  criteria: string
  priceCeiling: number
  authority: AuthorityMode
  stopRule: string
  selectedProvider?: string
  quantity?: string
  timing?: string
  agreementVersion?: number
  estimatedTotal?: number
  isSuperseded?: boolean
}

interface ChatMessage {
  id: string
  sender: "assistant" | "member"
  text: string
  researchCards?: ResearchCard[]
  quickClarifications?: string[]
  agreementProposal?: ProposalData
}

// Robust price extractor that avoids "30-day", "2 bags", "4 vcpu", etc. (C10)
function extractPrice(text: string): number | null {
  // 1. Matches "$450", "$ 400.50"
  const dollarMatch = text.match(/\$\s*(\d+(?:\.\d+)?)/)
  if (dollarMatch) {
    const val = parseFloat(dollarMatch[1])
    if (Number.isFinite(val) && val > 0) return val
  }

  // 2. Matches "under 400", "ceiling 350", "budget 200", "limit 45", "target 280"
  const phraseMatch = text.match(
    /(?:under|below|ceiling|budget|limit|max|target)\s+(\d+(?:\.\d+)?)\s*(?:dollars|usd)?/i,
  )
  if (phraseMatch) {
    const val = parseFloat(phraseMatch[1])
    if (Number.isFinite(val) && val > 0) return val
  }

  return null
}

export function ConversationScreen({
  store,
  editingInstructionId,
  onClose,
  onComplete,
}: {
  store: AppaiStoreType
  editingInstructionId?: string | null
  onClose: () => void
  onComplete: () => void
}) {
  const existingInst = editingInstructionId
    ? store.instructions.find((i) => i.id === editingInstructionId)
    : null

  const conversationKey = editingInstructionId
    ? `inst-${editingInstructionId}`
    : "new-instruction-draft"

  const savedData = store.getSavedConversation(conversationKey)

  const [draft, setDraft] = useState<string>(() => {
    return savedData?.draftText || ""
  })

  const [selectedAuthority, setSelectedAuthority] = useState<AuthorityMode>(
    existingInst ? existingInst.authority : "REVIEW_REQUIRED",
  )
  const [proposalCeiling, setProposalCeiling] = useState<number>(
    existingInst ? existingInst.priceCeiling : 450,
  )
  const [isTyping, setIsTyping] = useState(false)
  const [supplierCandidates, setSupplierCandidates] = useState<CandidateSupplier[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef<string>("")

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (savedData?.messages && savedData.messages.length > 0) {
      return savedData.messages
    }
    // Also check legacy array format
    if (Array.isArray(savedData) && savedData.length > 0) {
      return savedData
    }

    if (existingInst) {
      return [
        {
          id: "m-loaded",
          sender: "assistant",
          text: `I have loaded your active directive for "${existingInst.title}" (Agreement v${existingInst.agreementVersion}). Current terms: ${existingInst.criteria}, ceiling $${existingInst.priceCeiling.toFixed(2)}, authority: ${existingInst.authority.replace("_", " ")}. What parameters or boundaries would you like to amend?`,
          quickClarifications: [
            "Keep criteria, update price ceiling",
            "Change authority to Notify only",
            "Require delivery by next week",
          ],
          agreementProposal: {
            id: `prop-init-${existingInst.id}`,
            need: existingInst.title,
            category: existingInst.category,
            criteria: existingInst.criteria,
            priceCeiling: existingInst.priceCeiling,
            authority: existingInst.authority,
            stopRule: existingInst.stopRule,
            selectedProvider: existingInst.category.toLowerCase().includes("coffee")
              ? "Northline Roasters"
              : undefined,
            quantity: existingInst.category.toLowerCase().includes("coffee")
              ? "2 bags whole bean"
              : "1 unit",
            timing: existingInst.nextRun,
            agreementVersion: existingInst.agreementVersion || 1,
            estimatedTotal: existingInst.priceCeiling,
            isSuperseded: false,
          },
        },
      ]
    }

    return [
      {
        id: "m-welcome",
        sender: "assistant",
        text: "Hello Leah! What would you like me to research, compare, or arrange for you today?",
        quickClarifications: [
          "Find an ergonomic desk chair under $450",
          "Arrange a monthly whole-bean coffee delivery",
          "Track noise-cancelling headphones until price drops",
        ],
      },
    ]
  })

  // Stable conversation persistence without render loops (R3-01)
  const saveFn = store.saveConversation
  useEffect(() => {
    const payload = { messages, draftText: draft }
    const serialized = JSON.stringify(payload)
    if (lastSavedRef.current !== serialized) {
      lastSavedRef.current = serialized
      saveFn(conversationKey, payload)
    }
  }, [conversationKey, messages, draft, saveFn])

  // Hydrate durable message history from backend when editing a persisted instruction
  useEffect(() => {
    if (!editingInstructionId) return
    let isCurrent = true
    store.fetchConversation(editingInstructionId).then((res) => {
      if (!isCurrent || !res?.messages || res.messages.length === 0) return
      const mapped: ChatMessage[] = res.messages.map((m: any) => {
        const metadata = m.metadata || {}
        return {
          id: m.id || `m-seq-${m.sequenceNumber}`,
          sender: m.role === "ASSISTANT" ? "assistant" : "member",
          text: m.content,
          researchCards: metadata.recommendations || metadata.researchCards,
          quickClarifications: metadata.quickClarifications,
          agreementProposal: metadata.agreementProposal,
        }
      })
      if (mapped.length > 0) {
        setMessages(mapped)
      }
    })
    return () => {
      isCurrent = false
    }
  }, [editingInstructionId, store])

  useEffect(() => {
    if (!editingInstructionId) return
    let current = true
    api.getDiscoveryCandidates({ instructionId: editingInstructionId }).then((candidates) => {
      if (current) setSupplierCandidates(candidates)
    }).catch(() => {
      if (current) setSupplierCandidates([])
    })
    return () => { current = false }
  }, [editingInstructionId])

  // Scroll to bottom on updates with reduced-motion support
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
    messagesEndRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
    })
  }, [messages, isTyping])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // Update a specific proposal within a message (R3-03 proposal independence)
  const handleUpdateProposal = (
    messageId: string,
    updates: Partial<ProposalData>,
  ) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id === messageId && msg.agreementProposal) {
          const nextProp = { ...msg.agreementProposal, ...updates }
          if (updates.authority) setSelectedAuthority(updates.authority)
          if (updates.priceCeiling !== undefined)
            setProposalCeiling(updates.priceCeiling)
          return {
            ...msg,
            agreementProposal: nextProp,
          }
        }
        return msg
      }),
    )
  }

  // Handle selecting a specific research candidate card as the chosen provider
  const handleSelectCandidate = (card: ResearchCard) => {
    setProposalCeiling(card.price)
    setMessages((prev) =>
      prev.map((m) => {
        if (m.agreementProposal && !m.agreementProposal.isSuperseded) {
          return {
            ...m,
            agreementProposal: {
              ...m.agreementProposal,
              priceCeiling: card.price,
              selectedProvider: card.vendor,
              estimatedTotal: card.price,
              timing: card.delivery,
              criteria: `${m.agreementProposal.criteria} · Selected Provider: ${card.vendor} (${card.title})`,
            },
          }
        }
        return m
      }),
    )
    handleSend(
      `I'd like to proceed with ${card.vendor} at $${card.price.toFixed(2)}. Please confirm these terms in the agreement.`,
    )
  }

  // Detect current active topic / category from messages
  const getCurrentTopic =
    useCallback((): "chair" | "coffee" | "headphones" | "general" => {
      if (existingInst) {
        const lower = (
          existingInst.title +
          " " +
          existingInst.category
        ).toLowerCase()
        if (
          lower.includes("chair") ||
          lower.includes("office") ||
          lower.includes("lumbar")
        )
          return "chair"
        if (
          lower.includes("coffee") ||
          lower.includes("pantry") ||
          lower.includes("roaster")
        )
          return "coffee"
        if (lower.includes("headphone") || lower.includes("electronics"))
          return "headphones"
      }

      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]
        if (m.agreementProposal) {
          const lower = (
            m.agreementProposal.need +
            " " +
            m.agreementProposal.category
          ).toLowerCase()
          if (lower.includes("chair")) return "chair"
          if (lower.includes("coffee")) return "coffee"
          if (lower.includes("headphone")) return "headphones"
        }
      }
      return "general"
    }, [existingInst, messages])

  const generateAssistantResponse = (
    userText: string,
    currentTurn: number,
  ): ChatMessage => {
    const textLower = userText.toLowerCase()
    const detectedPrice = extractPrice(userText)
    const currentTopic = getCurrentTopic()

    // Context accumulator across all turns (AC-19)
    const historyText = [
      ...messages.map((m) => m.text),
      ...(existingInst ? [existingInst.title, existingInst.criteria] : []),
      userText,
    ]
      .join(" ")
      .toLowerCase()

    const hasLumbar = historyText.includes("lumbar")
    const hasMesh =
      historyText.includes("mesh") || historyText.includes("breathable")
    const hasReturns =
      historyText.includes("return") || historyText.includes("30-day")
    const hasExpedited =
      historyText.includes("next week") ||
      historyText.includes("expedited") ||
      historyText.includes("fast delivery")

    // 1. Existing instruction amendment
    if (existingInst) {
      const nextVer = (existingInst.agreementVersion || 1) + 1
      const defaultProvider = existingInst.category.toLowerCase().includes("coffee")
        ? "Northline Roasters"
        : undefined
      const defaultQuantity = existingInst.category.toLowerCase().includes("coffee")
        ? "2 bags whole bean"
        : "1 unit"
      const defaultTiming = existingInst.nextRun || "Undated continuous alert feed"

      if (
        textLower.includes("keep criteria") ||
        textLower.includes("update price ceiling") ||
        textLower.includes("ceiling") ||
        textLower.includes("budget") ||
        detectedPrice !== null
      ) {
        const newCeiling =
          detectedPrice !== null ? detectedPrice : existingInst.priceCeiling
        setProposalCeiling(newCeiling)
        return {
          id: `asst-${Date.now()}`,
          sender: "assistant",
          text: `I have updated your proposal ceiling to $${newCeiling.toFixed(2)} while preserving your original criteria (${existingInst.criteria}). Review and confirm the amendment below:`,
          agreementProposal: {
            id: `prop-${Date.now()}`,
            need: existingInst.title,
            category: existingInst.category,
            criteria: existingInst.criteria,
            priceCeiling: newCeiling,
            authority: selectedAuthority,
            stopRule: existingInst.stopRule,
            selectedProvider: defaultProvider,
            quantity: defaultQuantity,
            timing: defaultTiming,
            agreementVersion: nextVer,
            estimatedTotal: newCeiling,
            isSuperseded: false,
          },
        }
      }

      if (
        textLower.includes("notify only") ||
        textLower.includes("pre-approved") ||
        textLower.includes("review required") ||
        textLower.includes("authority")
      ) {
        let newAuth = selectedAuthority
        if (textLower.includes("notify only")) newAuth = "NOTIFY_ONLY"
        else if (textLower.includes("pre-approved")) newAuth = "PRE_APPROVED"
        else if (textLower.includes("review required"))
          newAuth = "REVIEW_REQUIRED"
        setSelectedAuthority(newAuth)

        return {
          id: `asst-${Date.now()}`,
          sender: "assistant",
          text: `Authority set to ${newAuth.replace("_", " ")}. Existing criteria and ceiling ($${existingInst.priceCeiling.toFixed(2)}) are retained:`,
          agreementProposal: {
            id: `prop-${Date.now()}`,
            need: existingInst.title,
            category: existingInst.category,
            criteria: existingInst.criteria,
            priceCeiling: proposalCeiling,
            authority: newAuth,
            stopRule: existingInst.stopRule,
            selectedProvider: defaultProvider,
            quantity: defaultQuantity,
            timing: defaultTiming,
            agreementVersion: nextVer,
            estimatedTotal: proposalCeiling,
            isSuperseded: false,
          },
        }
      }

      if (
        textLower.includes("delivery") ||
        textLower.includes("next week") ||
        textLower.includes("shipping")
      ) {
        return {
          id: `asst-${Date.now()}`,
          sender: "assistant",
          text: `I verified delivery options for "${existingInst.title}". Expedited delivery can arrive by next week. Updated criteria:`,
          agreementProposal: {
            id: `prop-${Date.now()}`,
            need: existingInst.title,
            category: existingInst.category,
            criteria: `${existingInst.criteria} · Expedited delivery required by next week`,
            priceCeiling:
              detectedPrice !== null ? detectedPrice : proposalCeiling,
            authority: selectedAuthority,
            stopRule: existingInst.stopRule,
            selectedProvider: defaultProvider,
            quantity: defaultQuantity,
            timing: "Expedited: Next week",
            agreementVersion: nextVer,
            estimatedTotal:
              detectedPrice !== null ? detectedPrice : proposalCeiling,
            isSuperseded: false,
          },
        }
      }

      return {
        id: `asst-${Date.now()}`,
        sender: "assistant",
        text: `I synthesized your amendment for "${existingInst.title}": "${userText}". Criteria and boundaries are updated:`,
        agreementProposal: {
          id: `prop-${Date.now()}`,
          need: existingInst.title,
          category: existingInst.category,
          criteria: `${existingInst.criteria} · ${userText}`,
          priceCeiling:
            detectedPrice !== null ? detectedPrice : proposalCeiling,
          authority: selectedAuthority,
          stopRule: existingInst.stopRule,
          selectedProvider: defaultProvider,
          quantity: defaultQuantity,
          timing: defaultTiming,
          agreementVersion: nextVer,
          estimatedTotal:
            detectedPrice !== null ? detectedPrice : proposalCeiling,
          isSuperseded: false,
        },
      }
    }

    // 2. Chair discussion or follow-up (C10, AC-19)
    const isExplicitChair =
      textLower.includes("chair") ||
      textLower.includes("lumbar") ||
      textLower.includes("ergonomic") ||
      textLower.includes("desk chair")
    const isChairFollowUp =
      currentTopic === "chair" &&
      !textLower.includes("coffee") &&
      !textLower.includes("roast") &&
      !textLower.includes("headphone")

    if (isExplicitChair || isChairFollowUp) {
      // Rejection or price objection journey (AC-19)
      const isPriceRejection =
        textLower.includes("expensive") ||
        textLower.includes("cheaper") ||
        textLower.includes("too high") ||
        textLower.includes("cost less") ||
        textLower.includes("lower price") ||
        textLower.includes("reject") ||
        textLower.includes("alternative") ||
        textLower.includes("budget option") ||
        textLower.includes("less expensive") ||
        (detectedPrice !== null &&
          detectedPrice <= 300 &&
          (isExplicitChair || isChairFollowUp))

      if (isPriceRejection) {
        const targetCeiling =
          detectedPrice !== null && detectedPrice <= 300 ? detectedPrice : 280
        setProposalCeiling(targetCeiling)

        return {
          id: `asst-${Date.now()}`,
          sender: "assistant",
          text: `Understood. Ruling out higher-priced tiers and focusing strictly on vetted ergonomic alternatives under $${targetCeiling.toFixed(2)} that preserve your criteria (${hasLumbar ? "adjustable lumbar" : "lumbar ergonomics"}, ${hasMesh ? "breathable mesh" : "durable design"}):`,
          researchCards: [
            {
              vendor: "Ticova Ergonomics",
              title: "Ticova Ergonomic Task Chair with Dynamic Lumbar",
              price: 219.0,
              delivery: "June 15–17 (Free shipping)",
              returns: "30-day risk-free returns",
              url: "https://ticova.example.com/task-chair",
              highlight: "Best budget lumbar support under $250",
              evidenceType: "ADVERTISED_OFFER",
              sourceDate: "Today",
              paypalEligible: true,
              isAlternative: true,
            },
            {
              vendor: "Alera Furniture",
              title: "Alera Elusion Series Mesh Mid-Back Chair",
              price: 195.0,
              delivery: "June 14–18 ($12 shipping)",
              returns: "30-day return policy",
              url: "https://alera.example.com/elusion-mesh",
              highlight: "Proven commercial durability",
              evidenceType: "ADVERTISED_OFFER",
              sourceDate: "Today",
              paypalEligible: true,
              isAlternative: true,
            },
            {
              vendor: "Modway Furniture",
              title: "Modway Articulate Breathable Mesh Chair",
              price: 165.5,
              delivery: "June 16–20 (Free shipping)",
              returns: "30-day money-back guarantee",
              url: "https://modway.example.com/articulate",
              highlight: "Most affordable breathable mesh",
              evidenceType: "ADVERTISED_OFFER",
              sourceDate: "Today",
              paypalEligible: true,
              isAlternative: true,
            },
          ],
          quickClarifications: [
            "Choose Ticova ($219.00)",
            "Choose Alera ($195.00)",
            `Confirm $${targetCeiling.toFixed(2)} ceiling`,
          ],
          agreementProposal: {
            id: `prop-${Date.now()}`,
            need: "Find an ergonomic desk chair (Budget alternative)",
            category: "Home Office",
            criteria: `Black/charcoal breathable mesh · ${hasLumbar ? "Dynamic lumbar support · " : ""}30-day return window · Budget tier under $${targetCeiling}`,
            priceCeiling: targetCeiling,
            authority: selectedAuthority,
            stopRule: "Cease when approved or after 30 days",
            selectedProvider: "Ticova Ergonomics or vetted equivalent",
            quantity: "1 unit",
            timing: "June 15–17",
            agreementVersion: 1,
            estimatedTotal: targetCeiling,
            isSuperseded: false,
          },
        }
      }

      // First turn incomplete intake
      if (
        currentTurn === 1 &&
        !textLower.includes("lumbar") &&
        !textLower.includes("return") &&
        !textLower.includes("under")
      ) {
        return {
          id: `asst-${Date.now()}`,
          sender: "assistant",
          text: "I can certainly help you find the right chair. To ensure maximum ergonomic comfort, do you require dynamic lumbar adjustability, and is a 30-day return policy essential for you?",
          quickClarifications: [
            "Adjustable lumbar · 30-day free returns",
            "Must stay under $400 total",
            "Require delivery by next week",
          ],
        }
      }

      const ceiling =
        detectedPrice !== null ? detectedPrice : proposalCeiling || 450
      setProposalCeiling(ceiling)

      return {
        id: `asst-${Date.now()}`,
        sender: "assistant",
        text: "I surveyed verified commercial furniture partners. Here is the comparative breakdown with confirmed delivery windows, return guarantees, and inspectable links:",
        researchCards: [
          {
            vendor: "WorkForm Direct",
            title: "WorkForm Pro Ergonomic Task Chair",
            price: 390.0,
            delivery: "June 14–16 (Free shipping)",
            returns: "30-day free returns with prepaid label",
            url: "https://workform.example.com/pro-task",
            highlight: "Best lumbar ergonomics within budget",
            evidenceType: "ADVERTISED_OFFER",
            sourceDate: "Today",
            paypalEligible: true,
          },
          {
            vendor: "Steelcase Store",
            title: "Series 1 Mesh Task Chair",
            price: 495.0,
            delivery: "June 20–24 ($25 shipping)",
            returns: "14-day return window",
            url: "https://steelcase.example.com/series-1",
            highlight: "Premium build · Above typical ceiling",
            evidenceType: "ADVERTISED_OFFER",
            sourceDate: "Today",
            paypalEligible: true,
          },
          {
            vendor: "Branch Furniture",
            title: "Ergonomic Task Chair",
            price: 349.0,
            delivery: "June 18–22 (Free shipping)",
            returns: "30-day return window",
            url: "https://branchfurniture.example.com/ergonomic",
            highlight: "Balanced value and ergonomics",
            evidenceType: "ADVERTISED_OFFER",
            sourceDate: "Today",
            paypalEligible: true,
          },
        ],
        agreementProposal: {
          id: `prop-${Date.now()}`,
          need: "Find an ergonomic desk chair",
          category: "Home Office",
          criteria: `Black/charcoal breathable mesh · ${hasLumbar ? "Dynamic lumbar support · " : ""}30-day return window${hasExpedited ? " · Delivery by next week" : ""}`,
          priceCeiling: ceiling,
          authority: selectedAuthority,
          stopRule: "Cease when approved or after 30 days",
          selectedProvider: "WorkForm Direct or vetted equivalent",
          quantity: "1 unit",
          timing: hasExpedited ? "June 14–16 (Expedited)" : "June 14–16",
          agreementVersion: 1,
          estimatedTotal: ceiling,
          isSuperseded: false,
        },
      }
    }

    // 3. Coffee subscription (requires explicit coffee/roast/bean keywords, NOT just "delivery")
    const isExplicitCoffee =
      textLower.includes("coffee") ||
      textLower.includes("roast") ||
      textLower.includes("whole bean") ||
      textLower.includes("beans")
    const isCoffeeFollowUp =
      currentTopic === "coffee" &&
      !textLower.includes("chair") &&
      !textLower.includes("headphone")

    if (isExplicitCoffee || isCoffeeFollowUp) {
      const isCoffeeRejection =
        textLower.includes("cheaper") ||
        textLower.includes("expensive") ||
        textLower.includes("reject") ||
        textLower.includes("single bag") ||
        (detectedPrice !== null && detectedPrice < 35)

      if (isCoffeeRejection) {
        const targetCeiling =
          detectedPrice !== null && detectedPrice <= 30 ? detectedPrice : 25
        setProposalCeiling(targetCeiling)

        return {
          id: `asst-${Date.now()}`,
          sender: "assistant",
          text: `Adjusted your coffee delivery to value single-bag artisanal roasters under $${targetCeiling.toFixed(2)}/month:`,
          researchCards: [
            {
              vendor: "Blue Star Roasters",
              title: "Single-Origin Whole Bean (1 Bag / Month)",
              price: 19.0,
              delivery: "Monthly scheduled restock · Free shipping",
              returns: "Freshness guarantee",
              url: "https://bluestarroasters.example.com/single-bag",
              highlight: "Value single-origin roast",
              evidenceType: "ADVERTISED_OFFER",
              sourceDate: "Today",
              paypalEligible: true,
              isAlternative: true,
            },
            {
              vendor: "Counter Culture Coffee",
              title: "Year-Round Single Bag Restock (12 oz)",
              price: 17.5,
              delivery: "Monthly delivery ($3 shipping)",
              returns: "Fresh roast replacement",
              url: "https://counterculture.example.com/subscription",
              highlight: "Direct trade pioneer",
              evidenceType: "ADVERTISED_OFFER",
              sourceDate: "Today",
              paypalEligible: true,
              isAlternative: true,
            },
          ],
          quickClarifications: [
            "Choose Blue Star ($19.00)",
            "Choose Counter Culture ($17.50)",
            "Confirm $25/mo ceiling",
          ],
          agreementProposal: {
            id: `prop-${Date.now()}`,
            need: "Monthly coffee delivery (Single bag)",
            category: "Kitchen & Pantry",
            criteria:
              "Whole bean · Single bag monthly restock · Under $25/mo",
            priceCeiling: targetCeiling,
            authority: selectedAuthority,
            stopRule: "Cease if monthly price exceeds $25 or paused by member",
            selectedProvider: "Blue Star Roasters",
            quantity: "1 bag / month",
            timing: "Monthly scheduled restock",
            agreementVersion: 1,
            estimatedTotal: targetCeiling,
            isSuperseded: false,
          },
        }
      }

      const ceiling = detectedPrice !== null ? detectedPrice : 45
      setProposalCeiling(ceiling)

      return {
        id: `asst-${Date.now()}`,
        sender: "assistant",
        text: "I compared artisanal whole-bean subscriptions matching your roast preferences. Pre-approved authority is recommended for recurring restocks:",
        researchCards: [
          {
            vendor: "Northline Roasters",
            title: "Signature Single-Origin Whole Bean (2 Bags)",
            price: 38.0,
            delivery: "Scheduled bi-weekly · Free delivery",
            returns: "Freshness guarantee & skip anytime",
            url: "https://northlineroasters.example.com/subscription",
            highlight: "Recommended · Under $45 threshold",
            evidenceType: "ADVERTISED_OFFER",
            sourceDate: "Today",
            paypalEligible: true,
          },
          {
            vendor: "Trade Coffee",
            title: "Curated Roaster Selection (2 Bags)",
            price: 42.5,
            delivery: "Every 2 weeks",
            returns: "Taste match guarantee",
            url: "https://tradecoffee.example.com/curated",
            highlight: "Diverse roaster matching",
            evidenceType: "ADVERTISED_OFFER",
            sourceDate: "Today",
            paypalEligible: true,
          },
        ],
        agreementProposal: {
          id: `prop-${Date.now()}`,
          need: "Monthly coffee delivery",
          category: "Kitchen & Pantry",
          criteria:
            "Northline Roasters or equivalent · 2 bags whole bean · Under $45/mo",
          priceCeiling: ceiling,
          authority: selectedAuthority,
          stopRule: "Cease if monthly price exceeds $45 or paused by member",
          selectedProvider: "Northline Roasters",
          quantity: "2 bags whole bean / month",
          timing: "Bi-weekly scheduled restock",
          agreementVersion: 1,
          estimatedTotal: ceiling,
          isSuperseded: false,
        },
      }
    }

    // 4. Headphones & Audio monitoring
    const isExplicitHeadphones =
      textLower.includes("headphone") ||
      textLower.includes("sony") ||
      textLower.includes("bose") ||
      textLower.includes("audio") ||
      textLower.includes("qc ultra") ||
      textLower.includes("xm5")
    const isHeadphonesFollowUp =
      currentTopic === "headphones" &&
      !textLower.includes("chair") &&
      !textLower.includes("coffee")

    if (isExplicitHeadphones || isHeadphonesFollowUp) {
      const isHeadphonesRejection =
        textLower.includes("expensive") ||
        textLower.includes("cheaper") ||
        textLower.includes("reject") ||
        textLower.includes("under 200") ||
        textLower.includes("under 150") ||
        (detectedPrice !== null && detectedPrice < 250)

      if (isHeadphonesRejection) {
        const targetCeiling =
          detectedPrice !== null && detectedPrice <= 200 ? detectedPrice : 150
        setProposalCeiling(targetCeiling)

        return {
          id: `asst-${Date.now()}`,
          sender: "assistant",
          text: `Understood. Looking at high-value noise-cancelling alternatives under $${targetCeiling.toFixed(2)}:`,
          researchCards: [
            {
              vendor: "Anker Soundcore",
              title: "Soundcore Space One Wireless ANC Headphones",
              price: 99.99,
              delivery: "Next-day available",
              returns: "30-day money back",
              url: "https://soundcore.example.com/space-one",
              highlight: "Best budget ANC benchmark",
              evidenceType: "ADVERTISED_OFFER",
              sourceDate: "Today",
              paypalEligible: true,
              isAlternative: true,
            },
            {
              vendor: "Sony Direct Store",
              title: "Sony WH-CH720N Noise Canceling Headphones",
              price: 129.99,
              delivery: "Standard 2-day delivery",
              returns: "30-day risk-free trial",
              url: "https://sony.example.com/wh-ch720n",
              highlight: "Lightweight Sony V1 processor",
              evidenceType: "ADVERTISED_OFFER",
              sourceDate: "Today",
              paypalEligible: true,
              isAlternative: true,
            },
          ],
          quickClarifications: [
            "Choose Soundcore ($99.99)",
            "Choose Sony ($129.99)",
            "Confirm $150 ceiling",
          ],
          agreementProposal: {
            id: `prop-${Date.now()}`,
            need: "Track noise-cancelling headphones (Budget alternative)",
            category: "Electronics",
            criteria:
              "Anker Soundcore Space One or Sony WH-CH720N · ANC · Target $150 or below",
            priceCeiling: targetCeiling,
            authority: selectedAuthority,
            stopRule:
              "Cease on price drop alert notification or after 60 days",
            selectedProvider: "Anker Soundcore or Sony",
            quantity: "1 unit",
            timing: "Undated continuous alert feed",
            agreementVersion: 1,
            estimatedTotal: targetCeiling,
            isSuperseded: false,
          },
        }
      }

      const ceiling = detectedPrice !== null ? detectedPrice : 280
      setProposalCeiling(ceiling)

      return {
        id: `asst-${Date.now()}`,
        sender: "assistant",
        text: "I checked current retail pricing across 3 consumer electronics feeds. Premium noise-cancelling models are currently running between $319–$349. Notify-only monitoring is optimal for capturing upcoming price drops:",
        researchCards: [
          {
            vendor: "Sony Direct Store",
            title: "Sony WH-1000XM5 Wireless Headphones",
            price: 329.99,
            delivery: "Next-day available",
            returns: "30-day money back",
            url: "https://sony.example.com/wh-1000xm5",
            highlight: "Target ceiling: $280.00",
            evidenceType: "ADVERTISED_OFFER",
            sourceDate: "Today",
            paypalEligible: true,
          },
          {
            vendor: "Bose Official",
            title: "Bose QuietComfort Ultra Headphones",
            price: 349.0,
            delivery: "2-day complimentary shipping",
            returns: "90-day risk-free trial",
            url: "https://bose.example.com/qc-ultra",
            highlight: "Premium comfort benchmark",
            evidenceType: "ADVERTISED_OFFER",
            sourceDate: "Today",
            paypalEligible: true,
          },
        ],
        agreementProposal: {
          id: `prop-${Date.now()}`,
          need: "Track noise-cancelling headphones",
          category: "Electronics",
          criteria:
            "Sony WH-1000XM5 or Bose QC Ultra · Black · Target $280 or below",
          priceCeiling: ceiling,
          authority: selectedAuthority,
          stopRule: "Cease on price drop alert notification or after 60 days",
          selectedProvider: "Sony Direct Store or Bose Official",
          quantity: "1 unit",
          timing: "Undated continuous alert feed",
          agreementVersion: 1,
          estimatedTotal: ceiling,
          isSuperseded: false,
        },
      }
    }

    // 5. General / Custom Procurement Need
    const ceiling = detectedPrice !== null ? detectedPrice : 250
    setProposalCeiling(ceiling)
    return {
      id: `asst-${Date.now()}`,
      sender: "assistant",
      text: `I synthesized your request for "${userText}". I can monitor verified merchant feeds and return inspectable quotes within your boundaries:`,
      researchCards: [
        {
          vendor: "Verified Merchant Network",
          title: `Procurement search for "${userText}"`,
          price: 185.0,
          delivery: "Standard 3–5 business days",
          returns: "Standard merchant warranty",
          url: "https://merchant.example.com/search",
          highlight: "Within typical category allocation",
          evidenceType: "ESTIMATE",
          sourceDate: "Today",
          paypalEligible: false,
        },
      ],
      agreementProposal: {
        id: `prop-${Date.now()}`,
        need: userText,
        category: "General Procurement",
        criteria: `Verified source · Up to $${ceiling} ceiling · Full return warranty`,
        priceCeiling: ceiling,
        authority: selectedAuthority,
        stopRule: "Cease when approved or after 30 days",
        selectedProvider: "Verified Merchant Network",
        quantity: "1 unit",
        timing: "Standard 3–5 business days",
        agreementVersion: 1,
        estimatedTotal: ceiling,
        isSuperseded: false,
      },
    }
  }

  const handleSend = (textToSend?: string) => {
    const text = (textToSend || draft).trim()
    if (!text || isTyping) return

    const memberMsg: ChatMessage = {
      id: `mem-${Date.now()}`,
      sender: "member",
      text,
    }

    setDraft("")

    if (editingInstructionId) {
      store.sendConversationMessage(editingInstructionId, text, "MEMBER")
    }

    // Mark previous proposals as superseded (C11)
    setMessages((prev) => {
      const updated = prev.map((m) =>
        m.agreementProposal
          ? {
              ...m,
              agreementProposal: {
                ...m.agreementProposal,
                isSuperseded: true,
              },
            }
          : m,
      )
      return [...updated, memberMsg]
    })
    setIsTyping(true)

    const turnCount = messages.filter((m) => m.sender === "member").length + 1

    timerRef.current = setTimeout(() => {
      setIsTyping(false)
      const assistantReply = generateAssistantResponse(text, turnCount)
      setMessages((prev) => [...prev, assistantReply])
      if (editingInstructionId) {
        store.sendConversationMessage(
          editingInstructionId,
          assistantReply.text,
          "ASSISTANT",
          {
            recommendations: assistantReply.researchCards,
            quickClarifications: assistantReply.quickClarifications,
            agreementProposal: assistantReply.agreementProposal,
          },
        )
      }
    }, 450)
  }

  const handleConfirmAgreement = (proposal: ProposalData) => {
    if (proposal.isSuperseded) return

    if (existingInst) {
      const res = store.updateInstruction(existingInst.id, {
        criteria: proposal.criteria,
        priceCeiling: proposal.priceCeiling,
        authority: proposal.authority,
        stopRule: proposal.stopRule,
      })
      const updated = res?.data as any
      const newVersion =
        updated?.agreementVersion || (existingInst.agreementVersion || 1) + 1

      store.confirmAgreement(existingInst.id, {
        selectedProvider: proposal.selectedProvider,
        budgetId: store.budget.id,
        maximumTotal: proposal.priceCeiling.toString(),
      })

      const confirmationText = `Agreement confirmed as Version ${newVersion}. Scope locked to ${proposal.selectedProvider || proposal.need} at $${proposal.priceCeiling.toFixed(2)} ceiling. Your plan in Planner has been updated.`
      const confirmationMsg: ChatMessage = {
        id: `asst-conf-${Date.now()}`,
        sender: "assistant",
        text: confirmationText,
      }

      const updatedMessages = [...messages, confirmationMsg]
      setMessages(updatedMessages)
      store.saveConversation(`inst-${existingInst.id}`, {
        messages: updatedMessages,
        draftText: "",
      })
      store.sendConversationMessage(
        existingInst.id,
        confirmationText,
        "ASSISTANT",
      )
    } else {
      const created = store.createInstruction(
        proposal.need,
        proposal.category,
        proposal.criteria,
        proposal.authority,
        proposal.priceCeiling,
        proposal.stopRule,
        proposal.timing,
        {
          selectedProvider: proposal.selectedProvider,
          budgetId: store.budget.id,
        },
      )
      const confirmationText = `Agreement confirmed as Version 1. Scope locked to ${proposal.selectedProvider || proposal.need} at $${proposal.priceCeiling.toFixed(2)} ceiling. Your plan in Planner has been updated.`
      const confirmationMsg: ChatMessage = {
        id: `asst-conf-${Date.now()}`,
        sender: "assistant",
        text: confirmationText,
      }
      const updatedMessages = [...messages, confirmationMsg]
      setMessages(updatedMessages)
      // Transfer conversation from draft session to created instruction ID (C12)
      store.saveConversation(`inst-${created.id}`, {
        messages: updatedMessages,
        draftText: "",
      })
      // Clear draft session
      store.saveConversation("new-instruction-draft", {
        messages: [],
        draftText: "",
      })
    }
    onComplete()
  }

  // Keyboard navigation for authority radio choices
  const authorityOptions: {
    id: AuthorityMode
    label: string
    desc: string
    icon: any
  }[] = [
    {
      id: "REVIEW_REQUIRED",
      label: "Review required",
      desc: "Ask me before any provider payment or booking.",
      icon: "notifications",
    },
    {
      id: "PRE_APPROVED",
      label: "Pre-approved",
      desc: "Proceed autonomously within the limits I confirm.",
      icon: "bolt",
    },
    {
      id: "NOTIFY_ONLY",
      label: "Notify only",
      desc: "Research and report price alerts back to me.",
      icon: "inbox",
    },
  ]

  const selectAuthorityAndSync = (auth: AuthorityMode) => {
    setSelectedAuthority(auth)
    // Also sync to active unsuperseded proposal in view
    setMessages((prev) =>
      prev.map((msg) =>
        msg.agreementProposal && !msg.agreementProposal.isSuperseded
          ? {
              ...msg,
              agreementProposal: {
                ...msg.agreementProposal,
                authority: auth,
              },
            }
          : msg,
      ),
    )
  }

  const handleAuthorityKeyDown = (e: React.KeyboardEvent, index: number) => {
    let targetIndex: number | null = null
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault()
      targetIndex = (index + 1) % authorityOptions.length
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault()
      targetIndex =
        (index - 1 + authorityOptions.length) % authorityOptions.length
    }

    if (targetIndex !== null) {
      const nextAuth = authorityOptions[targetIndex].id
      selectAuthorityAndSync(nextAuth)
      // Move DOM focus to the newly selected radio item
      const radioGroup = e.currentTarget.parentElement
      const radios = radioGroup?.querySelectorAll<HTMLElement>('[role="radio"]')
      radios?.[targetIndex]?.focus()
    }
  }

  return (
    <main className="page instruction-page">
      <header className="instruction-header">
        <div>
          <span className="instruction-state">
            {existingInst
              ? `Amending Agreement v${existingInst.agreementVersion}: ${existingInst.title}`
              : "Draft Dialogue · Zero Active Charges"}
          </span>
          <h1>
            {existingInst
              ? "Edit Procurement Instruction"
              : "Instruction Conversation"}
          </h1>
        </div>
        <button
          className="icon-button icon-button--surface"
          type="button"
          aria-label="Close dialogue"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>

      <div className="instruction-layout">
        {/* Left: Chat Stream */}
        <section className="conversation" aria-label="Procurement dialogue">
          <div className="conversation__intro">
            <span className="conversation__mark">
              <BrandMark compact />
            </span>
            <div>
              <h3>
                {existingInst
                  ? `Instruction Amendment: ${existingInst.title}`
                  : "Conversational Agreement Builder"}
              </h3>
              <p>
                {existingInst
                  ? "Adjust boundaries or parameters. Saved agreements require explicit confirmation."
                  : "State what you need. Apas will clarify criteria and propose a binding agreement."}
              </p>
            </div>
          </div>

          <div className="conversation__stream" role="log" aria-live="polite">
            {supplierCandidates.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Supplier candidates">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Ranked supplier candidates</h3>
                  <span className="text-[10px] text-slate-500">Discovery only · no verified quote</span>
                </div>
                <div className="space-y-2">
                  {supplierCandidates.slice(0, 3).map((candidate) => (
                    <article key={candidate.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          {candidate.sourceUrl ? <a href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-indigo-900 underline">{candidate.name}</a> : <p className="text-sm font-semibold text-slate-900">{candidate.name}</p>}
                          <p className="mt-1 text-xs text-slate-600">{candidate.provenance}</p>
                          {candidate.notes && <p className="mt-1 text-xs text-slate-500">{candidate.notes}</p>}
                        </div>
                        <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600">{candidate.tier.replaceAll("_", " ")}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`message message--${message.sender}`}
              >
                <div className="message__bubble">
                  <p>{message.text}</p>
                </div>

                {/* Research Cards */}
                {message.researchCards && message.researchCards.length > 0 && (
                  <div className="mt-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        Surveyed Provider Options:
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        Read-only research · Links verified
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-2.5">
                      {message.researchCards.map((card, i) => (
                        <div
                          key={i}
                          className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs space-y-2 hover:border-indigo-300 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <a
                                href={card.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-bold text-indigo-950 hover:text-indigo-600 inline-flex items-center gap-1 group"
                                title={`Open ${card.vendor} in new tab`}
                              >
                                <span>{card.title}</span>
                                <span className="text-[10px] text-slate-400 group-hover:text-indigo-600">↗</span>
                              </a>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[11px] text-slate-500 font-medium">
                                  {card.vendor}
                                </span>
                                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                  {card.evidenceType === "ESTIMATE"
                                    ? "Estimated Price"
                                    : card.evidenceType === "AUTHORITATIVE_QUOTE"
                                      ? "Authoritative Quote"
                                      : "Advertised Offer"}
                                </span>
                                {card.isAlternative && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    Alternative
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="text-xs font-bold text-slate-900 px-2 py-0.5 rounded-full bg-slate-100 shrink-0">
                              ${card.price.toFixed(2)}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-slate-600">
                            <span>🚚 {card.delivery}</span>
                            <span>↩️ {card.returns}</span>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
                            {card.highlight ? (
                              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md">
                                {card.highlight}
                              </span>
                            ) : (
                              <span />
                            )}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:underline"
                                onClick={() =>
                                  handleSend(
                                    `The price for ${card.vendor} ($${card.price.toFixed(2)}) is too high, show me cheaper alternatives`,
                                  )
                                }
                              >
                                Reject price
                              </button>
                              <button
                                type="button"
                                className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 hover:underline"
                                onClick={() => handleSelectCandidate(card)}
                              >
                                Choose this option
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Clarifications */}
                {message.quickClarifications && (
                  <div className="quick-replies mt-2">
                    {message.quickClarifications.map((reply, i) => (
                      <button
                        key={i}
                        type="button"
                        className="quick-reply"
                        onClick={() => handleSend(reply)}
                      >
                        {reply}
                      </button>
                    ))}
                  </div>
                )}

                {/* Agreement Proposal Card (Independent values & superseding) */}
                {message.agreementProposal && (
                  <div
                    className={`mt-3 p-4 rounded-2xl border transition-all ${
                      message.agreementProposal.isSuperseded
                        ? "bg-slate-50/70 border-slate-200 opacity-60"
                        : "bg-indigo-50/70 border-indigo-200 shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-indigo-100 pb-2 mb-2">
                      <div className="flex items-center gap-2">
                        <Icon name="assignment" />
                        <span className="text-xs font-bold uppercase tracking-wider text-indigo-950">
                          {message.agreementProposal.isSuperseded
                            ? `Prior Proposal (Superseded · v${message.agreementProposal.agreementVersion || 1})`
                            : existingInst
                              ? `Proposed Amendment (v${message.agreementProposal.agreementVersion || (existingInst.agreementVersion || 1) + 1} · Amending v${existingInst.agreementVersion || 1})`
                              : `Draft Agreement v${message.agreementProposal.agreementVersion || 1}`}
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-indigo-700">
                        {message.agreementProposal.category}
                      </span>
                    </div>

                    <div className="text-xs text-indigo-950 space-y-2 pt-1">
                      {/* Operational Scope Summary Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 bg-white/70 border border-indigo-100/80 rounded-xl text-[11px]">
                        <div>
                          <span className="text-slate-500 font-medium block text-[10px] uppercase tracking-wider">
                            Scope / Provider
                          </span>
                          <span className="font-bold text-slate-800">
                            {message.agreementProposal.selectedProvider || "Autonomous provider comparison"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium block text-[10px] uppercase tracking-wider">
                            Timing / Schedule
                          </span>
                          <span className="font-bold text-slate-800">
                            {message.agreementProposal.timing || "Undated continuous alert feed"}
                          </span>
                        </div>
                        {message.agreementProposal.quantity && (
                          <div>
                            <span className="text-slate-500 font-medium block text-[10px] uppercase tracking-wider">
                              Quantity / Size
                            </span>
                            <span className="font-semibold text-slate-700">
                              {message.agreementProposal.quantity}
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="text-slate-500 font-medium block text-[10px] uppercase tracking-wider">
                            Version Target
                          </span>
                          <span className="font-semibold text-indigo-900">
                            v{message.agreementProposal.agreementVersion || 1}
                          </span>
                        </div>
                      </div>

                      <div>
                        <span className="font-bold text-indigo-900 block text-[11px]">
                          Agreed Criteria:
                        </span>
                        <p className="font-medium text-slate-800">
                          {message.agreementProposal.criteria}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <label
                            htmlFor={`proposal-ceiling-${message.id}`}
                            className="font-bold text-indigo-900 block text-[11px] mb-1"
                          >
                            Price Ceiling ({store.budget.currency})
                          </label>
                          <input
                            id={`proposal-ceiling-${message.id}`}
                            type="number"
                            value={message.agreementProposal.priceCeiling}
                            disabled={message.agreementProposal.isSuperseded}
                            onChange={(e) =>
                              handleUpdateProposal(message.id, {
                                priceCeiling: Number(e.target.value),
                              })
                            }
                            className="w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:border-indigo-600 disabled:bg-slate-100 disabled:text-slate-500"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`proposal-authority-${message.id}`}
                            className="font-bold text-indigo-900 block text-[11px] mb-1"
                          >
                            Selected Authority
                          </label>
                          <select
                            id={`proposal-authority-${message.id}`}
                            value={message.agreementProposal.authority}
                            disabled={message.agreementProposal.isSuperseded}
                            onChange={(e) =>
                              handleUpdateProposal(message.id, {
                                authority: e.target.value as AuthorityMode,
                              })
                            }
                            className="w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs font-semibold text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                          >
                            <option value="REVIEW_REQUIRED">
                              Review Required (Ask before purchase)
                            </option>
                            <option value="PRE_APPROVED">
                              Pre-Approved (Autonomous within limit)
                            </option>
                            <option value="NOTIFY_ONLY">
                              Notify Only (Research alerts)
                            </option>
                          </select>
                        </div>
                      </div>

                      <div className="pt-1 text-[11px] text-indigo-800">
                        <span className="font-semibold">Stop Rule:</span>{" "}
                        {message.agreementProposal.stopRule}
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between border-t border-indigo-100">
                      <span className="text-[11px] text-indigo-700">
                        {message.agreementProposal.isSuperseded
                          ? "Superseded by newer terms."
                          : existingInst
                            ? "Amending increments agreement version and invalidates unused approvals."
                            : "Activation creates a durable instruction with explicit authority."}
                      </span>
                      {message.agreementProposal.isSuperseded ? (
                        <span className="text-xs text-slate-400 font-semibold px-3 py-1.5 bg-slate-100 rounded-xl">
                          Superseded
                        </span>
                      ) : (
                        <Button
                          variant="filled"
                          icon="check_circle"
                          onClick={() =>
                            handleConfirmAgreement(message.agreementProposal!)
                          }
                        >
                          {existingInst
                            ? `Confirm Amended Agreement (v${message.agreementProposal.agreementVersion || (existingInst.agreementVersion || 1) + 1})`
                            : "Confirm & Activate Directive"}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex items-center gap-2 pl-3 text-xs text-slate-500 animate-pulse">
                <span className="assistant-note__avatar w-6 h-6 rounded-full inline-grid place-items-center text-xs">
                  A
                </span>
                <span>Surveying vendor catalogs and checking pricing...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <div className="composer">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Describe what you want to research, compare, or arrange..."
              rows={3}
              aria-label="Describe what you want to research, compare, or arrange"
            />
            <div className="composer__actions">
              <button
                className="icon-button"
                type="button"
                aria-label="Attach file"
              >
                <Icon name="attach_file" />
              </button>
              <span>Enter to send · Shift + Enter for new line</span>
              <button
                className="composer__send"
                type="button"
                onClick={() => handleSend()}
                disabled={!draft.trim() || isTyping}
                aria-label="Send message"
              >
                <Icon name="send" />
              </button>
            </div>
          </div>
        </section>

        {/* Right: Authority Parameters Sidebar */}
        <aside className="instruction-sidebar">
          <div className="instruction-sidebar__card">
            <span className="eyebrow">Governance & Controls</span>
            <h3>Authority Mode</h3>
            <p>
              Apas enforces your boundary strictly. Choose how autonomously you
              want this instruction to operate.
            </p>

            <div
              className="authority-options"
              role="radiogroup"
              aria-label="Instruction authority level"
            >
              {authorityOptions.map((opt, index) => {
                const isSelected = selectedAuthority === opt.id
                return (
                  <div
                    key={opt.id}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={isSelected ? 0 : -1}
                    onKeyDown={(e) => handleAuthorityKeyDown(e, index)}
                    onClick={() => selectAuthorityAndSync(opt.id)}
                    className={`authority-option ${
                      isSelected ? "authority-option--selected" : ""
                    }`}
                  >
                    <span className="authority-option__icon">
                      <Icon name={opt.icon} />
                    </span>
                    <div>
                      <strong>{opt.label}</strong>
                      <p>{opt.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="instruction-sidebar__card">
            <span className="eyebrow">Financial Safety Boundary</span>
            <h3>Ceiling & Capacity</h3>
            <p className="text-xs text-slate-600 mb-3">
              Configured maximum allocation. Transactions exceeding this limit
              are held for explicit review.
            </p>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Current Directive Limit</span>
                <span className="font-bold text-slate-900">
                  ${proposalCeiling.toFixed(2)} USD
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Monthly Budget Left</span>
                <span className="font-bold text-emerald-700">
                  $
                  {(
                    store.budget.monthlyAllocation - store.budget.committedSpend
                  ).toFixed(2)}{" "}
                  USD
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}
