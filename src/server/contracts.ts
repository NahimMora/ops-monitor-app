/**
 * Zod contracts for everything the agent sends. These are the ground
 * truth for the wire format — agent/monitor_agent/* dataclasses mirror
 * these shapes by convention, not by codegen (two different languages),
 * so keep both sides in sync by hand when either changes.
 */

import { z } from "zod";

export const ProjectStatusSchema = z.enum([
  "HEALTHY",
  "RUNNING",
  "IDLE",
  "DEGRADED",
  "STUCK",
  "FAILED",
  "STOPPED",
  "OFFLINE",
  "UNREACHABLE",
  "UNKNOWN",
]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const HeartbeatSchema = z.object({
  agent_id: z.string().min(1),
  hostname: z.string().min(1),
  sent_at: z.string(),
  offline_buffer_pending: z.number().int().nonnegative(),
  project_health: z.record(
    z.string(),
    z.object({
      status: ProjectStatusSchema,
      reason: z.string().nullable(),
      heartbeat_age_seconds: z.number().nullable(),
    })
  ),
});
export type HeartbeatPayload = z.infer<typeof HeartbeatSchema>;

export const MachineSnapshotSchema = z.object({
  hostname: z.string(),
  os_version: z.string(),
  boot_time_iso: z.string(),
  uptime_seconds: z.number(),
  cpu_percent: z.number(),
  ram_total_mb: z.number().int(),
  ram_used_mb: z.number().int(),
  ram_free_mb: z.number().int(),
  disk_total_mb: z.number().int(),
  disk_used_mb: z.number().int(),
  disk_free_mb: z.number().int(),
  chrome_process_count: z.number().int(),
  chrome_memory_mb: z.number().int(),
  local_time_iso: z.string(),
});

export const MachineTelemetrySchema = z.object({
  agent_id: z.string().min(1),
  machine: MachineSnapshotSchema,
});

export const SchedulerTaskStateSchema = z.object({
  task_name: z.string(),
  enabled: z.boolean(),
  state: z.string(),
  last_run_at: z.string().nullable(),
  last_run_result: z.string().nullable(),
  next_run_at: z.string().nullable(),
});

export const SessionStatusSchema = z.object({
  session_type: z.string(),
  status: z.enum(["authenticated", "expired", "challenge", "browser_error", "unknown"]),
  checked_at: z.string(),
  reason: z.string().nullable().optional(),
});

export const ProjectTelemetrySchema = z.object({
  agent_id: z.string().min(1),
  project_slug: z.string().min(1),
  scheduler_state: z.array(SchedulerTaskStateSchema),
  sessions: z.array(SessionStatusSchema),
});

export const TelemetrySchema = z.union([MachineTelemetrySchema, ProjectTelemetrySchema]);

export const LogEventSchema = z.object({
  project_slug: z.string().min(1),
  occurred_at: z.string(),
  level: z.enum(["DEBUG", "INFO", "WARNING", "ERROR"]),
  source: z.string(),
  message: z.string().max(8000),
  dedupe_key: z.string(),
  // Best-effort correlation to the run that was active when this line was
  // tailed (the agent picks the RUNNING run, else the most recently
  // started one, from the same get_runs() call it already makes this
  // cycle — see agent/monitor_agent/main.py). Resolved server-side to
  // Run.id via the (projectId, externalRunId) unique constraint. Absent
  // for projects with no discrete runs (e.g. HolaSalta Manager) or if no
  // run has started yet.
  run_external_id: z.string().nullable().optional(),
});

export const EventsBatchSchema = z.object({
  agent_id: z.string().min(1),
  events: z.array(LogEventSchema).max(1000),
});

export const RunStageSchema = z.object({
  name: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  status: z.string(),
  items_total: z.number().nullable().optional(),
  items_success: z.number().nullable().optional(),
  items_failed: z.number().nullable().optional(),
  duration_seconds: z.number().nullable().optional(),
  error_summary: z.string().nullable().optional(),
  channel: z.string().nullable().optional(),
  started_at: z.string().nullable().optional(),
  finished_at: z.string().nullable().optional(),
});

export const RunRecordSchema = z.object({
  external_run_id: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  status: z.string(),
  trigger: z.string().nullable(),
  items_total: z.number().nullable(),
  items_success: z.number().nullable(),
  items_failed: z.number().nullable(),
  current_stage: z.string().nullable(),
  error_count: z.number().int(),
  warning_count: z.number().int(),
  stages: z.array(RunStageSchema),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const RunsPayloadSchema = z.object({
  agent_id: z.string().min(1),
  project_slug: z.string().min(1),
  runs: z.array(RunRecordSchema).max(50),
});

export const CommandResultSchema = z.object({
  ok: z.boolean(),
  result: z.record(z.string(), z.unknown()).optional(),
  exit_code: z.number().int().nullable().optional(),
  error: z.string().nullable().optional(),
  finished_at: z.string(),
});

export const CreateCommandSchema = z.object({
  project_slug: z.string().min(1),
  type: z.enum(["START", "STOP", "RESTART", "RUN_NOW", "PAUSE_SCHEDULE", "RESUME_SCHEDULE"]),
});
