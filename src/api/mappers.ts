import type {
  Instruction,
  AuthorityMode,
  InstructionStatus,
  InstructionTimelineStep,
} from "../types/appai"
import type { ApiInstruction } from "./client"

export function mapApiInstructionToDomain(apiInst: ApiInstruction): Instruction {
  const constraints = apiInst.structuredConstraints || {}
  const title =
    constraints.title ||
    apiInst.promptText?.slice(0, 50) ||
    "Procurement instruction"
  const criteria =
    constraints.directive ||
    constraints.requirements ||
    apiInst.promptText ||
    "Standard procurement criteria"

  // Map mode to AuthorityMode
  let authority: AuthorityMode = "REVIEW_REQUIRED"
  if (apiInst.mode === "PRE_APPROVED") authority = "PRE_APPROVED"
  else if (apiInst.mode === "NOTIFY_ONLY") authority = "NOTIFY_ONLY"

  // Map state to InstructionStatus
  let status: InstructionStatus = "ACTIVE"
  if (apiInst.state === "PAUSED") status = "PAUSED"
  else if (apiInst.state === "CANCELLED" || apiInst.state === "COMPLETED")
    status = "REVOKED"

  const priceCeiling = apiInst.maxTotalMinor
    ? Number(apiInst.maxTotalMinor) / 100
    : 450

  const version = typeof apiInst.version === "number" ? apiInst.version : 1

  const timeline: InstructionTimelineStep[] = [
    {
      title: "Instruction initiated",
      subtitle: new Date(apiInst.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      state: "done",
    },
    {
      title: "Market research",
      subtitle: "Scouting verified merchant options",
      state: status === "ACTIVE" ? "current" : "pending",
    },
    {
      title: "Order execution",
      subtitle:
        authority === "PRE_APPROVED"
          ? "Autonomous checkout under threshold"
          : "Explicit member review required",
      state: "pending",
    },
  ]

  let categoryIcon = "inventory_2"
  if (apiInst.category?.toLowerCase().includes("home") || apiInst.category?.toLowerCase().includes("chair")) {
    categoryIcon = "chair"
  } else if (apiInst.category?.toLowerCase().includes("coffee") || apiInst.category?.toLowerCase().includes("food")) {
    categoryIcon = "coffee"
  } else if (apiInst.category?.toLowerCase().includes("travel") || apiInst.category?.toLowerCase().includes("stay")) {
    categoryIcon = "hotel"
  }

  return {
    id: apiInst.id,
    title,
    category: apiInst.category || "General Procurement",
    categoryIcon,
    status,
    authority,
    priceCeiling,
    currency: apiInst.currency || "USD",
    criteria,
    nextRunAt: apiInst.nextRunAt,
    timezoneSnapshot: apiInst.timezoneSnapshot,
    nextRun: apiInst.nextRunAt
      ? new Date(apiInst.nextRunAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "Undated (Continuous alert feed)",
    lastCheck: "Recent",
    currentOperation:
      status === "ACTIVE"
        ? "Monitoring active merchant listings"
        : status === "PAUSED"
          ? "Execution paused by member"
          : "Instruction authority revoked",
    stopRule: "Cease when approved or after 30 days",
    assistantNote: "Bound to verified member agreement in PostgreSQL.",
    timeline,
    agreementVersion: version,
  }
}
