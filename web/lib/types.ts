export type Evidence = { status: string; detail: string; source_url?: string };
export type Qualification = {
  reviewed_at: string; verdict: 'priority' | 'needs_confirmation' | 'secondary' | 'not_a_fit';
  summary: string; pay: Evidence; c2c: Evidence; location: Evidence; client: Evidence;
  contact?: { name?: string; email?: string; email_name?: string; url?: string; detail: string };
  next_steps: string[]; sources: { title: string; url: string }[];
};
export type Contact = { email: string; kind: 'hiring' | 'unverified' | 'accessibility_only'; detail: string };
export type Lead = {
  location_assessment?: {status:string; restrictions:string[]; evidence:string[]; source_url:string; assessed_at:string};
  email_origin?: {excerpt?:string; sender:string; subject:string; received_at:string; message_id:string; gmail_url:string};
  id: string; title: string; company_agency: string; source: string; source_job_id: string;
  source_posted_at: string; source_date_text: string; first_seen: string; pay: string;
  hourly_min_usd: number | ''; contract_status: string; c2c_status: string; duration: string;
  remote_location: string; work_arrangement: string; work_abroad_restrictions: string;
  geography: string; application_url: string; source_url: string; fit_tier: string; fit_reason: string;
  pipeline: string; direct_client_classification: string; direct_client_evidence: string;
  official_employer_url: string; contacts: Contact[]; qualification?: Qualification; review_score: number;
};
export type Snapshot = {
  generated_at: string; collected_at: string; leads: Lead[];
  summary: { budget?: {daily_cap_usd:number; monthly_cap_usd:number; reserved_usd:number; remaining_usd:number; cycle:{startAt:string;endAt:string};paced_daily_allowance:number}; new_remote_contracts: number; secondary: number; published_project_needs: number; raw: number; duplicates: number; target: number; source_coverage: { source: string; status: string; raw: number; retained?: number; saved_count?: number; last_success_at?: string; last_attempt_detail?: string; next_check_at?: string; detail?: string }[] };
};
export const STAGES = ['new', 'saved', 'ready', 'contacted', 'applying', 'applied', 'not_a_fit'] as const;
export type Stage = typeof STAGES[number];
export type ApplicationEvent = { id: string; kind: 'opened' | 'submitted' | 'cancelled'; recorded_at: string; url: string; evidence: 'link_opened' | 'user_reported' };
export type LeadProgress = { stage: Stage; notes: string; updated_at: string; disposition?: {status:'closed'|'deleted';recorded_at:string}; application?: { first_opened_at?: string; last_opened_at?: string; submission_recorded_at?: string; previous_stage?: Stage }; events?: ApplicationEvent[]; outreach?: { id: string; recipient: string; subject: string; provider_id: string; accepted_at: string }[] };
export type Profile = { name: string; pitch: string; portfolio: string; resume_name?: string; resume_type?: string };
export type DashboardData = { collection?: {status:string;mode:string;trigger:string;run_url:string;started_at:string;finished_at?:string|null;last_completed_at?:string}; snapshot: Snapshot; workflow: Record<string, LeadProgress>; version: string | null; profile: Profile; profileVersion: string | null; email: { configured: boolean; from: string; recipient: string; last_digest?: string; digest_count?: number } };
