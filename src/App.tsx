import React, { useState, useEffect, useMemo } from "react";
import { 
  Plus, 
  Minus, 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  History, 
  PieChart as PieChartIcon, 
  Settings, 
  LogOut, 
  FileSpreadsheet,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Calendar,
  Tag,
  CreditCard,
  AlertCircle,
  CheckCircle2
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from "recharts";
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Transaction, TransactionType, CATEGORIES, GoogleTokens } from "./types";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "history" | "stats">("dashboard");
  const [tokens, setTokens] = useState<GoogleTokens | null>(() => {
    const saved = localStorage.getItem("google_tokens");
    return saved ? JSON.parse(saved) : null;
  });
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(() => {
    return localStorage.getItem("spreadsheet_id");
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync with Google Sheets
  useEffect(() => {
    if (tokens && spreadsheetId) {
      fetchFromSheets();
    }
  }, [tokens, spreadsheetId]);

  // OAuth Listener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_SUCCESS') {
        const newTokens = event.data.tokens;
        setTokens(newTokens);
        localStorage.setItem("google_tokens", JSON.stringify(newTokens));
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const [needsInit, setNeedsInit] = useState(false);

  const fetchFromSheets = async () => {
    if (!tokens || !spreadsheetId) return;
    setIsLoading(true);
    setNeedsInit(false);
    try {
      const response = await fetch("/api/sheets/get", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens, spreadsheetId, range: "Transactions!A2:F" }),
      });
      const data = await response.json();
      if (data.error && data.error.includes("range")) {
        setNeedsInit(true);
        return;
      }
      if (data.values) {
        const mapped: Transaction[] = data.values.map((row: any[], index: number) => ({
          id: `sheet-${index}`,
          date: row[0],
          description: row[1],
          category: row[2],
          type: row[3] as TransactionType,
          amount: parseFloat(row[4]),
          note: row[5],
        }));
        setTransactions(mapped.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      }
    } catch (err) {
      setError("Gagal mengambil data. Pastikan ID Spreadsheet benar.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInitializeSheet = async () => {
    if (!tokens || !spreadsheetId) return;
    setIsLoading(true);
    try {
      // We can reuse the create logic but just for adding the sheet/headers
      // For simplicity, I'll just append headers to A1:F1 of a new sheet named Transactions
      // But the server-side 'create' creates a whole new file.
      // I'll add a new endpoint or update the server to handle existing sheet initialization.
      setError("Fitur inisialisasi sheet sedang disiapkan. Untuk saat ini, gunakan tombol 'Buat Spreadsheet Baru' untuk hasil terbaik.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      const res = await fetch("/api/auth/url");
      const { url } = await res.json();
      window.open(url, "oauth_popup", "width=600,height=700");
    } catch (err) {
      setError("Failed to get auth URL");
    }
  };

  const handleCreateSheet = async () => {
    if (!tokens) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/sheets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens, title: "Rafli Finance Tracker" }),
      });
      const { spreadsheetId: newId } = await res.json();
      setSpreadsheetId(newId);
      localStorage.setItem("spreadsheet_id", newId);
    } catch (err) {
      setError("Failed to create spreadsheet");
    } finally {
      setIsLoading(false);
    }
  };

  const addTransaction = async (tx: Omit<Transaction, "id">) => {
    const newTx = { ...tx, id: Date.now().toString() };
    setTransactions([newTx, ...transactions]);
    
    if (tokens && spreadsheetId) {
      try {
        await fetch("/api/sheets/append", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tokens,
            spreadsheetId,
            range: "Transactions!A:F",
            values: [[tx.date, tx.description, tx.category, tx.type, tx.amount, tx.note || ""]],
          }),
        });
      } catch (err) {
        console.error("Failed to sync to sheets", err);
      }
    }
  };

  const totals = useMemo(() => {
    return transactions.reduce(
      (acc, tx) => {
        if (tx.type === "income") acc.income += tx.amount;
        else acc.expense += tx.amount;
        return acc;
      },
      { income: 0, expense: 0 }
    );
  }, [transactions]);

  const balance = totals.income - totals.expense;

  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return format(d, "yyyy-MM-dd");
    }).reverse();

    return last7Days.map(date => {
      const dayTxs = transactions.filter(t => t.date === date);
      return {
        name: format(parseISO(date), "EEE"),
        income: dayTxs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0),
        expense: dayTxs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0),
      };
    });
  }, [transactions]);

  const categoryData = useMemo(() => {
    const cats: Record<string, number> = {};
    transactions.filter(t => t.type === "expense").forEach(t => {
      cats[t.category] = (cats[t.category] || 0) + t.amount;
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

  if (!tokens) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
          <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200">
            <Wallet className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Rafli Finance</h1>
          <p className="text-slate-500 mb-8">
            Selamat datang, Achmad Rafli Wijaya. Kelola keuangan kuliahmu di Universitas Brawijaya dengan akun <strong>dayatalamsyah@gmail.com</strong>.
          </p>
          <button
            onClick={handleConnect}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-100"
          >
            <FileSpreadsheet className="w-5 h-5" />
            Hubungkan Google Sheets
          </button>
          <p className="mt-6 text-xs text-slate-400">
            Data akan disimpan secara aman di Google Sheets milikmu sendiri.
          </p>
        </div>
      </div>
    );
  }

  if (!spreadsheetId) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
          <div className="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-200">
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Akun Terhubung!</h1>
          <p className="text-slate-500 mb-8">
            Gunakan akun <strong>dayatalamsyah@gmail.com</strong> untuk menyimpan data. Pilih opsi di bawah:
          </p>
          
          <div className="space-y-4">
            <button
              onClick={handleCreateSheet}
              disabled={isLoading}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-100"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              Buat Spreadsheet Baru
            </button>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-400 font-bold">Atau</span></div>
            </div>

            <div className="space-y-2 text-left">
              <label className="text-xs font-bold text-slate-400 uppercase ml-1">Masukkan ID Spreadsheet Anda</label>
              <div className="flex gap-2">
                <input 
                  id="manual-sheet-id"
                  defaultValue="1AhXFeNoCmD-p1pVsIv911dZ5DD9-ft9dyNI1bTqoQBU"
                  placeholder="Contoh: 1abc123..."
                  className="flex-1 bg-slate-50 border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                />
                <button 
                  onClick={() => {
                    const id = (document.getElementById("manual-sheet-id") as HTMLInputElement).value;
                    if (id) {
                      setSpreadsheetId(id);
                      localStorage.setItem("spreadsheet_id", id);
                    }
                  }}
                  className="bg-slate-900 text-white px-4 rounded-xl font-bold text-sm hover:bg-slate-800 transition-colors"
                >
                  Simpan
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                ID Spreadsheet adalah kode unik di URL Google Sheet Anda (antara /d/ dan /edit).
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 px-6 py-4 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-100">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900 leading-none">Rafli Finance</h1>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Brawijaya Student</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                localStorage.removeItem("google_tokens");
                localStorage.removeItem("spreadsheet_id");
                setTokens(null);
                setSpreadsheetId(null);
              }}
              className="p-2 text-slate-400 hover:text-red-500 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {needsInit && (
          <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-center gap-3 mb-6">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="text-left">
              <p className="text-sm font-bold text-amber-900">Sheet Belum Siap</p>
              <p className="text-xs text-amber-700">Tab 'Transactions' tidak ditemukan di Spreadsheet Anda. Silakan buat tab baru dengan nama 'Transactions' atau gunakan tombol 'Buat Spreadsheet Baru'.</p>
            </div>
          </div>
        )}
        {activeTab === "dashboard" && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Balance Card */}
            <div className="bg-blue-600 rounded-3xl p-8 text-white shadow-2xl shadow-blue-200 relative overflow-hidden">
              <div className="relative z-10">
                <p className="text-blue-100 text-sm font-medium mb-1">Total Saldo</p>
                <h2 className="text-4xl font-bold mb-8">Rp {balance.toLocaleString("id-ID")}</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4">
                    <div className="flex items-center gap-2 text-blue-100 text-xs mb-1">
                      <TrendingUp className="w-3 h-3" /> Pemasukan
                    </div>
                    <p className="font-bold">Rp {totals.income.toLocaleString("id-ID")}</p>
                  </div>
                  <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4">
                    <div className="flex items-center gap-2 text-blue-100 text-xs mb-1">
                      <TrendingDown className="w-3 h-3" /> Pengeluaran
                    </div>
                    <p className="font-bold">Rp {totals.expense.toLocaleString("id-ID")}</p>
                  </div>
                </div>
              </div>
              <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
              <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-blue-400/20 rounded-full blur-3xl"></div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setIsAdding(true)}
                className="bg-white border border-slate-100 p-4 rounded-2xl flex items-center gap-3 hover:bg-slate-50 transition-colors shadow-sm"
              >
                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="font-semibold text-slate-700">Tambah Data</span>
              </button>
              <button 
                onClick={() => setActiveTab("stats")}
                className="bg-white border border-slate-100 p-4 rounded-2xl flex items-center gap-3 hover:bg-slate-50 transition-colors shadow-sm"
              >
                <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
                  <PieChartIcon className="w-5 h-5" />
                </div>
                <span className="font-semibold text-slate-700">Statistik</span>
              </button>
            </div>

            {/* Recent Transactions */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Transaksi Terakhir</h3>
                <button onClick={() => setActiveTab("history")} className="text-blue-600 text-sm font-semibold">Lihat Semua</button>
              </div>
              <div className="space-y-3">
                {transactions.slice(0, 5).map((tx) => (
                  <div key={tx.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center",
                        tx.type === "income" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                      )}>
                        {tx.type === "income" ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{tx.description}</p>
                        <p className="text-xs text-slate-400">{tx.category} • {format(parseISO(tx.date), "dd MMM yyyy")}</p>
                      </div>
                    </div>
                    <p className={cn(
                      "font-bold",
                      tx.type === "income" ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {tx.type === "income" ? "+" : "-"} Rp {tx.amount.toLocaleString("id-ID")}
                    </p>
                  </div>
                ))}
                {transactions.length === 0 && (
                  <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200">
                    <History className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-400 font-medium">Belum ada transaksi</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === "history" && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <h2 className="text-2xl font-bold text-slate-900">Riwayat Transaksi</h2>
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div key={tx.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center",
                      tx.type === "income" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                    )}>
                      {tx.type === "income" ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{tx.description}</p>
                      <p className="text-xs text-slate-400">{tx.category} • {format(parseISO(tx.date), "dd MMM yyyy")}</p>
                      {tx.note && <p className="text-[10px] text-slate-400 mt-1 italic">"{tx.note}"</p>}
                    </div>
                  </div>
                  <p className={cn(
                    "font-bold",
                    tx.type === "income" ? "text-emerald-600" : "text-rose-600"
                  )}>
                    {tx.type === "income" ? "+" : "-"} Rp {tx.amount.toLocaleString("id-ID")}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {activeTab === "stats" && (
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <h2 className="text-2xl font-bold text-slate-900">Statistik Keuangan</h2>
            
            {/* Weekly Bar Chart */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
              <h3 className="font-bold text-slate-700 mb-6">7 Hari Terakhir</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                    <YAxis hide />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number) => `Rp ${value.toLocaleString("id-ID")}`}
                    />
                    <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Category Pie Chart */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
              <h3 className="font-bold text-slate-700 mb-6">Pengeluaran per Kategori</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => `Rp ${value.toLocaleString("id-ID")}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4">
                {categoryData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2 text-xs text-slate-500">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                    <span className="truncate">{entry.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-6 py-3 z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-around">
          <button 
            onClick={() => setActiveTab("dashboard")}
            className={cn(
              "flex flex-col items-center gap-1 transition-colors",
              activeTab === "dashboard" ? "text-blue-600" : "text-slate-400"
            )}
          >
            <Wallet className="w-6 h-6" />
            <span className="text-[10px] font-bold">Beranda</span>
          </button>
          <button 
            onClick={() => setActiveTab("history")}
            className={cn(
              "flex flex-col items-center gap-1 transition-colors",
              activeTab === "history" ? "text-blue-600" : "text-slate-400"
            )}
          >
            <History className="w-6 h-6" />
            <span className="text-[10px] font-bold">Riwayat</span>
          </button>
          <button 
            onClick={() => setActiveTab("stats")}
            className={cn(
              "flex flex-col items-center gap-1 transition-colors",
              activeTab === "stats" ? "text-blue-600" : "text-slate-400"
            )}
          >
            <PieChartIcon className="w-6 h-6" />
            <span className="text-[10px] font-bold">Statistik</span>
          </button>
        </div>
      </nav>

      {/* Add Transaction Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="relative w-full max-w-lg bg-white rounded-t-[32px] sm:rounded-[32px] p-8 shadow-2xl"
            >
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-8 sm:hidden" />
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Tambah Transaksi</h2>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                addTransaction({
                  date: formData.get("date") as string,
                  description: formData.get("description") as string,
                  category: formData.get("category") as string,
                  type: formData.get("type") as TransactionType,
                  amount: parseFloat(formData.get("amount") as string),
                  note: formData.get("note") as string,
                });
                setIsAdding(false);
              }} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="relative cursor-pointer">
                    <input type="radio" name="type" value="expense" defaultChecked className="peer sr-only" />
                    <div className="p-4 rounded-2xl border-2 border-slate-100 peer-checked:border-rose-500 peer-checked:bg-rose-50 text-center transition-all">
                      <TrendingDown className="w-6 h-6 mx-auto mb-2 text-rose-500" />
                      <span className="text-sm font-bold text-slate-700">Pengeluaran</span>
                    </div>
                  </label>
                  <label className="relative cursor-pointer">
                    <input type="radio" name="type" value="income" className="peer sr-only" />
                    <div className="p-4 rounded-2xl border-2 border-slate-100 peer-checked:border-emerald-500 peer-checked:bg-emerald-50 text-center transition-all">
                      <TrendingUp className="w-6 h-6 mx-auto mb-2 text-emerald-500" />
                      <span className="text-sm font-bold text-slate-700">Pemasukan</span>
                    </div>
                  </label>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase ml-1">Deskripsi</label>
                  <div className="relative">
                    <History className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                    <input 
                      required 
                      name="description" 
                      placeholder="Makan Siang, Uang Saku, dll" 
                      className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Jumlah (Rp)</label>
                    <div className="relative">
                      <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                      <input 
                        required 
                        type="number" 
                        name="amount" 
                        placeholder="0" 
                        className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-blue-500 transition-all"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Kategori</label>
                    <div className="relative">
                      <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                      <select 
                        name="category" 
                        className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
                      >
                        {[...CATEGORIES.expense, ...CATEGORIES.income].map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Tanggal</label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                      <input 
                        required 
                        type="date" 
                        name="date" 
                        defaultValue={format(new Date(), "yyyy-MM-dd")}
                        className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-blue-500 transition-all"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Catatan (Opsional)</label>
                    <input 
                      name="note" 
                      placeholder="..." 
                      className="w-full bg-slate-50 border-none rounded-2xl py-4 px-4 focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-100 mt-4"
                >
                  Simpan Transaksi
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-6 right-6 z-50"
          >
            <div className="bg-rose-600 text-white p-4 rounded-2xl flex items-center gap-3 shadow-xl">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">{error}</p>
              <button onClick={() => setError(null)} className="ml-auto text-white/60 hover:text-white">
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
