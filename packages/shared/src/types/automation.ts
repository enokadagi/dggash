export interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  trigger: string;
  conditions: Record<string, unknown>;
  actions: unknown[];
  isActive: boolean;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationExecution {
  id: string;
  ruleId: string;
  status: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  executedAt: string;
}
