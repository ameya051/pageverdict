export type ScanSeverity = "critical" | "warning" | "info";

export type ScanStep =
  | "collecting"
  | "analyzing"
  | "synthesizing"
  | "saving"
  | "done"
  | string;

export type AuditCategory =
  | "performance"
  | "copy"
  | "seo"
  | "tech_health"
  | string;

export interface ScanRequest {
  url: string;
}

export interface ScanProgress {
  step: ScanStep;
  message: string;
  progress: number;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  severity: ScanSeverity;
  impact: string;
  recommendation: string;
}

export interface AuditSection {
  category: AuditCategory;
  name: string;
  score: number;
  max_score: number;
  issues: Issue[];
  strengths: string[];
  summary: string;
}

export interface ScanMetadata {
  page_title: string | null;
  page_description: string | null;
  favicon_url: string | null;
  technologies: string[];
  scan_duration_ms: number | null;
}

export interface ScanResult {
  id: string;
  url: string;
  screenshot_url: string;
  overall_score: number;
  sections: AuditSection[];
  roast_summary: string;
  metadata: ScanMetadata | null;
  created_at: string;
}

export interface ApiErrorShape {
  message: string;
  status: number;
  detail?: string;
  raw?: unknown;
}
