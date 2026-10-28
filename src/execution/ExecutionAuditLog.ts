import type { AuditEvent, LifecycleState } from "./types.js";

export class ExecutionAuditLog {
  private events: AuditEvent[] = [];
  private static instance: ExecutionAuditLog;

  constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): ExecutionAuditLog {
    if (!ExecutionAuditLog.instance) {
      ExecutionAuditLog.instance = new ExecutionAuditLog();
    }
    return ExecutionAuditLog.instance;
  }

  /**
   * Sanitizes any metadata object to guarantee no private keys, seeds, or authorization secrets are logged.
   */
  private sanitizeData(data?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!data) return undefined;
    const sanitized: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(data)) {
      const lower = key.toLowerCase();
      if (
        lower.includes("private") ||
        lower.includes("secret") ||
        lower.includes("key") ||
        lower.includes("seed") ||
        lower.includes("mnemonic") ||
        lower.includes("password")
      ) {
        sanitized[key] = "[REDACTED_SECRET]";
      } else if (typeof val === "bigint") {
        sanitized[key] = val.toString();
      } else if (typeof val === "object" && val !== null) {
        sanitized[key] = this.sanitizeData(val as Record<string, unknown>);
      } else {
        sanitized[key] = val;
      }
    }

    return sanitized;
  }

  public record(
    correlationId: string,
    state: LifecycleState,
    message: string,
    data?: Record<string, unknown>,
  ): AuditEvent {
    const event: AuditEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      correlationId,
      timestamp: Date.now(),
      state,
      message,
      data: this.sanitizeData(data),
    };

    this.events.unshift(event);
    if (this.events.length > 200) {
      this.events = this.events.slice(0, 200);
    }

    this.persistToStorage();
    return event;
  }

  public getEvents(correlationId?: string): AuditEvent[] {
    if (!correlationId) return [...this.events];
    return this.events.filter((e) => e.correlationId === correlationId);
  }

  public clear(): void {
    this.events = [];
    this.persistToStorage();
  }

  private persistToStorage(): void {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.setItem("perpspilot_audit_events", JSON.stringify(this.events.slice(0, 50)));
      } catch {
        // Local storage full or unavailable
      }
    }
  }

  private loadFromStorage(): void {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const raw = window.localStorage.getItem("perpspilot_audit_events");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            this.events = parsed;
          }
        }
      } catch {
        // Storage corrupted or unavailable
      }
    }
  }
}
