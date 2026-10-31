import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, TimeoutError, timeout } from 'rxjs';

type AuthMode = 'sign-in' | 'sign-up';
type MemberAuthState = 'checking' | 'anonymous' | 'authenticated' | 'unavailable';
type MemberWorkspaceCategory = 'PERSONAL' | 'HOUSEHOLD' | 'WORK' | 'TRAVEL' | 'OTHER';

interface MemberCategoryChoice { id: MemberWorkspaceCategory; label: string; }
interface CalendarEntry { instructionId: string; title: string; kind: string; memberCategory: MemberWorkspaceCategory; at: string; }
interface CalendarCell { dateKey: string; day: number; inMonth: boolean; isToday: boolean; entries: CalendarEntry[]; budgetCount: number; }

const MEMBER_CATEGORIES: MemberCategoryChoice[] = [
  { id: 'PERSONAL', label: 'Personal' },
  { id: 'HOUSEHOLD', label: 'Household' },
  { id: 'WORK', label: 'Work' },
  { id: 'TRAVEL', label: 'Travel' },
  { id: 'OTHER', label: 'Other' },
];

interface MemberProfile {
  member: { id: string; name: string; email: string };
  workspace: { instructionCount: number };
}

interface MemberInstruction {
  id: string;
  promptText?: string;
  memberCategory: MemberWorkspaceCategory;
  kind: string;
  category: string | null;
  mode: string;
  state: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'EXPIRED' | 'COMPLETED';
  executionEnvironment?: 'FIXTURE' | null;
  budgetId: string | null;
  currency: string | null;
  version: number | string;
  maxTotalMinor: string | null;
  validFrom: string | null;
  validUntil: string | null;
  timezoneSnapshot: string | null;
  nextRunAt: string | null;
  structuredConstraints: { description?: string; categoryDetails?: Record<string, unknown> };
  createdAt: string;
}

interface InstructionEditor {
  budgetId: string;
  maximumTotal: string;
  validFromLocal: string;
  validUntilLocal: string;
  timezone: string;
  quantity: string;
  variant: string;
  deliveryBy: string;
  payeeName: string;
  dueAtLocal: string;
  invoiceLabel: string;
  destination: string;
  checkIn: string;
  checkOut: string;
  guests: string;
  rooms: string;
  cancellationPreference: string;
}

interface InstructionProposal {
  summary: string;
  maximumTotal: string | null;
  validFromLocal: string | null;
  validUntilLocal: string | null;
  questions: string[];
}
interface InstructionAssistantTurn { questions: string[]; reply: string; }
interface WebSearchResult { title: string; url: string; snippet: string; }
interface WebSearchResponse { source: string; fetchedAt: string; results: WebSearchResult[]; }

interface ActivationReadiness {
  canActivate: boolean;
  canActivateFixture: boolean;
  blockers: Array<{ code: string; title: string; detail: string }>;
  fixtureBlockers: Array<{ code: string; title: string; detail: string }>;
  fixtureLabel: string;
}

interface MemberActivityOperation {
  id: string;
  state: string;
  kind: string;
  category: string;
  mode: string;
  description: string;
  quoteId: string | null;
  totalMinor: string | null;
  currency: string | null;
  quoteDetails: { label?: string; fixture?: boolean } | null;
  approvalId: string | null;
  approvalStatus: string | null;
  approvalVersion: number | string | null;
  approvalExpiresAt: string | null;
  createdAt: string;
}

interface MemberNotification {
  id: string;
  type: string;
  content: { label?: string; message?: string };
  createdAt: string;
}

interface MemberObservation {
  id: string;
  instructionId: string;
  details: { fixture?: boolean; label?: string; category?: string };
  observedAt: string;
  freshnessUntil: string;
}

interface OverviewActivityItem {
  id: string;
  label: string;
  detail: string;
  createdAt: string;
  source: 'Request' | 'Notification' | 'Offer check';
  fixture: boolean;
}

interface AccountSettings {
  timezone: string;
  currency: string;
  currencyScale: number;
  version: number;
  updatedAt: string;
}

interface BudgetAllocation {
  id: string;
  name: string;
  currency: string;
  allocationLimitMinor: string;
  validFrom: string | null;
  validUntil: string | null;
  timezoneSnapshot: string | null;
  active: boolean;
  version: number;
  createdAt: string;
}

interface MemberSupplier {
  id: string;
  name: string;
  categories: string[];
  serviceAreas: string[];
  privateNotes: string | null;
  lastConfirmedUseAt: string | null;
  version: number;
}

interface CurrencyChoice {
  code: string;
  name: string;
}

interface TimezoneGroup {
  region: string;
  zones: string[];
}

const CURRENCY_CHOICES: CurrencyChoice[] = (() => {
  const fallback = ['TZS', 'USD', 'KES', 'UGX', 'RWF', 'ZAR', 'EUR', 'GBP'];
  const codes = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : fallback;
  const displayNames = new Intl.DisplayNames(undefined, { type: 'currency' });
  return [...new Set([...codes, ...fallback])].sort().map((code) => ({ code, name: displayNames.of(code) ?? code }));
})();

