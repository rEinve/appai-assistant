// Appai UI Prototype Interactive Controller

function showStage(stageName) {
  // Update Controller Tabs
  document.querySelectorAll(".stage-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.stage === stageName)
  })

  // Switch Active Stage View
  const views = {
    intake: document.getElementById("view-intake"),
    agreement: document.getElementById("view-agreement"),
    activated: document.getElementById("view-activated"),
    planner: document.getElementById("view-planner"),
  }

  Object.entries(views).forEach(([name, el]) => {
    if (el) {
      if (name === stageName) {
        el.classList.remove("hidden")
        window.scrollTo({ top: 0, behavior: "smooth" })
      } else {
        el.classList.add("hidden")
      }
    }
  })
}

// 1. Controller Bar Tab Switcher
document.querySelectorAll(".stage-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const stage = btn.dataset.stage
    if (stage) showStage(stage)
  })
})

// 2. Stage 1 Vendor Selection
document.querySelectorAll(".btn-select-vendor").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation()
    document.querySelectorAll(".btn-select-vendor").forEach((b) => {
      b.classList.remove("active")
      b.innerHTML = "<span>Choose this Provider</span>"
    })
    document
      .querySelectorAll(".lead-item")
      .forEach((item) => item.classList.remove("selected"))

    btn.classList.add("active")
    btn.innerHTML =
      '<span class="material-symbols-outlined btn-icon-small">check</span><span>Selected for Booking</span>'
    btn.closest(".lead-item")?.classList.add("selected")
  })
})

// 3. Stage 1: Confirm & Save -> Transition to Stage 2 (Agreement)
document.getElementById("btn-goto-agreement")?.addEventListener("click", () => {
  showStage("agreement")
})

// 4. Stage 2: Confirm Agreement -> Reveals "Activate & Schedule" (Next Action)
const btnConfirmAgreement = document.getElementById("btn-confirm-agreement")
const settlementActionContainer = document.getElementById(
  "settlement-action-container",
)
const agreementStatusPill = document.getElementById("agreement-status-pill")

btnConfirmAgreement?.addEventListener("click", () => {
  // Update badge to green confirmed
  if (agreementStatusPill) {
    agreementStatusPill.innerHTML = `
      <span class="badge-confirmed">
        <span class="material-symbols-outlined" style="font-size: 16px;">verified</span>
        <span>Confirmed with Kisutu Commercial Centre</span>
      </span>
    `
  }

  // Replace button with the clear NEXT action: "Activate & Schedule"
  if (settlementActionContainer) {
    settlementActionContainer.innerHTML = `
      <button class="btn-primary" id="btn-activate-run" style="background: #16a34a; box-shadow: 0 4px 14px rgba(22, 163, 74, 0.3);">
        <span class="material-symbols-outlined btn-icon">bolt</span>
        <span>⚡ Activate & Schedule Execution</span>
      </button>
    `

    document
      .getElementById("btn-activate-run")
      ?.addEventListener("click", () => {
        showStage("activated")
      })
  }
})

// 5. Navigation: View in Planner / Open in Planner
document
  .getElementById("btn-view-planner")
  ?.addEventListener("click", () => showStage("planner"))
document
  .getElementById("btn-jump-planner")
  ?.addEventListener("click", () => showStage("planner"))
document
  .getElementById("nav-planner-btn")
  ?.addEventListener("click", () => showStage("planner"))

// 6. Planner: Return to Instruction Details
document
  .getElementById("btn-planner-return-instruction")
  ?.addEventListener("click", () => showStage("activated"))

// 7. Refine in Chat
document
  .getElementById("btn-refine-chat")
  ?.addEventListener("click", () => showStage("intake"))

console.log("Appai UI Prototype Sandbox loaded successfully.")
