import { useState, useEffect, useRef } from "react"
import { Icon, Button } from "../common/CommonUI"
import type { VendorOffer } from "../../types/appai"

function OfferReviewModalContent({
  offer,
  onClose,
  onApprove,
  onReject,
  onRequestFreshQuote,
}: {
  offer: VendorOffer
  onClose: () => void
  onApprove: (offerId: string) => void
  onReject: (offerId: string, reason: string) => void
  onRequestFreshQuote?: (offerId: string) => void
}) {
  const isExpired = offer.status === "EXPIRED"
  const isRejected = offer.status === "REJECTED"
  const isApproved = offer.status === "APPROVED"

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showRejectPrompt, setShowRejectPrompt] = useState(false)
  const [rejectReason, setRejectReason] = useState(
    "Price higher than preference",
  )
  const modalRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    openerRef.current = (document.activeElement as HTMLElement)
    closeButtonRef.current?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()

      if (e.key === "Tab" && modalRef.current) {
        const focusables = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]):not([aria-hidden="true"]), [href]:not([aria-hidden="true"]), input:not([disabled]):not([type="hidden"]):not([aria-hidden="true"]), select:not([disabled]):not([aria-hidden="true"]), textarea:not([disabled]):not([aria-hidden="true"]), [tabindex]:not([tabindex="-1"]):not([aria-hidden="true"])',
          ),
        )
        if (focusables.length === 0) return

        const first = focusables[0]
        const last = focusables[focusables.length - 1]

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      if (timerRef.current) clearTimeout(timerRef.current)
      if (openerRef.current && typeof openerRef.current.focus === "function") {
        openerRef.current.focus()
      }
    }
  }, [onClose])

  const handleApprove = () => {
    if (isExpired || isRejected) return
    setIsSubmitting(true)
    timerRef.current = setTimeout(() => {
      setIsSubmitting(false)
      onApprove(offer.id)
    }, 400)
  }

  const handleRejectConfirm = () => {
    setIsSubmitting(true)
    timerRef.current = setTimeout(() => {
      setIsSubmitting(false)
      setShowRejectPrompt(false)
      onReject(offer.id, rejectReason)
      onClose()
    }, 300)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="offer-review-title"
    >
      <div
        ref={modalRef}
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="px-6 py-5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-blue-100 text-blue-900 flex items-center justify-center">
              <Icon name="verified_user" />
            </span>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Vendor Verified Offer · {offer.vendor}
              </span>
              <h2
                id="offer-review-title"
                className="text-lg font-bold text-slate-900 mt-0.5"
              >
                {offer.itemTitle}
              </h2>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center transition-colors"
            onClick={onClose}
            aria-label="Close modal"
          >
            <Icon name="close" />
          </button>
        </header>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Status Banners */}
          {isExpired && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <Icon name="schedule" />
                <span>
                  <strong>Price Hold Elapsed:</strong> The vendor quote has
                  expired or was invalidated. Request a fresh quote to re-verify
                  inventory and price.
                </span>
              </div>
            </div>
          )}

          {isRejected && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2 text-xs text-rose-900">
              <Icon name="warning" />
              <span>
                <strong>Offer Declined:</strong> This offer was declined. APPAI
                will continue tracking other sources within your criteria.
              </span>
            </div>
          )}

          {isApproved && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-xs text-emerald-900">
              <Icon name="check_circle" />
              <span>
                <strong>Offer Approved:</strong> Ready for checkout settlement
                on PayPal sandbox rail.
              </span>
            </div>
          )}

          {/* Pricing Breakdown Card */}
          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Verified Price Breakdown
            </h3>
            <div className="space-y-1.5 text-xs text-slate-700">
              <div className="flex justify-between">
                <span>Item Subtotal ({offer.vendor})</span>
                <span className="font-semibold">
                  ${offer.itemPrice.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Estimated Shipping</span>
                <span className="font-semibold text-emerald-700">
                  {offer.shippingCost === 0
                    ? "FREE"
                    : `$${offer.shippingCost.toFixed(2)}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Estimated Taxes & Fees</span>
                <span className="font-semibold">
                  ${offer.taxAmount.toFixed(2)}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline">
                <span className="font-bold text-slate-900 text-sm">
                  Payable Total
                </span>
                <span className="text-lg font-bold text-slate-900">
                  ${offer.payableTotal.toFixed(2)}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    {offer.currency}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Specifications Checklist */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              Matched Specifications & Verification
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
              {offer.specs.map((spec, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-50/50 border border-slate-100"
                >
                  <span className="text-emerald-700 mt-0.5">
                    <Icon name="check_circle" />
                  </span>
                  <span>{spec}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Policies & Essential Terms */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                <Icon name="local_shipping" />
                <span>Delivery Window</span>
              </div>
              <p className="text-slate-600">{offer.deliveryWindow}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                <Icon name="assignment" />
                <span>Return Policy</span>
              </div>
              <p className="text-slate-600">{offer.returnPolicy}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                <Icon name="schedule" />
                <span>Price Hold</span>
              </div>
              <p className="text-slate-600">{offer.expiresIn}</p>
            </div>
          </div>

          {/* Terms notice */}
          <p className="text-[11px] text-slate-600 leading-relaxed bg-blue-50/50 p-3 rounded-xl border border-blue-100">
            <strong>Governance Guarantee:</strong> Approving this offer will
            advance you to the single-action payment confirmation screen. No
            funds will be captured until you explicitly confirm on the PayPal
            Sandbox rail. Free returns within 30 days.
          </p>
        </div>

        {/* Footer Actions */}
        {showRejectPrompt ? (
          <footer className="px-6 py-4 border-t border-slate-200 bg-slate-50/90 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label
                htmlFor="reject-reason"
                className="text-xs font-bold text-slate-700 shrink-0"
              >
                Decline reason:
              </label>
              <select
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 focus:outline-hidden"
              >
                <option value="Price higher than preference">
                  Price higher than preference
                </option>
                <option value="Delivery window too late">
                  Delivery window too late
                </option>
                <option value="Looking for different color/model">
                  Looking for different color/model
                </option>
                <option value="No longer needed">No longer needed</option>
              </select>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button
                variant="tonal"
                onClick={() => setShowRejectPrompt(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="filled"
                onClick={handleRejectConfirm}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Declining..." : "Confirm Decline"}
              </Button>
            </div>
          </footer>
        ) : (
          <footer className="px-6 py-4 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between">
            {!isRejected ? (
              <Button
                variant="text"
                onClick={() => setShowRejectPrompt(true)}
                disabled={isSubmitting}
              >
                Reject offer
              </Button>
            ) : (
              <span className="text-xs text-slate-400">Offer declined</span>
            )}
            <div className="flex items-center gap-2">
              <Button variant="tonal" onClick={onClose} disabled={isSubmitting}>
                Close
              </Button>
              {isExpired ? (
                <Button
                  variant="filled"
                  icon="replay"
                  onClick={() => {
                    setIsSubmitting(true)
                    timerRef.current = setTimeout(() => {
                      setIsSubmitting(false)
                      onRequestFreshQuote?.(offer.id)
                    }, 400)
                  }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Refreshing price..." : "Request fresh quote"}
                </Button>
              ) : isRejected ? null : (
                <Button
                  variant="filled"
                  icon="arrow_forward"
                  onClick={handleApprove}
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? "Advancing..."
                    : "Approve & proceed to payment"}
                </Button>
              )}
            </div>
          </footer>
        )}
      </div>
    </div>
  )
}

export function OfferReviewModal(props: {
  offer?: VendorOffer | null
  isOpen: boolean
  onClose: () => void
  onApprove: (offerId: string) => void
  onReject: (offerId: string, reason: string) => void
  onRequestFreshQuote?: (offerId: string) => void
}) {
  if (!props.isOpen || !props.offer) return null
  return <OfferReviewModalContent {...props} offer={props.offer} />
}
