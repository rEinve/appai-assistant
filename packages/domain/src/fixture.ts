import type { InstructionDraft } from './index';

export const REVIEW_REQUIRED_ACCOMMODATION: InstructionDraft = {
  id: '7e3d9b4e-47d0-4e46-8f83-2b1b5e0ce041',
  ownerId: '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d',
  kind: 'WATCH',
  category: 'ACCOMMODATION',
  mode: 'REVIEW_REQUIRED',
  constraints: {
    propertyRef: 'fixture:kibo-house', roomRef: 'fixture:standard-room', rateRef: 'fixture:flexible',
    checkIn: '2027-06-19', checkOut: '2027-06-23', guests: 2, rooms: 1,
    cancellationTerms: 'Free cancellation until 2027-06-18T09:00:00Z',
  },
  allowedPayees: ['fixture:kibo-house'],
  maxTotalMinor: '120000000',
  currency: 'TZS',
  budgetId: '2a4d6f80-1b3c-4e5f-9a7b-8c0d1e2f3a4b',
  fundingMandateId: '5b3a2f1e-0d8c-4b9a-9f4e-3c1b0a9d8e7f',
  validFrom: '2027-01-01T00:00:00Z',
  validUntil: '2027-06-19T00:00:00Z',
  timezone: 'Africa/Dar_es_Salaam',
  completionLimit: 1,
};
