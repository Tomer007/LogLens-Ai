import { LogEntry, LogLevel, LogStats } from '../types';
import Papa from 'papaparse';
import { format, startOfHour, parseISO, isValid } from 'date-fns';

const LOG_LEVELS: LogLevel[] = ['INFO', 'WARN', 'ERROR', 'DEBUG'];

export function parseLogFile(content: string, fileName: string): LogEntry[] {
  if (fileName.endsWith('.csv')) {
    return parseCSV(content);
  }
  return parseText(content);
}

function parseCSV(content: string): LogEntry[] {
  const results = Papa.parse(content, { header: true, skipEmptyLines: true });
  return (results.data as any[]).map((row, index) => {
    const level = findLogLevel(Object.values(row).join(' '));
    const timestampStr = row.timestamp || row.time || row.Date;
    const timestamp = timestampStr ? new Date(timestampStr) : null;
    
    return {
      id: `csv-${index}`,
      timestamp: isValid(timestamp) ? timestamp : null,
      level,
      message: row.message || row.msg || row.description || JSON.stringify(row),
      ip: row.ip || row.client_ip,
      duration: parseFloat(row.duration || row.time_taken) || undefined,
      raw: JSON.stringify(row),
    };
  });
}

function parseText(content: string): LogEntry[] {
  const lines = content.split(/\r?\n/);
  return lines
    .filter(line => line.trim().length > 0)
    .map((line, index) => {
      // Basic regex patterns for common log formats
      // 1. [2023-10-27 10:00:00] ERROR: Something went wrong
      // 2. 127.0.0.1 - - [27/Oct/2023:10:00:00 +0000] "GET / HTTP/1.1" 200
      
      const level = findLogLevel(line);
      const ipMatch = line.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
      const timestamp = extractTimestamp(line);
      
      return {
        id: `txt-${index}`,
        timestamp,
        level,
        message: line,
        ip: ipMatch ? ipMatch[0] : undefined,
        raw: line,
      };
    });
}

function findLogLevel(text: string): LogLevel {
  const upperText = text.toUpperCase();
  for (const level of LOG_LEVELS) {
    if (upperText.includes(level)) return level;
  }
  return 'UNKNOWN';
}

function extractTimestamp(line: string): Date | null {
  // Try ISO format
  const isoMatch = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  if (isoMatch) {
    const d = new Date(isoMatch[0]);
    if (isValid(d)) return d;
  }
  
  // Try common log format [DD/MMM/YYYY:HH:MM:SS]
  const commonMatch = line.match(/\[(\d{2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2})/);
  if (commonMatch) {
    // Note: this might need more robust parsing depending on locale
    const d = new Date(commonMatch[1].replace(':', ' '));
    if (isValid(d)) return d;
  }

  // Generic date match YYYY-MM-DD HH:MM:SS
  const genericMatch = line.match(/(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})/);
  if (genericMatch) {
    const d = new Date(genericMatch[1]);
    if (isValid(d)) return d;
  }

  return null;
}

export function calculateStats(entries: LogEntry[]): LogStats {
  const levelCounts: Record<LogLevel, number> = {
    INFO: 0, WARN: 0, ERROR: 0, DEBUG: 0, UNKNOWN: 0
  };
  const ipCounts: Record<string, number> = {};
  const errorMsgs: Record<string, { count: number; entries: LogEntry[] }> = {};
  const timeDist: Record<string, { count: number; errorCount: number }> = {};
  let totalDuration = 0;
  let durationCount = 0;

  entries.forEach(entry => {
    levelCounts[entry.level]++;
    
    if (entry.ip) {
      ipCounts[entry.ip] = (ipCounts[entry.ip] || 0) + 1;
    }
    
    if (entry.level === 'ERROR') {
      const msgKey = entry.message;
      if (!errorMsgs[msgKey]) {
        errorMsgs[msgKey] = { count: 0, entries: [] };
      }
      errorMsgs[msgKey].count++;
      errorMsgs[msgKey].entries.push(entry);
    }
    
    if (entry.timestamp) {
      const hourKey = format(startOfHour(entry.timestamp), 'yyyy-MM-dd HH:00');
      if (!timeDist[hourKey]) {
        timeDist[hourKey] = { count: 0, errorCount: 0 };
      }
      timeDist[hourKey].count++;
      if (entry.level === 'ERROR') {
        timeDist[hourKey].errorCount++;
      }
    }

    if (entry.duration) {
      totalDuration += entry.duration;
      durationCount++;
    }
  });

  const topIPs = Object.entries(ipCounts)
    .map(([ip, count]) => ({ ip, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const errorFrequency = Object.entries(errorMsgs)
    .map(([message, data]) => ({ message, count: data.count, entries: data.entries }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const timeDistribution = Object.entries(timeDist)
    .map(([time, data]) => ({ time, count: data.count, errorCount: data.errorCount }))
    .sort((a, b) => a.time.localeCompare(b.time));

  // Anomaly Detection
  const anomalies: any[] = [];
  if (timeDistribution.length > 3) {
    const counts = timeDistribution.map(d => d.count);
    const errorRates = timeDistribution.map(d => d.errorCount / (d.count || 1));
    
    const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;
    const stdCount = Math.sqrt(counts.reduce((a, b) => a + Math.pow(b - avgCount, 2), 0) / counts.length);
    
    const avgErrorRate = errorRates.reduce((a, b) => a + b, 0) / errorRates.length;
    const stdErrorRate = Math.sqrt(errorRates.reduce((a, b) => a + Math.pow(b - avgErrorRate, 2), 0) / errorRates.length);

    timeDistribution.forEach((d, i) => {
      // Traffic Spike
      if (stdCount > 0 && (d.count - avgCount) > 2 * stdCount) {
        anomalies.push({
          id: `traffic-${i}`,
          type: 'traffic_spike',
          severity: (d.count - avgCount) > 3 * stdCount ? 'high' : 'medium',
          description: `Unusual traffic volume detected: ${d.count} logs (Average: ${avgCount.toFixed(1)})`,
          timestamp: d.time,
          value: d.count
        });
      }

      // Error Spike
      const rate = d.errorCount / (d.count || 1);
      if (stdErrorRate > 0 && (rate - avgErrorRate) > 2 * stdErrorRate && d.errorCount > 2) {
        anomalies.push({
          id: `error-${i}`,
          type: 'error_spike',
          severity: (rate - avgErrorRate) > 3 * stdErrorRate ? 'high' : 'medium',
          description: `Significant error rate increase: ${(rate * 100).toFixed(1)}% (Average: ${(avgErrorRate * 100).toFixed(1)}%)`,
          timestamp: d.time,
          value: rate
        });
      }
    });
  }

  return {
    levelCounts,
    topIPs,
    errorFrequency,
    timeDistribution,
    averageDuration: durationCount > 0 ? totalDuration / durationCount : undefined,
    totalLogs: entries.length,
    anomalies
  };
}