const TIMEZONE_GROUPS: TimezoneGroup[] = (() => {
  const fallback = ['Africa/Dar_es_Salaam', 'Africa/Nairobi', 'Africa/Kampala', 'Africa/Kigali', 'Africa/Johannesburg', 'Europe/London', 'Europe/Paris', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney', 'America/Los_Angeles', 'America/New_York', 'UTC'];
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : fallback;
  const grouped = new Map<string, string[]>();
  for (const zone of new Set([...zones, ...fallback])) {
    const slash = zone.indexOf('/');
    const region = slash < 0 ? 'Other' : zone.slice(0, slash);
    grouped.set(region, [...(grouped.get(region) ?? []), zone]);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([region, values]) => ({ region, zones: values.sort() }));
})();

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = typeof window !== 'undefined' && (window.location.protocol === 'https:' || window.location.hostname === 'appai.local') ? '' : 'http://localhost:4300';

  @ViewChild('chatThread') private chatThreadRef?: ElementRef<HTMLElement>;

  readonly dashboardOpen = signal(true);
  readonly navigationCollapsed = signal(false);
  readonly homePanel = signal<'how' | 'control' | 'needs'>('how');
  readonly dashboardView = signal<'Overview' | 'Instructions' | 'Planner' | 'Activity' | 'Account'>('Overview');
  readonly authMode = signal<AuthMode>('sign-in');
  readonly memberAuthState = signal<MemberAuthState>('checking');
  readonly memberProfile = signal<MemberProfile | null>(null);
  readonly authBusy = signal(false);
  readonly authError = signal<string | null>(null);
  readonly instructions = signal<MemberInstruction[]>([]);
  readonly instructionLoading = signal(false);
  readonly instructionSaving = signal(false);
  readonly instructionAssistantBusy = signal(false);
  readonly instructionProposal = signal<InstructionProposal | null>(null);
  readonly instructionAssistantTurns = signal<InstructionAssistantTurn[]>([]);
  readonly webSearchBusy = signal(false);
  readonly webSearchResult = signal<WebSearchResponse | null>(null);
  readonly webSearchError = signal<string | null>(null);
  readonly instructionError = signal<string | null>(null);
  readonly instructionNotice = signal<string | null>(null);
  readonly instructionChatStep = signal<'prompt' | 'category' | 'budget' | 'review'>('prompt');
  readonly instructionAreaPreselected = signal(false);
  readonly selectedInstruction = signal<MemberInstruction | null>(null);
  readonly expandedInstructionCategories = signal<Record<MemberWorkspaceCategory, boolean>>({
    PERSONAL: false, HOUSEHOLD: false, WORK: false, TRAVEL: false, OTHER: false,
  });
  readonly instructionDeleteConfirmId = signal<string | null>(null);
  readonly calendarMonth = signal('');
  readonly calendarSelectedDate = signal('');
  readonly plannerMode = signal<'day' | 'month'>('day');
  readonly instructionEditors = signal<Record<string, InstructionEditor>>({});
  readonly instructionConfigSavingId = signal<string | null>(null);
  readonly readinessReports = signal<Record<string, ActivationReadiness>>({});
  readonly readinessLoadingId = signal<string | null>(null);
  readonly fixtureActivationId = signal<string | null>(null);
  readonly activity = signal<{ operations: MemberActivityOperation[]; notifications: MemberNotification[]; observations: MemberObservation[] }>({ operations: [], notifications: [], observations: [] });
  readonly activityLoading = signal(false);
  readonly accountSettings = signal<AccountSettings | null>(null);
  readonly budgets = signal<BudgetAllocation[]>([]);
  readonly memberSuppliers = signal<MemberSupplier[]>([]);
  readonly accountLoading = signal(false);
  readonly settingsSaving = signal(false);
  readonly budgetSaving = signal(false);
  readonly budgetError = signal<string | null>(null);
  readonly budgetCreatedDate = signal('');
  readonly accountError = signal<string | null>(null);
  readonly instructionSetupError = signal<string | null>(null);
  readonly settingsConflict = signal(false);
  readonly currencyChoices = CURRENCY_CHOICES;
  readonly timezoneGroups = TIMEZONE_GROUPS;
  readonly currencyScales = Array.from({ length: 10 }, (_, scale) => scale);
  readonly memberCategories = MEMBER_CATEGORIES;

  name = '';
  email = '';
  password = '';
  inviteCode = '';
  instructionDescription = '';
  instructionComposerInput = '';
  instructionMemberCategory: MemberWorkspaceCategory = 'PERSONAL';
  instructionBudgetId = '';
  instructionMaximumTotal = '';
  instructionValidFromLocal = '';
  instructionValidUntilLocal = '';
  instructionAssistantReply = '';
  webSearchQuery = '';
  draftIdempotencyKey = '';
  settingsTimezone = '';
  settingsCurrency = '';
  settingsCurrencyScale = '';
  settingsIdempotencyKey = '';
  budgetName = '';
  budgetAmount = '';
  budgetStartDate = '';
  budgetStartTime = '';
  budgetValidUntil = '';
  budgetIdempotencyKey = '';
  privateSupplierName = '';
  privateSupplierCategories: string[] = [];
  privateSupplierAreas = '';
  privateSupplierNotes = '';
  supplierSaving = signal(false);
  supplierIdempotencyKey = '';
  readonly supplierEditId = signal<string | null>(null);
  readonly supplierEditSaving = signal(false);
  readonly supplierEditError = signal<string | null>(null);
  readonly supplierDeleteConfirmId = signal<string | null>(null);
  readonly supplierDeleteBusy = signal(false);
  supplierEditName = '';
  supplierEditCategories: string[] = [];
  supplierEditAreas = '';
  supplierEditNotes = '';
  private readonly fixtureActivationKeys: Record<string, string> = {};
  private readonly fixtureDecisionKeys: Record<string, string> = {};
  private readonly lifecycleKeys: Record<string, string> = {};

  ngOnInit(): void {
    void this.openWorkspace();
  }

  async openWorkspace(): Promise<void> {
    this.dashboardOpen.set(true);
    this.dashboardView.set('Overview');
    this.authError.set(null);
    this.memberAuthState.set('checking');
    await this.loadMember();
  }

  closeWorkspace(): void {
    this.dashboardOpen.set(false);
    this.authError.set(null);
  }

  async openInstructions(): Promise<void> {
    this.dashboardView.set('Instructions');
    this.instructionError.set(null);
    await this.loadInstructions();
  }

  async startNewInstruction(category?: MemberWorkspaceCategory): Promise<void> {
    await this.openInstructions();
    this.selectedInstruction.set(null);
    this.instructionDescription = '';
    this.instructionComposerInput = '';
    this.instructionProposal.set(null);
    this.instructionAssistantTurns.set([]);
    this.instructionAssistantReply = '';
    this.clearWebSearch();
    this.instructionMaximumTotal = '';
    this.instructionValidFromLocal = '';
    this.instructionValidUntilLocal = '';
    this.instructionBudgetId = '';
    this.instructionMemberCategory = category ?? 'PERSONAL';
    this.instructionAreaPreselected.set(category !== undefined);
    this.instructionChatStep.set('prompt');
    this.instructionNotice.set(null);
    this.instructionDeleteConfirmId.set(null);
  }

  advanceInstructionChat(step: 'prompt' | 'category' | 'budget' | 'review'): void {
    this.instructionChatStep.set(step);
  }

  submitInstructionPrompt(): void {
    this.advanceInstructionChat(this.instructionAreaPreselected() ? 'budget' : 'category');
  }

  get composerPlaceholder(): string {
    if (this.instructionProposal()?.questions && this.instructionProposal()!.questions.length > 0) {
      return 'Answer the assistant’s questions or add details… (Press Enter to send)';
    }
    if (!this.instructionDescription) {
      return this.selectedInstruction()
        ? 'Type details to refine this instruction… (Press Enter to send)'
        : 'For example: Find me a quiet place to stay in Arusha next month. (Press Enter to send)';
    }
    return 'Add details or instructions… (Press Enter to send)';
  }

  onComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (event.isComposing || event.keyCode === 229) {
        return;
      }
      this.sendInstructionMessage();
    }
  }

  sendInstructionMessage(): void {
    const text = this.instructionComposerInput.trim();
    if (!text || this.instructionAssistantBusy()) return;

    this.instructionComposerInput = '';

    if (this.instructionProposal()?.questions && this.instructionProposal()!.questions.length > 0) {
      this.instructionAssistantReply = text;
      void this.refineInstructionWithAssistant().then(() => this.scrollChatToBottom());
      return;
    }

    if (!this.instructionDescription || this.instructionChatStep() === 'prompt') {
      this.instructionDescription = text;
      this.submitInstructionPrompt();
      this.scrollChatToBottom();
      return;
    }

    this.instructionAssistantReply = text;
    void this.refineInstructionWithAssistant().then(() => this.scrollChatToBottom());
  }

  askAssistantFromComposer(): void {
    const text = this.instructionComposerInput.trim();
    if (text) {
      if (!this.instructionDescription) {
        this.instructionDescription = text;
      } else {
        this.instructionAssistantReply = text;
      }
      this.instructionComposerInput = '';
    }
    void this.refineInstructionWithAssistant().then(() => this.scrollChatToBottom());
  }

  editCurrentWording(): void {
    this.instructionComposerInput = this.instructionDescription;
    this.advanceInstructionChat('prompt');
    setTimeout(() => {
      const el = document.getElementById('instruction-composer-input');
      if (el) el.focus();
    }, 50);
  }

  scrollChatToBottom(): void {
    setTimeout(() => {
      if (this.chatThreadRef?.nativeElement) {
        this.chatThreadRef.nativeElement.scrollTop = this.chatThreadRef.nativeElement.scrollHeight;
      }
    }, 60);
  }

  clearWebSearch(): void {
    this.webSearchQuery = '';
    this.webSearchResult.set(null);
    this.webSearchError.set(null);
  }

  async searchWeb(): Promise<void> {
    const query = this.webSearchQuery.trim();
    if (this.webSearchBusy() || query.length < 3) return;
    this.webSearchBusy.set(true);
    this.webSearchResult.set(null);
    this.webSearchError.set(null);
    try {
      const result = await firstValueFrom(this.http.post<WebSearchResponse>(
        `${this.apiBaseUrl}/api/v1/discovery/search`, { query }, { withCredentials: true },
      ).pipe(timeout(15_000)));
      if (this.webSearchQuery.trim() === query) this.webSearchResult.set(result);
    } catch (error) {
      this.webSearchError.set(this.errorMessage(error, 'Live search is unavailable. Please try again later.'));
    } finally {
      this.webSearchBusy.set(false);
    }
  }

  async refineInstructionWithAssistant(): Promise<void> {
    if (this.instructionAssistantBusy() || this.instructionDescription.trim().length < 3) return;
    this.instructionAssistantBusy.set(true);
    this.instructionError.set(null);
    try {
      const requestedDescription = this.instructionDescription;
      const requestedInstructionId = this.selectedInstruction()?.id ?? null;
      const reply = this.instructionAssistantReply.trim();
      const previousProposal = this.instructionProposal();
      const result = await firstValueFrom(this.http.post<{ proposal: InstructionProposal }>(
        `${this.apiBaseUrl}/api/v1/assistant/refine`, {
          description: this.instructionDescription,
          clarifications: reply ? [...this.instructionAssistantTurns(), { questions: previousProposal?.questions ?? [], reply }] : this.instructionAssistantTurns(),
        }, { withCredentials: true },
      ).pipe(timeout(25_000)));
      if (this.instructionDescription !== requestedDescription || (this.selectedInstruction()?.id ?? null) !== requestedInstructionId) return;
      const proposal = result.proposal;
      if (reply) this.instructionAssistantTurns.update((turns) => [...turns, { questions: previousProposal?.questions ?? [], reply }].slice(-6));
      this.instructionAssistantReply = '';
      this.instructionProposal.set(proposal);
      this.instructionMaximumTotal = proposal.maximumTotal ?? '';
      this.instructionValidFromLocal = proposal.validFromLocal ?? '';
      this.instructionValidUntilLocal = proposal.validUntilLocal ?? '';
      const selected = this.selectedInstruction();
      if (selected) {
        const editor = this.instructionEditors()[selected.id] ?? this.editorFor(selected);
        this.instructionEditors.update((editors) => ({ ...editors, [selected.id]: {
          ...editor,
          maximumTotal: this.instructionMaximumTotal,
          validFromLocal: this.instructionValidFromLocal,
          validUntilLocal: this.instructionValidUntilLocal,
        } }));
      }
    } catch (error) {
      this.instructionError.set(this.errorMessage(error, 'AI suggestions are unavailable. Continue with the guided setup.'));
    } finally {
      this.instructionAssistantBusy.set(false);
    }
  }

  updateAssistantProposalField(field: 'maximumTotal' | 'validFromLocal' | 'validUntilLocal', value: string): void {
    if (field === 'maximumTotal') this.instructionMaximumTotal = value;
    if (field === 'validFromLocal') this.instructionValidFromLocal = value;
    if (field === 'validUntilLocal') this.instructionValidUntilLocal = value;
    const selected = this.selectedInstruction();
    if (!selected) return;
    const editor = this.instructionEditors()[selected.id] ?? this.editorFor(selected);
    this.instructionEditors.update((editors) => ({ ...editors, [selected.id]: {
      ...editor,
      maximumTotal: this.instructionMaximumTotal,
      validFromLocal: this.instructionValidFromLocal,
      validUntilLocal: this.instructionValidUntilLocal,
    } }));
  }

  clearAssistantProposal(): void {
    const hadProposal = this.instructionProposal() !== null;
    this.instructionProposal.set(null);
    this.instructionAssistantTurns.set([]);
    this.instructionAssistantReply = '';
    const selected = this.selectedInstruction();
    if (selected) {
      const editor = hadProposal ? this.editorFor(selected) : (this.instructionEditors()[selected.id] ?? this.editorFor(selected));
      if (hadProposal) this.instructionEditors.update((editors) => ({ ...editors, [selected.id]: editor }));
      this.instructionMaximumTotal = editor.maximumTotal;
      this.instructionValidFromLocal = editor.validFromLocal;
      this.instructionValidUntilLocal = editor.validUntilLocal;
      return;
    }
    this.instructionMaximumTotal = '';
    this.instructionValidFromLocal = '';
    this.instructionValidUntilLocal = '';
  }

  chooseInstructionBudget(budgetId: string): void {
    this.instructionBudgetId = budgetId;
    const selected = this.selectedInstruction();
    if (selected?.state === 'DRAFT' && (selected.budgetId ?? '') !== budgetId) this.updateInstructionEditor(selected.id, 'budgetId', budgetId);
    this.advanceInstructionChat('review');
  }

  memberCategoryLabel(category: string): string {
    return MEMBER_CATEGORIES.find((choice) => choice.id === category)?.label ?? 'Other';
  }

  recentInstructions(): MemberInstruction[] {
    return this.instructions().filter((item) => item.state !== 'CANCELLED').slice(0, 4);
  }

  instructionsForCategory(category: MemberWorkspaceCategory): MemberInstruction[] {
    return this.instructions()
      .filter((item) => item.state !== 'CANCELLED' && item.memberCategory === category)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  toggleInstructionCategory(category: MemberWorkspaceCategory): void {
    this.expandedInstructionCategories.update((expanded) => ({ ...expanded, [category]: !expanded[category] }));
  }

  toggleNavigation(): void {
    this.navigationCollapsed.update((collapsed) => !collapsed);
  }

  selectInstruction(instruction: MemberInstruction): void {
    this.selectedInstruction.set(instruction);
    this.instructionAreaPreselected.set(false);
    this.instructionDescription = instruction.promptText ?? instruction.structuredConstraints.description ?? '';
    this.instructionComposerInput = '';
    this.instructionProposal.set(null);
    this.instructionAssistantTurns.set([]);
    this.instructionAssistantReply = '';
    this.clearWebSearch();
    this.instructionMemberCategory = instruction.memberCategory;
    this.instructionBudgetId = instruction.budgetId ?? '';
    this.instructionChatStep.set('prompt');
    this.instructionNotice.set(null);
    this.instructionDeleteConfirmId.set(null);
    this.instructionError.set(null);
  }

  requestDiscardInstruction(instruction: MemberInstruction): void {
    this.instructionDeleteConfirmId.set(instruction.id);
  }

  async discardInstruction(instruction: MemberInstruction): Promise<void> {
    await this.changeInstructionLifecycle(instruction, 'revoke');
    if (!this.instructionError()) {
      this.selectedInstruction.set(null);
      this.instructionDeleteConfirmId.set(null);
      this.instructionDescription = '';
      this.instructionComposerInput = '';
      this.instructionChatStep.set('prompt');
      this.instructionNotice.set(instruction.state === 'DRAFT'
        ? 'Draft removed from your list. Its audit record is retained.'
        : 'Instruction revoked. Its audit record is retained.');
    }
  }

  selectedInstructionBudget(): BudgetAllocation | undefined {
    return this.budgets().find((budget) => budget.id === this.instructionBudgetId);
  }

  minorUnitsToDisplay(minor: string, currency: string | null): string {
    const scale = this.accountSettings()?.currencyScale ?? 0;
    const amount = BigInt(minor);
    const base = 10n ** BigInt(scale);
    const whole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(amount / base);
    const fraction = scale ? (amount % base).toString().padStart(scale, '0') : '';
    const decimal = new Intl.NumberFormat().formatToParts(1.1).find((part) => part.type === 'decimal')?.value ?? '.';
    return `${currency?.trim() ?? ''} ${whole}${scale ? decimal + fraction : ''}`.trim();
  }

  calendarDateKeyForToday(): string {
    return this.calendarDateKey(new Date());
  }

  async openPlanner(): Promise<void> {
    this.dashboardView.set('Planner');
    this.instructionError.set(null);
    if (!this.calendarMonth()) {
      const today = this.calendarDateKey(new Date());
      this.calendarSelectedDate.set(today);
      this.calendarMonth.set(today.slice(0, 7));
    }
    if (!this.instructions().length) await this.loadInstructions();
  }

  shiftCalendarMonth(offset: number): void {
    const [year, month] = this.calendarMonth().split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1 + offset, 15, 12));
    this.calendarMonth.set(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`);
  }

  shiftPlannerDate(offset: number): void {
    const [year, month, day] = this.calendarSelectedDate().split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + offset, 12));
    const key = next.toISOString().slice(0, 10);
    this.calendarSelectedDate.set(key);
    this.calendarMonth.set(key.slice(0, 7));
  }

  goToPlannerToday(): void {
    const today = this.calendarDateKeyForToday();
    this.calendarSelectedDate.set(today);
    this.calendarMonth.set(today.slice(0, 7));
  }

  showPlannerDay(dateKey = this.calendarSelectedDate()): void {
    this.calendarSelectedDate.set(dateKey);
    this.calendarMonth.set(dateKey.slice(0, 7));
    this.plannerMode.set('day');
  }

  calendarMonthLabel(): string {
    const [year, month] = this.calendarMonth().split('-').map(Number);
    return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 15, 12)));
  }

  calendarDays(): CalendarCell[] {
    if (!this.calendarMonth()) return [];
    const [year, month] = this.calendarMonth().split('-').map(Number);
    const first = new Date(Date.UTC(year, month - 1, 1, 12));
    const start = new Date(Date.UTC(year, month - 1, 1 - first.getUTCDay(), 12));
    const entries = new Map<string, CalendarEntry[]>();
    for (const instruction of this.instructions()) {
      const addAt = (value: string | null, kind: string) => {
        if (!value) return;
        const item: CalendarEntry = { instructionId: instruction.id, title: instruction.promptText || instruction.structuredConstraints.description || 'Saved instruction', kind, memberCategory: instruction.memberCategory, at: value };
        const dateKey = this.calendarDateKey(new Date(value));
        entries.set(dateKey, [...(entries.get(dateKey) ?? []), item]);
      };
      addAt(instruction.validFrom, 'Window starts');
      addAt(instruction.validUntil, 'Deadline');
      addAt(instruction.nextRunAt, 'Scheduled');
    }
    const today = this.calendarDateKey(new Date());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start.getTime() + index * 86_400_000);
      const dateKey = date.toISOString().slice(0, 10);
      return { dateKey, day: date.getUTCDate(), inMonth: date.getUTCMonth() === month - 1, isToday: dateKey === today, entries: entries.get(dateKey) ?? [], budgetCount: this.budgetsForDate(dateKey).length };
    });
  }

  calendarSelectedEntries(): CalendarEntry[] {
    return (this.calendarDays().find((day) => day.dateKey === this.calendarSelectedDate())?.entries ?? [])
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }

  budgetsForDate(dateKey: string): BudgetAllocation[] {
    return this.budgets().filter((budget) => this.calendarDateKey(new Date(budget.createdAt)) === dateKey)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  openBudgetDialog(dialog: HTMLDialogElement): void {
    if (!this.budgetName && !this.budgetAmount) {
      this.budgetStartDate = this.calendarSelectedDate();
      this.budgetStartTime = '';
    }
    this.budgetError.set(null);
    dialog.showModal();
  }

  closeBudgetDialog(dialog: HTMLDialogElement, event?: Event): void {
    event?.preventDefault();
    if (!this.budgetSaving()) dialog.close();
  }

  showBudgetCreationDay(): void {
    this.showPlannerDay(this.budgetCreatedDate());
  }

  plannerTime(value: string): string {
    if (!value) return 'Date only';
    return new Intl.DateTimeFormat(undefined, { timeZone: this.accountSettings()?.timezone ?? 'UTC', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
  }

  calendarDateLabel(dateKey: string): string {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(year, month - 1, day, 12)));
  }

  historyDate(value: string): string {
    const timezone = this.accountSettings()?.timezone ?? 'UTC';
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone, dateStyle: 'medium', timeStyle: 'short',
    }).format(new Date(value));
  }

  historyAmount(operation: MemberActivityOperation): string {
    if (!operation.totalMinor || !operation.currency) return 'No quoted amount';
    return this.minorUnitsToDisplay(operation.totalMinor, operation.currency);
  }

  historyPaymentStatus(operation: MemberActivityOperation): string {
    return operation.state.startsWith('FIXTURE_')
      ? 'No payment made · local fixture'
      : 'Payment confirmation unavailable';
  }

  overviewBudgetLimit(): string {
    const activeBudgets = this.budgets().filter((budget) => budget.active);
    if (!activeBudgets.length) return 'No active budgets';
    const currencies = new Set(activeBudgets.map((budget) => budget.currency.trim()));
    if (currencies.size !== 1) return 'Multiple currencies';
    const totalMinor = activeBudgets.reduce((sum, budget) => sum + BigInt(budget.allocationLimitMinor), 0n);
    return this.minorUnitsToDisplay(totalMinor.toString(), activeBudgets[0].currency);
  }

  activeBudgetCount(): number {
    return this.budgets().filter((budget) => budget.active).length;
  }

  hasActiveBudgets(): boolean {
    return this.activeBudgetCount() > 0;
  }

  greetingPeriod(): string {
    const hour = Number(new Intl.DateTimeFormat('en', { hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
    return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  }

  overviewDraftCount(): number {
    return this.instructions().filter((instruction) => instruction.state === 'DRAFT').length;
  }

  overviewActiveCount(): number {
    return this.instructions().filter((instruction) => instruction.state === 'ACTIVE').length;
  }

  overviewInstructionItems(): MemberInstruction[] {
    return this.instructions()
      .filter((instruction) => instruction.state !== 'CANCELLED')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3);
  }

  overviewPendingReviewCount(): number {
    return this.activity().operations.filter((operation) => operation.approvalStatus === 'PENDING').length;
  }

  overviewAttentionCount(): number {
    return Number(!this.accountSettings()) + Number(!this.hasActiveBudgets())
      + this.overviewDraftCount() + this.overviewPendingReviewCount();
  }

  overviewUpcomingInstructions(): MemberInstruction[] {
    return this.instructions()
      .filter((instruction) => instruction.state === 'ACTIVE' && instruction.nextRunAt)
      .sort((a, b) => new Date(a.nextRunAt!).getTime() - new Date(b.nextRunAt!).getTime())
      .slice(0, 3);
  }

  overviewRecentActivity(): OverviewActivityItem[] {
    const operations: OverviewActivityItem[] = this.activity().operations.map((operation) => ({
      id: `operation-${operation.id}`,
      label: operation.description || `${operation.kind} request`,
      detail: operation.state.replaceAll('_', ' '),
      createdAt: operation.createdAt,
      source: 'Request',
      fixture: operation.state.startsWith('FIXTURE_'),
    }));
    const notifications: OverviewActivityItem[] = this.activity().notifications.map((notification) => ({
      id: `notification-${notification.id}`,
      label: notification.content.label ?? notification.type.replaceAll('_', ' '),
      detail: notification.content.message ?? 'Account notification',
      createdAt: notification.createdAt,
      source: 'Notification',
      fixture: notification.type.startsWith('FIXTURE_'),
    }));
    const observations: OverviewActivityItem[] = this.activity().observations.map((observation) => ({
      id: `observation-${observation.id}`,
      label: observation.details.label ?? 'Offer check',
      detail: observation.details.category ?? 'Instruction watch',
      createdAt: observation.observedAt,
      source: 'Offer check',
      fixture: observation.details.fixture === true,
    }));
    return [...operations, ...notifications, ...observations]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }

  private calendarDateKey(date: Date): string {
    const timezone = this.accountSettings()?.timezone ?? 'UTC';
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date).map((part) => [part.type, part.value]));
    return `${parts['year']}-${parts['month']}-${parts['day']}`;
  }

  async openAccount(): Promise<void> {
    this.dashboardView.set('Account');
    this.accountLoading.set(true);
    this.accountError.set(null);
    this.settingsConflict.set(false);
    try {
      const [settingsResult, budgetsResult, suppliersResult] = await Promise.all([
        firstValueFrom(this.http.get<{ settings: AccountSettings | null }>(`${this.apiBaseUrl}/api/v1/settings`, { withCredentials: true })),
        firstValueFrom(this.http.get<{ budgets: BudgetAllocation[] }>(`${this.apiBaseUrl}/api/v1/budgets`, { withCredentials: true })),
        firstValueFrom(this.http.get<{ mySuppliers: MemberSupplier[] }>(`${this.apiBaseUrl}/api/v1/suppliers`, { withCredentials: true })),
      ]);
      this.accountSettings.set(settingsResult.settings);
      this.settingsTimezone = settingsResult.settings?.timezone ?? '';
      this.settingsCurrency = settingsResult.settings?.currency.trim() ?? '';
      this.settingsCurrencyScale = settingsResult.settings ? String(settingsResult.settings.currencyScale) : '';
      this.budgets.set(budgetsResult.budgets);
      this.memberSuppliers.set(suppliersResult.mySuppliers);
    } catch (error) {
      this.accountError.set(this.errorMessage(error, 'Account settings could not be loaded.'));
    } finally {
      this.accountLoading.set(false);
    }
  }

  async openActivity(): Promise<void> {
    this.dashboardView.set('Activity');
    await this.loadActivity();
  }

  async saveAccountSettings(): Promise<void> {
    if (this.settingsSaving()) return;
    this.settingsSaving.set(true);
    this.accountError.set(null);
    const payload = {
      timezone: this.settingsTimezone.trim(),
      currency: this.settingsCurrency.trim().toUpperCase(),
      currencyScale: Number(this.settingsCurrencyScale),
    };
    try {
      let saved: AccountSettings;
      if (this.accountSettings()) {
        const version = this.accountSettings()!.version;
        const result = await firstValueFrom(this.http.patch<{ settings: AccountSettings }>(
          `${this.apiBaseUrl}/api/v1/settings`, payload,
          { withCredentials: true, headers: { 'If-Match': `"${version}"` } },
        ).pipe(timeout({ first: 15_000 })));
        saved = result.settings;
      } else {
        if (!this.settingsIdempotencyKey) this.settingsIdempotencyKey = globalThis.crypto.randomUUID();
        const result = await firstValueFrom(this.http.post<{ settings: AccountSettings }>(
          `${this.apiBaseUrl}/api/v1/settings`, payload,
          { withCredentials: true, headers: { 'Idempotency-Key': this.settingsIdempotencyKey } },
        ).pipe(timeout({ first: 15_000 })));
        saved = result.settings;
        this.settingsIdempotencyKey = '';
      }
      this.accountSettings.set(saved);
      this.settingsTimezone = saved.timezone;
      this.settingsCurrency = saved.currency.trim();
      this.settingsCurrencyScale = String(saved.currencyScale);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 412) {
        this.settingsConflict.set(true);
        this.accountError.set('These settings changed after this page loaded. Reload the latest saved values before editing again.');
      } else {
        this.accountError.set(this.errorMessage(error, 'Account settings could not be saved.'));
      }
    } finally {
      this.settingsSaving.set(false);
    }
  }

  onSettingsCurrencyChange(currency: string): void {
    this.settingsCurrency = currency;
    this.settingsIdempotencyKey = '';
    try {
      this.settingsCurrencyScale = String(new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits);
    } catch {
      this.settingsCurrencyScale = '2';
    }
  }

  timezoneLabel(timezone: string): string {
    return timezone.includes('/') ? timezone.slice(timezone.indexOf('/') + 1).replaceAll('_', ' ') : timezone;
  }

  async createBudgetAllocation(dialog: HTMLDialogElement): Promise<void> {
    if (this.budgetSaving() || !this.accountSettings()) return;
    if (Boolean(this.budgetStartDate) !== Boolean(this.budgetStartTime)) {
      this.budgetError.set('Choose both a start date and time, or clear both to leave the start open.');
      return;
    }
    this.budgetSaving.set(true);
    this.budgetError.set(null);
    if (!this.budgetIdempotencyKey) this.budgetIdempotencyKey = globalThis.crypto.randomUUID();
    try {
      const result = await firstValueFrom(this.http.post<{ budget: BudgetAllocation }>(
        `${this.apiBaseUrl}/api/v1/budgets`,
        { name: this.budgetName.trim(), allocationLimit: this.budgetAmount.trim(), validFromLocal: this.budgetStartDate ? `${this.budgetStartDate}T${this.budgetStartTime}` : '', validUntilLocal: this.budgetValidUntil },
        { withCredentials: true, headers: { 'Idempotency-Key': this.budgetIdempotencyKey } },
      ));
      this.budgets.update((items) => [result.budget, ...items.filter((budget) => budget.id !== result.budget.id)]);
      this.budgetCreatedDate.set(this.calendarDateKey(new Date(result.budget.createdAt)));
      this.budgetName = '';
      this.budgetAmount = '';
      this.budgetStartDate = '';
      this.budgetStartTime = '';
      this.budgetValidUntil = '';
      this.budgetIdempotencyKey = '';
      dialog.close();
    } catch (error) {
      this.budgetError.set(this.errorMessage(error, 'Budget allocation could not be created.'));
    } finally {
      this.budgetSaving.set(false);
    }
  }

  togglePrivateSupplierCategory(category: string, checked: boolean): void {
    this.privateSupplierCategories = checked
      ? [...new Set([...this.privateSupplierCategories, category])]
      : this.privateSupplierCategories.filter((item) => item !== category);
    this.supplierIdempotencyKey = '';
  }

  async addPrivateSupplier(): Promise<void> {
    if (this.supplierSaving() || !this.privateSupplierName.trim() || !this.privateSupplierCategories.length) return;
    this.supplierSaving.set(true);
    if (!this.supplierIdempotencyKey) this.supplierIdempotencyKey = globalThis.crypto.randomUUID();
    try {
      await firstValueFrom(this.http.post<{ supplier: MemberSupplier }>(`${this.apiBaseUrl}/api/v1/member-suppliers`, {
        name: this.privateSupplierName.trim(),
        categories: this.privateSupplierCategories,
        serviceAreas: this.privateSupplierAreas.split(',').map((area) => area.trim()).filter(Boolean),
        privateNotes: this.privateSupplierNotes.trim(),
      }, { withCredentials: true, headers: { 'Idempotency-Key': this.supplierIdempotencyKey } }));
      this.privateSupplierName = '';
      this.privateSupplierCategories = [];
      this.privateSupplierAreas = '';
      this.privateSupplierNotes = '';
      this.supplierIdempotencyKey = '';
      await this.openAccount();
    } catch (error) {
      this.accountError.set(this.errorMessage(error, 'The private supplier could not be saved. Try again.'));
    } finally { this.supplierSaving.set(false); }
  }

  supplierCategoryLabel(category: string): string {
    return ({ PRODUCT: 'Products', BILL: 'Bills and services', ACCOMMODATION: 'Accommodation' } as Record<string, string>)[category] ?? category;
  }

  supplierCategorySummary(categories: string[]): string {
    return categories.map((category) => this.supplierCategoryLabel(category)).join(' · ');
  }

  editPrivateSupplier(supplier: MemberSupplier): void {
    this.supplierEditId.set(supplier.id);
    this.supplierDeleteConfirmId.set(null);
    this.supplierEditName = supplier.name;
    this.supplierEditCategories = [...supplier.categories];
    this.supplierEditAreas = supplier.serviceAreas.join(', ');
    this.supplierEditNotes = supplier.privateNotes ?? '';
    this.supplierEditError.set(null);
  }

  togglePrivateSupplierEditCategory(category: string, checked: boolean): void {
    this.supplierEditCategories = checked
      ? [...new Set([...this.supplierEditCategories, category])]
      : this.supplierEditCategories.filter((item) => item !== category);
  }

  cancelPrivateSupplierEdit(): void {
    this.supplierEditId.set(null);
    this.supplierEditError.set(null);
  }

  async savePrivateSupplierEdit(supplier: MemberSupplier): Promise<void> {
    if (this.supplierEditSaving() || this.supplierEditId() !== supplier.id
        || !this.supplierEditName.trim() || !this.supplierEditCategories.length) return;
    this.supplierEditSaving.set(true);
    this.supplierEditError.set(null);
    try {
      await firstValueFrom(this.http.patch<{ supplier: MemberSupplier }>(`${this.apiBaseUrl}/api/v1/member-suppliers/${supplier.id}`, {
        name: this.supplierEditName.trim(), categories: this.supplierEditCategories,
        serviceAreas: this.supplierEditAreas.split(',').map((area) => area.trim()).filter(Boolean),
        privateNotes: this.supplierEditNotes.trim(),
      }, {
        withCredentials: true, headers: { 'If-Match': `"${supplier.version}"` },
      }));
      this.supplierEditId.set(null);
      await this.openAccount();
    } catch (error) {
      this.supplierEditError.set(this.errorMessage(error, 'Supplier details could not be saved. Reload the list and try again.'));
    } finally { this.supplierEditSaving.set(false); }
  }

  requestDeletePrivateSupplier(supplier: MemberSupplier): void {
    this.supplierEditId.set(null);
    this.supplierEditError.set(null);
    this.supplierDeleteConfirmId.set(supplier.id);
  }

  async deletePrivateSupplier(supplier: MemberSupplier): Promise<void> {
    if (this.supplierDeleteBusy() || this.supplierDeleteConfirmId() !== supplier.id) return;
    this.supplierDeleteBusy.set(true);
    this.accountError.set(null);
    try {
      await firstValueFrom(this.http.delete(`${this.apiBaseUrl}/api/v1/member-suppliers/${supplier.id}`, {
        withCredentials: true, headers: { 'If-Match': `"${supplier.version}"` },
      }));
      this.supplierDeleteConfirmId.set(null);
      await this.openAccount();
    } catch (error) {
      this.accountError.set(this.errorMessage(error, 'Supplier could not be removed. Reload the list and try again.'));
    } finally { this.supplierDeleteBusy.set(false); }
  }

  formatAllocationAmount(budget: BudgetAllocation): string {
    const amount = BigInt(budget.allocationLimitMinor);
    const scale = this.accountSettings()?.currencyScale ?? 0;
    const base = 10n ** BigInt(scale);
    const whole = amount / base;
    const fraction = (amount % base).toString().padStart(scale, '0');
    const wholeText = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(whole);
    const decimal = new Intl.NumberFormat().formatToParts(1.1).find((part) => part.type === 'decimal')?.value ?? '.';
    return `${budget.currency.trim()} ${wholeText}${scale > 0 ? decimal + fraction : ''}`;
  }

  budgetDatesLabel(budget: BudgetAllocation): string {
    if (!budget.validFrom && !budget.validUntil) return '';
    const timezone = budget.timezoneSnapshot ?? this.accountSettings()?.timezone ?? 'UTC';
    const format = (value: string | null) => value
      ? new Intl.DateTimeFormat(undefined, { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
      : '';
    if (budget.validFrom && budget.validUntil) return `${format(budget.validFrom)} to ${format(budget.validUntil)}`;
    return budget.validUntil ? `Until ${format(budget.validUntil)}` : `From ${format(budget.validFrom)}`;
  }

  budgetLabel(budgetId: string): string {
    return this.budgets().find((budget) => budget.id === budgetId)?.name ?? 'Unavailable allocation';
  }

  async checkActivationReadiness(instructionId: string): Promise<void> {
    this.readinessLoadingId.set(instructionId);
    this.instructionError.set(null);
    try {
      const report = await firstValueFrom(this.http.get<ActivationReadiness>(
        `${this.apiBaseUrl}/api/v1/instructions/${instructionId}/readiness`,
        { withCredentials: true },
      ));
      this.readinessReports.update((reports) => ({ ...reports, [instructionId]: report }));
    } catch (error) {
      this.instructionError.set(this.errorMessage(error, 'Activation requirements could not be checked.'));
    } finally {
      this.readinessLoadingId.set(null);
    }
  }

  async activateFixture(instruction: MemberInstruction): Promise<void> {
    const instructionId = instruction.id;
    if (this.fixtureActivationId()) return;
    this.fixtureActivationId.set(instructionId);
    this.instructionError.set(null);
    this.fixtureActivationKeys[instructionId] ||= globalThis.crypto.randomUUID();
    try {
      await firstValueFrom(this.http.post(
        `${this.apiBaseUrl}/api/v1/instructions/${instructionId}/activate-fixture`, {},
        { withCredentials: true, headers: { 'Idempotency-Key': this.fixtureActivationKeys[instructionId], 'If-Match': `"${instruction.version}"` } },
      ).pipe(timeout({ first: 15_000 })));
      delete this.fixtureActivationKeys[instructionId];
      await this.loadInstructions();
      await this.loadActivity();
    } catch (error) {
      this.instructionError.set(this.errorMessage(error, 'The fixture instruction could not be activated. Review the readiness blockers and try again.'));
    } finally {
      this.fixtureActivationId.set(null);
    }
  }

  async decideFixtureApproval(operation: MemberActivityOperation, decision: 'APPROVE' | 'REJECT'): Promise<void> {
    const approvalId = operation.approvalId;
    if (!approvalId || operation.approvalStatus !== 'PENDING' || this.fixtureActivationId()) return;
    this.fixtureActivationId.set(approvalId);
    this.instructionError.set(null);
    this.fixtureDecisionKeys[approvalId] ||= globalThis.crypto.randomUUID();
    try {
      await firstValueFrom(this.http.post(
        `${this.apiBaseUrl}/api/v1/approvals/${approvalId}/fixture-decision`, { decision },
        { withCredentials: true, headers: { 'Idempotency-Key': this.fixtureDecisionKeys[approvalId], 'If-Match': `"${operation.approvalVersion}"` } },
      ).pipe(timeout({ first: 15_000 })));
      delete this.fixtureDecisionKeys[approvalId];
      await this.loadActivity();
    } catch (error) {
      this.instructionError.set(this.errorMessage(error, 'Your fixture review could not be saved. Reload Activity before trying again.'));
    } finally {
      this.fixtureActivationId.set(null);
    }
  }

  async changeInstructionLifecycle(instruction: MemberInstruction, action: 'pause' | 'resume' | 'revoke'): Promise<void> {
    const keyId = `${instruction.id}:${action}`;
    if (this.fixtureActivationId()) return;
    this.fixtureActivationId.set(keyId);
    this.instructionError.set(null);
    this.lifecycleKeys[keyId] ||= globalThis.crypto.randomUUID();
    try {
      await firstValueFrom(this.http.post(
        `${this.apiBaseUrl}/api/v1/instructions/${instruction.id}/${action}`, {},
        { withCredentials: true, headers: { 'Idempotency-Key': this.lifecycleKeys[keyId], 'If-Match': `"${instruction.version}"` } },
      ).pipe(timeout({ first: 15_000 })));
      delete this.lifecycleKeys[keyId];
      await this.loadInstructions();
      await this.loadActivity();
    } catch (error) {
      this.instructionError.set(this.errorMessage(error, `The instruction could not be ${action}d. Reload it and try again.`));
    } finally {
      this.fixtureActivationId.set(null);
    }
  }

  async saveInstructionDraft(): Promise<void> {
    if (this.instructionSaving()) return;
    this.instructionSaving.set(true);
    this.instructionError.set(null);
    this.instructionNotice.set(null);
    try {
      const selected = this.selectedInstruction();
      if (selected) {
        if (selected.state !== 'DRAFT') throw new Error('Only saved drafts can be edited.');
        const editor = this.instructionEditors()[selected.id] ?? this.editorFor(selected);
        const result = await firstValueFrom(this.http.patch<{ instruction: MemberInstruction }>(
          `${this.apiBaseUrl}/api/v1/instructions/${selected.id}/configuration`,
          {
            description: this.instructionDescription,
            memberCategory: this.instructionMemberCategory,
            budgetId: this.instructionBudgetId || null,
            maximumTotal: editor.maximumTotal,
            validFromLocal: editor.validFromLocal,
            validUntilLocal: editor.validUntilLocal,
            timezone: editor.timezone || this.accountSettings()?.timezone || 'UTC',
          },
          { withCredentials: true, headers: { 'If-Match': `"${selected.version}"` } },
        ));
        this.instructions.update((items) => items.map((item) => item.id === selected.id ? result.instruction : item));
        this.selectedInstruction.set(result.instruction);
        this.instructionEditors.update((editors) => ({ ...editors, [selected.id]: this.editorFor(result.instruction) }));
        this.instructionDescription = result.instruction.promptText ?? this.instructionDescription;
        this.instructionChatStep.set('prompt');
        this.instructionNotice.set('Draft updated. It still needs review before activation.');
        return;
      }
      if (!this.draftIdempotencyKey) this.draftIdempotencyKey = globalThis.crypto.randomUUID();
      const result = await firstValueFrom(this.http.post<{ instruction: MemberInstruction }>(
        `${this.apiBaseUrl}/api/v1/instructions`,
        {
          description: this.instructionDescription,
          memberCategory: this.instructionMemberCategory,
          budgetId: this.instructionBudgetId || null,
          maximumTotal: this.instructionMaximumTotal.trim(),
          validFromLocal: this.instructionValidFromLocal,
          validUntilLocal: this.instructionValidUntilLocal,
        },
        { withCredentials: true, headers: { 'Idempotency-Key': this.draftIdempotencyKey } },
      ));
      this.instructions.update((items) => [result.instruction, ...items]);
      this.memberProfile.update((profile) => profile
        ? { ...profile, workspace: { ...profile.workspace, instructionCount: profile.workspace.instructionCount + 1 } }
        : profile);
      this.instructionDescription = '';
      this.instructionComposerInput = '';
      this.instructionBudgetId = '';
      this.clearAssistantProposal();
      this.draftIdempotencyKey = '';
      this.selectedInstruction.set(null);
      this.instructionChatStep.set('prompt');
      this.instructionNotice.set('Instruction saved as a draft. Select it from Recent to keep editing.');
      this.dashboardView.set('Instructions');
      await this.loadInstructions();
    } catch (error) {
      this.instructionError.set(this.errorMessage(error, 'We could not save this draft. Please try again.'));
    } finally {
      this.instructionSaving.set(false);
    }
  }

  async submitMemberAuth(): Promise<void> {
    if (this.authBusy()) return;
    this.authBusy.set(true);
    this.authError.set(null);
    const signingUp = this.authMode() === 'sign-up';
    const route = signingUp ? 'sign-up' : 'sign-in';
    const payload = signingUp
      ? { name: this.name.trim(), email: this.email.trim(), password: this.password, inviteCode: this.inviteCode.trim() }
      : { email: this.email.trim(), password: this.password };
    try {
      await firstValueFrom(this.http.post(`${this.apiBaseUrl}/api/auth/${route}/email`, payload, { withCredentials: true }));
      this.password = '';
      this.inviteCode = '';
      await this.loadMember();
    } catch (error) {
      this.memberAuthState.set('anonymous');
      this.authError.set(this.errorMessage(error, signingUp ? 'We could not create your account.' : 'We could not sign you in. Check your details and try again.'));
    } finally {
      this.authBusy.set(false);
    }
  }

  async signOut(): Promise<void> {
    this.authBusy.set(true);
    try {
      await firstValueFrom(this.http.post(`${this.apiBaseUrl}/api/auth/sign-out`, {}, { withCredentials: true }));
      this.memberProfile.set(null);
      this.memberAuthState.set('anonymous');
      this.dashboardOpen.set(false);
      this.password = '';
    } catch (error) {
      this.authError.set(this.errorMessage(error, 'Sign-out could not be confirmed. Your session may still be active; try again when the service is available.'));
    } finally {
      this.authBusy.set(false);
    }
  }

  setAuthMode(mode: AuthMode): void {
    this.authMode.set(mode);
    this.authError.set(null);
    this.password = '';
  }

  private async loadMember(): Promise<void> {
    try {
      const profile = await firstValueFrom(this.http.get<MemberProfile>(`${this.apiBaseUrl}/api/v1/me`, { withCredentials: true }));
      this.memberProfile.set(profile);
      this.memberAuthState.set('authenticated');
      await this.loadInstructions();
    } catch (error) {
      this.memberProfile.set(null);
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.memberAuthState.set('anonymous');
      } else {
        this.memberAuthState.set('unavailable');
        this.authError.set(this.errorMessage(error, 'Member access is unavailable. Start the configured local API and database, then try again.'));
      }
    }
  }

  private async loadInstructions(): Promise<void> {
    this.instructionLoading.set(true);
    this.instructionError.set(null);
    this.instructionSetupError.set(null);
    try {
      const [instructionsResult, budgetsResult, settingsResult] = await Promise.allSettled([
        firstValueFrom(this.http.get<{ instructions: MemberInstruction[] }>(`${this.apiBaseUrl}/api/v1/instructions`, { withCredentials: true })),
        firstValueFrom(this.http.get<{ budgets: BudgetAllocation[] }>(`${this.apiBaseUrl}/api/v1/budgets`, { withCredentials: true })),
        firstValueFrom(this.http.get<{ settings: AccountSettings | null }>(`${this.apiBaseUrl}/api/v1/settings`, { withCredentials: true })),
      ]);
      const setupErrors: string[] = [];
      if (instructionsResult.status === 'fulfilled') {
        const instructions = [...instructionsResult.value.instructions]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        this.instructions.set(instructions);
      } else {
        this.instructionError.set(this.errorMessage(instructionsResult.reason, 'Your saved instructions could not be loaded.'));
      }
      if (budgetsResult.status === 'fulfilled') this.budgets.set(budgetsResult.value.budgets);
      else setupErrors.push(this.errorMessage(budgetsResult.reason, 'Budget allocations could not be loaded.'));
      if (settingsResult.status === 'fulfilled') this.accountSettings.set(settingsResult.value.settings);
      else setupErrors.push(this.errorMessage(settingsResult.reason, 'Account settings could not be loaded.'));
      if (instructionsResult.status === 'fulfilled') {
        this.instructionEditors.set(Object.fromEntries(this.instructions().map((instruction) => [instruction.id, this.editorFor(instruction)])));
      }
      if (setupErrors.length) this.instructionSetupError.set(setupErrors.join(' '));
      void this.loadActivity();
    } finally {
      this.instructionLoading.set(false);
    }
  }

  private async loadActivity(): Promise<void> {
    this.activityLoading.set(true);
    try {
      const result = await firstValueFrom(this.http.get<{ operations: MemberActivityOperation[]; notifications: MemberNotification[]; observations: MemberObservation[] }>(
        `${this.apiBaseUrl}/api/v1/activity`, { withCredentials: true },
      ));
      this.activity.set(result);
    } catch (error) {
      this.instructionError.set(this.errorMessage(error, 'Your history could not be loaded.'));
    } finally {
      this.activityLoading.set(false);
    }
  }

  updateInstructionEditor(instructionId: string, key: keyof InstructionEditor, value: string | number | null): void {
    const current = this.instructionEditors()[instructionId];
    if (!current) return;
    const normalized = value === null ? '' : String(value);
    if (key === 'budgetId' && normalized) {
      const budget = this.budgets().find((item) => item.id === normalized);
      if (budget) {
        const scale = this.accountSettings()?.currencyScale ?? 0;
        const timezone = budget.timezoneSnapshot ?? this.accountSettings()?.timezone ?? current.timezone;
        this.instructionEditors.update((editors) => ({
          ...editors,
          [instructionId]: {
            ...current,
            budgetId: normalized,
            maximumTotal: this.minorUnitsToDecimal(budget.allocationLimitMinor, scale),
            validFromLocal: budget.validFrom ? this.localDateTimeFor(budget.validFrom, timezone) : current.validFromLocal,
            validUntilLocal: budget.validUntil ? this.localDateTimeFor(budget.validUntil, timezone) : current.validUntilLocal,
            timezone,
          },
        }));
        return;
      }
    }
    this.instructionEditors.update((editors) => ({
      ...editors,
      [instructionId]: { ...current, [key]: normalized },
    }));
  }

  async saveInstructionConfiguration(instruction: MemberInstruction): Promise<void> {
    if (this.instructionConfigSavingId()) return;
    const editor = this.instructionEditors()[instruction.id];
    if (!editor) return;
    this.instructionConfigSavingId.set(instruction.id);
    this.instructionError.set(null);
    try {
      const result = await firstValueFrom(this.http.patch<{ instruction: MemberInstruction }>(
        `${this.apiBaseUrl}/api/v1/instructions/${instruction.id}/configuration`,
        {
          budgetId: editor.budgetId || null,
          maximumTotal: editor.maximumTotal.trim(),
          validFromLocal: editor.validFromLocal,
          validUntilLocal: editor.validUntilLocal,
          timezone: editor.timezone,
        },
        { withCredentials: true, headers: { 'If-Match': `"${instruction.version}"` } },
      ));
      this.instructions.update((items) => items.map((item) => item.id === instruction.id ? result.instruction : item));
      this.instructionEditors.update((editors) => ({ ...editors, [instruction.id]: this.editorFor(result.instruction) }));
      this.readinessReports.update((reports) => { const next = { ...reports }; delete next[instruction.id]; return next; });
    } catch (error) {
      this.instructionError.set(this.errorMessage(error, 'The instruction setup could not be saved. Check the dates and category details, then try again.'));
    } finally {
      this.instructionConfigSavingId.set(null);
    }
  }

  private editorFor(instruction: MemberInstruction): InstructionEditor {
    const details = instruction.structuredConstraints.categoryDetails ?? {};
    const text = (key: string) => {
      const value = details[key];
      return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
    };
    const timezone = instruction.timezoneSnapshot ?? this.accountSettings()?.timezone ?? '';
    const scale = this.accountSettings()?.currencyScale ?? 2;
    return {
      budgetId: instruction.budgetId ?? '',
      maximumTotal: instruction.maxTotalMinor ? this.minorUnitsToDecimal(instruction.maxTotalMinor, scale) : '',
      validFromLocal: this.localDateTimeFor(instruction.validFrom, timezone),
      validUntilLocal: this.localDateTimeFor(instruction.validUntil, timezone),
      timezone,
      quantity: text('quantity'),
      variant: text('variant'),
      deliveryBy: text('deliveryBy'),
      payeeName: text('payeeName'),
      dueAtLocal: text('dueAtLocal'),
      invoiceLabel: text('invoiceLabel'),
      destination: text('destination'),
      checkIn: text('checkIn'),
      checkOut: text('checkOut'),
      guests: text('guests'),
      rooms: text('rooms'),
      cancellationPreference: text('cancellationPreference') || 'FLEXIBLE',
    };
  }

  private minorUnitsToDecimal(minorText: string, scale: number): string {
    const minor = BigInt(minorText);
    if (scale === 0) return minor.toString();
    const base = 10n ** BigInt(scale);
    return `${minor / base}.${(minor % base).toString().padStart(scale, '0')}`;
  }

  private localDateTimeFor(instant: string | null, timezone: string): string {
    if (!instant || !timezone) return '';
    try {
      const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return `${values['year']}-${values['month']}-${values['day']}T${values['hour']}:${values['minute']}`;
    } catch {
      return '';
    }
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof TimeoutError) return 'The API did not respond within 15 seconds. Check that the local API and PostgreSQL are running, then try again.';
    if (error instanceof HttpErrorResponse) {
      const message = error.error as { message?: string; code?: string } | null;
      if (message?.code === 'AUTH_UNAVAILABLE') return 'Sign-in is not configured. Start the local API with its database and authentication settings.';
      if (message?.message) return message.message;
    }
    return fallback;
  }
}
