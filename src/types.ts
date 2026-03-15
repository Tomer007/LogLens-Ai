export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'UNKNOWN';

export interface LogEntry {
  id: string;
  timestamp: Date | null;
  level: LogLevel;
  message: string;
  ip?: string;
  duration?: number;
  raw: string;
}

export interface Anomaly {
  id: string;
  type: 'error_spike' | 'traffic_spike' | 'unusual_frequency';
  severity: 'high' | 'medium' | 'low';
  description: string;
  timestamp: string; // ISO string for the period
  value: number;
}

export interface LogStats {
  levelCounts: Record<LogLevel, number>;
  topIPs: { ip: string; count: number }[];
  errorFrequency: { message: string; count: number; entries: LogEntry[] }[];
  timeDistribution: { time: string; count: number; errorCount: number }[];
  averageDuration?: number;
  totalLogs: number;
  anomalies: Anomaly[];
}

export interface AIInsight {
  title: string;
  description: string;
  type: 'warning' | 'info' | 'success';
}
