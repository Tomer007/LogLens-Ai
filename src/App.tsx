import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { 
  Upload, 
  FileText, 
  BarChart3, 
  PieChart as PieIcon, 
  Activity, 
  AlertCircle, 
  Search, 
  Download, 
  Filter,
  X,
  ChevronRight,
  ChevronLeft,
  ShieldAlert,
  Zap,
  Info,
  Copy,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell,
  Legend
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { parseLogFile, calculateStats } from './lib/parser';
import { generateInsights } from './services/geminiService';
import { LogEntry, LogStats, AIInsight, LogLevel } from './types';
import { cn } from './lib/utils';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const COLORS = {
  INFO: '#3b82f6',
  WARN: '#f59e0b',
  ERROR: '#ef4444',
  DEBUG: '#10b981',
  UNKNOWN: '#6b7280'
};

export default function App() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);

  const aiTips = [
    "AI Tip: Look for patterns in timestamps to identify recurring cron job failures.",
    "AI Tip: High frequency of 404 errors often indicates broken client-side links or bot scanning.",
    "AI Tip: Correlation between high latency and specific IP ranges can signal a DDoS attempt.",
    "AI Tip: Check for 'Out of Memory' errors just before a series of service restarts.",
    "AI Tip: Use keyword filtering to isolate noise from third-party library verbosity.",
    "AI Tip: Anomalies in error rates often precede major system outages.",
    "AI Tip: Monitor unique IP counts to detect unauthorized access attempts from new regions."
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      interval = setInterval(() => {
        setCurrentTipIndex((prev) => (prev + 1) % aiTips.length);
      }, 10000);
    }
    return () => clearInterval(interval);
  }, [isLoading, aiTips.length]);
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'ALL'>('ALL');
  const [ipFilter, setIpFilter] = useState('');
  const [timePreset, setTimePreset] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [isDragging, setIsDragging] = useState(false);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [selectedErrorGroup, setSelectedErrorGroup] = useState<{ message: string; entries: LogEntry[] } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleChartClick = (data: any) => {
    if (data && data.activeLabel) {
      const timeStr = data.activeLabel;
      // timeStr is in format 'yyyy-MM-dd HH:00'
      const startDate = new Date(timeStr);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // +1 hour
      
      setDateRange({
        start: startDate.toISOString().slice(0, 16),
        end: endDate.toISOString().slice(0, 16)
      });
      setLevelFilter('ERROR');
      setTimePreset('ALL');
      setCurrentPage(1);
      
      // Scroll to Log Explorer
      const explorer = document.getElementById('log-explorer');
      if (explorer) {
        explorer.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  const handleFileUpload = useCallback(async (file: File) => {
    setIsLoading(true);
    try {
      const content = await file.text();
      const parsedEntries = parseLogFile(content, file.name);
      setEntries(parsedEntries);
      
      const initialStats = calculateStats(parsedEntries);
      const aiInsights = await generateInsights(initialStats);
      setInsights(aiInsights);
    } catch (error) {
      console.error('Error processing file:', error);
      alert('Failed to process log file. Please ensure it is a valid .log, .txt, or .csv file.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, levelFilter, ipFilter, dateRange, timePreset]);

  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      const matchesSearch = entry.message.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesLevel = levelFilter === 'ALL' || entry.level === levelFilter;
      const matchesIP = !ipFilter || (entry.ip && entry.ip.includes(ipFilter));
      
      let matchesDate = true;

      // Apply time preset if selected
      if (timePreset !== 'ALL' && entry.timestamp) {
        const now = new Date();
        const entryTime = entry.timestamp.getTime();
        let startTime = 0;

        switch (timePreset) {
          case '4h':
            startTime = now.getTime() - (4 * 60 * 60 * 1000);
            break;
          case '1d':
            startTime = now.getTime() - (24 * 60 * 60 * 1000);
            break;
          case '1w':
            startTime = now.getTime() - (7 * 24 * 60 * 60 * 1000);
            break;
          case '1m':
            startTime = now.getTime() - (30 * 24 * 60 * 60 * 1000);
            break;
        }
        
        if (entryTime < startTime) {
          matchesDate = false;
        }
      }

      // Apply manual date range if set
      if (matchesDate && entry.timestamp) {
        if (dateRange.start) {
          matchesDate = matchesDate && entry.timestamp >= new Date(dateRange.start);
        }
        if (dateRange.end) {
          matchesDate = matchesDate && entry.timestamp <= new Date(dateRange.end);
        }
      } else if (timePreset === 'ALL' && (dateRange.start || dateRange.end)) {
        matchesDate = false;
      }
      
      return matchesSearch && matchesLevel && matchesIP && matchesDate;
    });
  }, [entries, searchTerm, levelFilter, ipFilter, dateRange, timePreset]);

  const stats = useMemo(() => {
    if (filteredEntries.length === 0) return null;
    return calculateStats(filteredEntries);
  }, [filteredEntries]);

  const exportPDF = async () => {
    const dashboard = document.getElementById('dashboard-content');
    if (!dashboard) return;

    const canvas = await html2canvas(dashboard);
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save('log-analysis-report.pdf');
  };

  const levelChartData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.levelCounts)
      .filter(([_, count]) => (count as number) > 0)
      .map(([level, count]) => ({ name: level, value: count }));
  }, [stats]);

  if (entries.length === 0) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl w-full text-center space-y-8"
        >
          <div className="space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-black text-white mb-4">
              <Activity size={40} />
            </div>
            <h1 className="text-5xl font-bold tracking-tight text-black">LogLens AI</h1>
            <p className="text-xl text-neutral-500 font-light">
              Upload your system logs for instant AI-powered analysis and visualization.
            </p>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={cn(
              "relative group cursor-pointer border-2 border-dashed rounded-[32px] p-12 transition-all duration-300",
              isDragging ? "border-black bg-black/5 scale-[1.02]" : "border-neutral-200 hover:border-black hover:bg-white"
            )}
          >
            <input
              type="file"
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              accept=".log,.txt,.csv"
            />
            <div className="flex flex-col items-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center group-hover:bg-black group-hover:text-white transition-colors duration-300">
                <Upload size={32} />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-medium">Drop your log file here</p>
                <p className="text-sm text-neutral-400">Supports .log, .txt, and .csv formats</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-8">
            {[
              { icon: ShieldAlert, label: 'Security Analysis' },
              { icon: Zap, label: 'Performance Insights' },
              { icon: BarChart3, label: 'Visual Statistics' }
            ].map((item, i) => (
              <div key={i} className="flex flex-col items-center space-y-2">
                <item.icon size={20} className="text-neutral-400" />
                <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">{item.label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-black font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-neutral-100 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center text-white">
            <Activity size={24} />
          </div>
          <div>
            <h2 className="font-bold text-lg leading-none">LogLens AI</h2>
            <span className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold">Analysis Dashboard</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => {
              setEntries([]);
              setInsights([]);
              setSearchTerm('');
              setLevelFilter('ALL');
              setIpFilter('');
              setTimePreset('ALL');
              setDateRange({ start: '', end: '' });
            }}
            className="px-4 py-2 text-sm font-medium text-neutral-500 hover:text-black transition-colors"
          >
            New Analysis
          </button>
          <button 
            onClick={exportPDF}
            className="flex items-center space-x-2 bg-black text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-neutral-800 transition-all shadow-lg shadow-black/10"
          >
            <Download size={16} />
            <span>Export Report</span>
          </button>
        </div>
      </header>

      <main className="p-8 max-w-[1600px] mx-auto space-y-8">
        {/* Advanced Filters */}
        <div className="bg-white rounded-[32px] p-8 border border-neutral-100 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Filter size={20} />
              Advanced Filters
            </h3>
            <button 
              onClick={() => {
                setSearchTerm('');
                setLevelFilter('ALL');
                setIpFilter('');
                setTimePreset('ALL');
                setDateRange({ start: '', end: '' });
              }}
              className="text-xs font-bold uppercase tracking-widest text-neutral-400 hover:text-black transition-colors"
            >
              Reset Filters
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Keyword Search</label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
                <input 
                  type="text"
                  placeholder="Search messages..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-black transition-all"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Time Range</label>
              <select 
                value={timePreset}
                onChange={(e) => {
                  setTimePreset(e.target.value);
                  if (e.target.value !== 'ALL') {
                    setDateRange({ start: '', end: '' });
                  }
                }}
                className="w-full px-4 py-2.5 bg-neutral-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-black transition-all appearance-none cursor-pointer"
              >
                <option value="ALL">All Time</option>
                <option value="4h">Last 4 Hours</option>
                <option value="1d">Last 24 Hours</option>
                <option value="1w">Last 7 Days</option>
                <option value="1m">Last 30 Days</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">IP Address</label>
              <div className="relative">
                <ShieldAlert className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
                <input 
                  type="text"
                  placeholder="Filter by IP..."
                  value={ipFilter}
                  onChange={(e) => setIpFilter(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-black transition-all"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Start Date</label>
              <input 
                type="datetime-local"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="w-full px-4 py-2.5 bg-neutral-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-black transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">End Date</label>
              <input 
                type="datetime-local"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="w-full px-4 py-2.5 bg-neutral-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-black transition-all"
              />
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div id="dashboard-content" className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-[32px] p-8 border border-neutral-100 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">System Health</p>
                <p className={cn(
                  "text-2xl font-bold",
                  (stats?.levelCounts.ERROR || 0) > 10 ? "text-red-500" : "text-green-500"
                )}>
                  {(stats?.levelCounts.ERROR || 0) > 10 ? "CRITICAL" : "HEALTHY"}
                </p>
              </div>
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center",
                (stats?.levelCounts.ERROR || 0) > 10 ? "bg-red-50 text-red-500" : "bg-green-50 text-green-500"
              )}>
                {(stats?.levelCounts.ERROR || 0) > 10 ? <AlertCircle size={24} /> : <CheckCircle2 size={24} />}
              </div>
            </div>
            <StatCard label="Total Log Entries" value={stats?.totalLogs || 0} icon={FileText} />
            <StatCard label="Error Rate" value={`${((stats?.levelCounts.ERROR || 0) as number / (stats?.totalLogs || 1) * 100).toFixed(1)}%`} icon={AlertCircle} color="text-red-500" />
            <StatCard label="Unique IPs" value={stats?.topIPs.length || 0} icon={ShieldAlert} />
          </div>

          {/* 1. CRITICAL: Anomalies (Immediate Attention) */}
          {stats?.anomalies && stats.anomalies.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-[32px] p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-red-600">
                  <ShieldAlert size={24} />
                  <h3 className="text-xl font-bold">Critical Anomalies Detected</h3>
                </div>
                <span className="px-3 py-1 bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-full">
                  {stats.anomalies.length} Events
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {stats.anomalies.map((anomaly) => (
                  <div key={anomaly.id} className="bg-white p-6 rounded-2xl border border-red-100 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest",
                        anomaly.severity === 'high' ? "bg-red-600 text-white" : 
                        anomaly.severity === 'medium' ? "bg-orange-500 text-white" :
                        anomaly.severity === 'low' ? "bg-yellow-400 text-black" :
                        "bg-neutral-500 text-white"
                      )}>
                        {anomaly.severity} severity
                      </span>
                      <span className="text-[10px] font-mono text-neutral-400">{anomaly.timestamp}</span>
                    </div>
                    <p className="text-sm font-bold text-neutral-800">{anomaly.description}</p>
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <Info size={14} />
                      <span>{anomaly.type.replace('_', ' ')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. ACTIONABLE: AI Insights & Error Frequency */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* AI Insights */}
            <div className="bg-black text-white rounded-[32px] p-8 shadow-xl">
              <div className="flex items-center space-x-3 mb-8">
                <Zap className="text-yellow-400" />
                <h3 className="text-xl font-bold">Engineering Insights</h3>
              </div>
              <div className="space-y-6">
                {insights.map((insight, i) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    key={i} 
                    className="flex space-x-4 group"
                  >
                    <div className={cn(
                      "mt-1.5 w-1.5 h-1.5 rounded-full shrink-0",
                      insight.type === 'warning' ? 'bg-red-500' : insight.type === 'success' ? 'bg-green-500' : 'bg-blue-500'
                    )}></div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-lg group-hover:text-yellow-400 transition-colors">{insight.title}</h4>
                      <p className="text-sm text-neutral-400 leading-relaxed">{insight.description}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Error Frequency */}
            <div className="bg-white rounded-[32px] p-8 border border-neutral-100 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold">Error Patterns</h3>
                <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">Top 10 Recurring</span>
              </div>
              <div className="space-y-3">
                {stats?.errorFrequency.map((error, i) => (
                  <button 
                    key={i}
                    onClick={() => setSelectedErrorGroup(error)}
                    className="w-full flex items-center justify-between p-4 rounded-2xl bg-red-50/30 border border-red-100/50 hover:bg-red-50 transition-all text-left group"
                  >
                    <div className="flex-1 min-w-0 pr-4">
                      <p className="text-sm font-bold text-red-900 truncate">{error.message}</p>
                    </div>
                    <div className="flex items-center space-x-3 shrink-0">
                      <div className="px-2 py-0.5 bg-red-100 rounded text-[10px] font-bold text-red-600">
                        {error.count}x
                      </div>
                      <ChevronRight size={14} className="text-red-300 group-hover:text-red-500 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. TRENDS: Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white rounded-[32px] p-8 border border-neutral-100 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold">Traffic Trends</h3>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-black"></span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Total</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Errors</span>
                  </div>
                </div>
              </div>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart 
                    data={stats?.timeDistribution}
                    onClick={handleChartClick}
                    style={{ cursor: 'pointer' }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#999' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#999' }} />
                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} />
                    <Line type="monotone" dataKey="count" stroke="#000" strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} />
                    <Line type="monotone" dataKey="errorCount" stroke="#ef4444" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-[32px] p-8 border border-neutral-100 shadow-sm">
              <h3 className="text-xl font-bold mb-8">Log Distribution</h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={levelChartData} innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">
                      {levelChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS] || COLORS.UNKNOWN} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2">
                {Object.entries(stats?.levelCounts || {}).map(([level, count]) => (
                  <div key={level} className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[level as keyof typeof COLORS] }}></div>
                      <span className="font-medium text-neutral-500 uppercase tracking-wider">{level}</span>
                    </div>
                    <span className="font-bold">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 4. CONTEXT: Top IPs */}
          <div className="bg-white rounded-[32px] p-8 border border-neutral-100 shadow-sm">
            <h3 className="text-xl font-bold mb-8">Top IP Sources</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {stats?.topIPs.map((ip, i) => (
                <div key={i} className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">#{i + 1}</span>
                    <span className="text-xs font-bold text-black">{ip.count} req</span>
                  </div>
                  <p className="font-mono text-sm truncate">{ip.ip}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Log Explorer */}
        <div id="log-explorer" className="bg-white rounded-[32px] border border-neutral-100 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-neutral-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="text-xl font-bold">Log Explorer</h3>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center bg-neutral-50 rounded-full p-1">
                {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setLevelFilter(level)}
                    className={cn(
                      "px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all",
                      levelFilter === level ? "bg-white text-black shadow-sm" : "text-neutral-400 hover:text-neutral-600"
                    )}
                  >
                    {level}
                  </button>
                ))}
              </div>
              {(levelFilter !== 'ALL' || dateRange.start || dateRange.end || searchTerm) && (
                <button 
                  onClick={() => {
                    setLevelFilter('ALL');
                    setDateRange({ start: '', end: '' });
                    setSearchTerm('');
                    setTimePreset('ALL');
                  }}
                  className="flex items-center space-x-2 px-4 py-1.5 rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-colors text-xs font-bold uppercase tracking-wider"
                >
                  <X size={14} />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50/50">
                  <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Timestamp</th>
                  <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Level</th>
                  <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Message</th>
                  <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400">IP</th>
                  <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {filteredEntries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((entry) => (
                  <tr key={entry.id} className="hover:bg-neutral-50/50 transition-colors group">
                    <td className="px-8 py-4 text-xs font-mono text-neutral-500">
                      {entry.timestamp ? entry.timestamp.toLocaleString() : 'N/A'}
                    </td>
                    <td className="px-8 py-4">
                      <span className={cn(
                        "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                        entry.level === 'ERROR' ? "bg-red-100 text-red-600" :
                        entry.level === 'WARN' ? "bg-yellow-100 text-yellow-600" :
                        entry.level === 'INFO' ? "bg-blue-100 text-blue-600" :
                        "bg-neutral-100 text-neutral-600"
                      )}>
                        {entry.level}
                      </span>
                    </td>
                    <td className="px-8 py-4 text-sm font-medium max-w-xl truncate group-hover:whitespace-normal group-hover:break-all">
                      {entry.message}
                    </td>
                    <td className="px-8 py-4 text-xs font-mono text-neutral-500">
                      {entry.ip || '-'}
                    </td>
                    <td className="px-8 py-4 text-right">
                      <button 
                        onClick={() => copyToClipboard(entry.raw, entry.id)}
                        className="p-2 rounded-lg hover:bg-white hover:shadow-sm transition-all text-neutral-400 hover:text-black"
                        title="Copy raw log"
                      >
                        {copiedId === entry.id ? <CheckCircle2 size={16} className="text-green-500" /> : <Copy size={16} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredEntries.length === 0 && (
              <div className="py-20 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto text-neutral-400">
                  <Search size={24} />
                </div>
                <p className="text-neutral-500">No logs match your current filters</p>
              </div>
            )}
            
            {filteredEntries.length > 0 && (
              <div className="p-6 border-t border-neutral-50 flex items-center justify-between bg-neutral-50/30">
                <div className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, filteredEntries.length)} of {filteredEntries.length} entries
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg bg-white border border-neutral-200 text-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-50 transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="flex items-center space-x-1">
                    {Array.from({ length: Math.min(5, Math.ceil(filteredEntries.length / PAGE_SIZE)) }, (_, i) => {
                      const totalPages = Math.ceil(filteredEntries.length / PAGE_SIZE);
                      let pageNum = currentPage;
                      if (currentPage <= 3) pageNum = i + 1;
                      else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                      else pageNum = currentPage - 2 + i;
                      
                      if (pageNum <= 0 || pageNum > totalPages) return null;

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={cn(
                            "w-8 h-8 rounded-lg text-xs font-bold transition-all",
                            currentPage === pageNum 
                              ? "bg-black text-white shadow-md" 
                              : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                          )}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredEntries.length / PAGE_SIZE), prev + 1))}
                    disabled={currentPage === Math.ceil(filteredEntries.length / PAGE_SIZE)}
                    className="p-2 rounded-lg bg-white border border-neutral-200 text-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-50 transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Error Details Modal */}
      <AnimatePresence>
        {selectedErrorGroup && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedErrorGroup(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl max-h-[80vh] bg-white rounded-[32px] shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="p-8 border-b border-neutral-100 flex items-center justify-between shrink-0">
                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-red-600">Error Occurrences</h3>
                  <p className="text-sm text-neutral-500 font-mono break-all">{selectedErrorGroup.message}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => copyToClipboard(selectedErrorGroup.entries.map(e => e.raw).join('\n'), 'group')}
                    className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 transition-colors text-sm font-medium"
                  >
                    {copiedId === 'group' ? <CheckCircle2 size={16} className="text-green-500" /> : <Copy size={16} />}
                    <span>{copiedId === 'group' ? 'Copied All' : 'Copy All'}</span>
                  </button>
                  <button 
                    onClick={() => setSelectedErrorGroup(null)}
                    className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center hover:bg-neutral-200 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-4 bg-neutral-50/50">
                {selectedErrorGroup.entries.map((entry, i) => (
                  <div key={i} className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                        {entry.timestamp ? entry.timestamp.toLocaleString() : 'No Timestamp'}
                      </span>
                      {entry.ip && (
                        <span className="px-2 py-1 bg-neutral-100 rounded text-[10px] font-mono font-bold text-neutral-500">
                          {entry.ip}
                        </span>
                      )}
                    </div>
                    <pre className="text-sm font-mono text-neutral-800 whitespace-pre-wrap break-all bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                      {entry.raw}
                    </pre>
                  </div>
                ))}
              </div>
              <div className="p-6 border-t border-neutral-100 bg-white text-center shrink-0">
                <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest">
                  Total of {selectedErrorGroup.entries.length} occurrences found
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Loading Overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center space-y-6"
          >
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-neutral-100 border-t-black animate-spin"></div>
              <Activity className="absolute inset-0 m-auto text-black animate-pulse" size={24} />
            </div>
            <div className="text-center space-y-2 max-w-md px-6">
              <p className="text-xl font-bold">Analyzing Logs</p>
              <p className="text-sm text-neutral-500">Extracting patterns and generating AI insights...</p>
              <motion.p 
                key={currentTipIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-neutral-400 italic mt-4"
              >
                {aiTips[currentTipIndex]}
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color = "text-black" }: { label: string, value: string | number, icon: any, color?: string }) {
  return (
    <div className="bg-white rounded-[32px] p-6 border border-neutral-100 shadow-sm hover:shadow-md transition-all group">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-neutral-50 flex items-center justify-center group-hover:bg-black group-hover:text-white transition-colors">
          <Icon size={20} />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">{label}</p>
        <p className={cn("text-3xl font-bold tracking-tight", color)}>{value}</p>
      </div>
    </div>
  );
}
