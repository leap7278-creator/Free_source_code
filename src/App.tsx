import React, { useState, useEffect } from 'react';
import { Search, ShieldCheck, ShieldAlert, Gamepad2, Info, Loader2, User as UserIcon, Hash, Key, Copy, CheckCircle2, LogIn, LogOut, Terminal, BarChart as ChartIcon, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, User } from './firebase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

type GameType = 'MLBB' | 'FREEFIRE' | 'BLOODSTRIKE';
type ViewType = 'checker' | 'developer' | 'settings';

interface CheckResult {
  success: boolean;
  nickname?: string;
  message: string;
}

interface ApiToken {
  token: string;
  requestCount: number;
  dailyLimit: number;
  lastResetDate: string;
}

interface RecentSearch {
  game: GameType;
  userId: string;
  zoneId?: string;
  nickname: string;
  timestamp: number;
}

const App = () => {
  const [activeView, setActiveView] = useState<ViewType>('checker');
  const [activeGame, setActiveGame] = useState<GameType>('MLBB');
  const [userId, setUserId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Auth & Token State
  const [user, setUser] = useState<User | null>(null);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [generating, setGenerating] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<'online' | 'busy' | 'offline'>('online');
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [usageHistory, setUsageHistory] = useState<any[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('recentSearches');
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse recent searches', e);
      }
    }
  }, []);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) setApiStatus('online');
        else setApiStatus('busy');
      } catch (e) { setApiStatus('offline'); }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) fetchTokens(u.uid);
    });
    return unsubscribe;
  }, []);

  const fetchHistory = async (token: string) => {
    try {
      const res = await fetch(`/api/tokens/history?token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server returned ${res.status}: ${text}`);
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.history)) {
        // Format for recharts: { name: 'MM-DD', requests: count }
        const formatted = data.history.map((h: any) => {
          const dateStr = String(h.date || '');
          const parts = dateStr.split('-');
          return {
            name: parts.length > 2 ? `${parts[1]}/${parts[2]}` : dateStr,
            requests: Number(h.count || 0)
          };
        });
        setUsageHistory(formatted);
      }
    } catch (e: any) { 
      console.error('Fetch history error:', e.name, e.message); 
    }
  };

  const fetchTokens = async (uid: string) => {
    if (!uid) return;
    try {
      const res = await fetch(`/api/tokens/list?userId=${encodeURIComponent(uid)}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server error: ${text}`);
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.tokens)) {
        setTokens(data.tokens);
        // Automatically fetch history for the first active token
        if (data.tokens.length > 0 && data.tokens[0].token) {
          fetchHistory(data.tokens[0].token);
        }
      }
    } catch (e: any) { 
      console.error('Token fetch error:', e.message); 
    }
  };

  const handleGenerateToken = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/tokens/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid }),
      });
      const data = await res.json();
      if (data.success) fetchTokens(user.uid);
    } catch (e) { console.error('Generate token error:', e); }
    finally { setGenerating(false); }
  };

  const handleLogin = async () => {
    try { 
      await signInWithPopup(auth, googleProvider); 
    } catch (e: any) { 
      console.error('Login error:', e);
      if (e.code === 'auth/popup-closed-by-user') {
        setValidationError('Login was cancelled. Please try again.');
      } else if (e.code === 'auth/popup-blocked') {
        setValidationError('Popup blocked by browser. Please allow popups for this site.');
      } else {
        setValidationError('Login failed. Please check your connection.');
      }
    }
  };

  const handleLogout = async () => {
    try { await signOut(auth); setTokens([]); setActiveView('checker'); }
    catch (e) { console.error('Logout error:', e); }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(text);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const games = [
    { id: 'MLBB', name: 'Mobile Legends', icon: <Gamepad2 className="w-5 h-5" /> },
    { id: 'FREEFIRE', name: 'Free Fire', icon: <Gamepad2 className="w-5 h-5" /> },
    { id: 'BLOODSTRIKE', name: 'Blood Strike', icon: <Gamepad2 className="w-5 h-5" /> },
  ];

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    setValidationError(null);

    const numberRegex = /^\d+$/;
    if (!numberRegex.test(userId)) {
      setValidationError('User ID must contain only numbers.');
      return;
    }
    if (activeGame === 'MLBB' && !numberRegex.test(zoneId)) {
      setValidationError('Zone ID must contain only numbers.');
      return;
    }

    setLoading(true);
    const endpoint = activeGame === 'MLBB' ? '/api/check/mlbb' : 
                     activeGame === 'FREEFIRE' ? '/api/check/freefire' : 
                     '/api/check/bloodstrike';
    
    const body = activeGame === 'MLBB' ? { userId, zoneId } : { userId };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      setResult(data);

      if (data.success && data.nickname) {
        const newSearch: RecentSearch = {
          game: activeGame,
          userId,
          zoneId: activeGame === 'MLBB' ? zoneId : undefined,
          nickname: data.nickname,
          timestamp: Date.now()
        };

        const updated = [newSearch, ...recentSearches.filter(s => 
          !(s.userId === userId && s.game === activeGame && s.zoneId === (activeGame === 'MLBB' ? zoneId : undefined))
        )].slice(0, 5);
        
        setRecentSearches(updated);
        localStorage.setItem('recentSearches', JSON.stringify(updated));
      }
    } catch (error) {
      setResult({ success: false, message: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500/30">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/50 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveView('checker')}>
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg hidden sm:block tracking-tight text-white">GameID.PRO</span>
            <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800">
              <div className={`w-2 h-2 rounded-full ${
                apiStatus === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 
                apiStatus === 'busy' ? 'bg-amber-500' : 'bg-rose-500'
              }`} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {apiStatus}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-1 md:gap-4">
            <button 
              onClick={() => setActiveView('checker')}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${activeView === 'checker' ? 'text-white bg-white/5' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Checker
            </button>
            <button 
              onClick={() => setActiveView('developer')}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${activeView === 'developer' ? 'text-white bg-white/5' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Developers
            </button>
            
            {user ? (
              <div 
                onClick={() => setActiveView('settings')}
                className={`flex items-center gap-2 bg-slate-900 border px-3 py-1.5 rounded-full cursor-pointer transition-all ${activeView === 'settings' ? 'border-indigo-500 bg-indigo-500/5' : 'border-slate-800 hover:border-slate-700'}`}
              >
                <img src={user.photoURL || ''} alt="" className="w-6 h-6 rounded-full ring-1 ring-slate-700" />
                <span className="text-xs font-medium hidden md:block">{user.displayName?.split(' ')[0]}</span>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-600/20"
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">Login</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 pt-28 pb-12">
        <AnimatePresence mode="wait">
          {activeView === 'developer' ? (
            <motion.div
              key="developer"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <header className="text-center">
                <h1 className="text-4xl font-bold text-white tracking-tight">Developer Portal</h1>
                <p className="text-slate-400 mt-2">API Usage & Documentation</p>
              </header>

              {/* Usage Chart Section */}
              {user && usageHistory.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 md:p-8"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-indigo-600/10 rounded-xl flex items-center justify-center text-indigo-400">
                      <ChartIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white leading-tight">Request Activity</h2>
                      <p className="text-xs text-slate-500">Daily API requests over the last 7 days</p>
                    </div>
                  </div>
                  
                  <div className="h-[250px] w-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={usageHistory} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <XAxis 
                          dataKey="name" 
                          stroke="#475569" 
                          fontSize={10} 
                          tickLine={false} 
                          axisLine={false} 
                          dy={10}
                        />
                        <YAxis 
                          stroke="#475569" 
                          fontSize={10} 
                          tickLine={false} 
                          axisLine={false} 
                          tickFormatter={(value) => value.toLocaleString()}
                        />
                        <Tooltip 
                          cursor={{ fill: 'rgba(255,255,255,0.05)', radius: 8 }}
                          contentStyle={{ 
                            backgroundColor: '#0f172a', 
                            border: '1px solid #1e293b', 
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)'
                          }}
                          itemStyle={{ color: '#818cf8' }}
                        />
                        <Bar 
                          dataKey="requests" 
                          fill="#4f46e5" 
                          radius={[6, 6, 0, 0]} 
                          barSize={32}
                        >
                          {usageHistory.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={index === usageHistory.length - 1 ? '#818cf8' : '#4f46e5'} 
                              fillOpacity={index === usageHistory.length - 1 ? 1 : 0.6}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </motion.div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Usage Panel */}
                <div className="lg:col-span-1 space-y-6">
                  <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-lg font-bold flex items-center gap-2 text-white">
                        <Terminal className="w-5 h-5 text-indigo-400" />
                        API Usage
                      </h2>
                    </div>
                    
                    {!user ? (
                      <div className="text-center py-8">
                        <p className="text-sm text-slate-500 mb-4">Please login to manage your API tokens and track usage.</p>
                        <button onClick={handleLogin} className="text-sm font-bold text-indigo-400 hover:text-indigo-300">Login with Google</button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <button
                          onClick={handleGenerateToken}
                          disabled={generating}
                          className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 py-3 rounded-2xl text-xs font-bold transition-all border border-slate-700 flex items-center justify-center gap-2 text-white"
                        >
                          <Key className="w-4 h-4" />
                          {generating ? 'Generating...' : 'New API Token'}
                        </button>

                        <div className="space-y-3">
                          {tokens.length === 0 ? (
                            <p className="text-center text-xs text-slate-600 py-4 italic">No tokens found.</p>
                          ) : (
                            tokens.map((t, idx) => (
                              <div key={idx} className="bg-slate-950/50 border border-slate-800 p-4 rounded-2xl space-y-3">
                                <div className="flex items-center justify-between">
                                  <code className="text-indigo-400 font-mono text-[10px] bg-indigo-500/10 px-2 py-0.5 rounded">
                                    {t.token.substring(0, 12)}...
                                  </code>
                                  <button onClick={() => copyToClipboard(t.token)} className="text-slate-500 hover:text-white transition-colors">
                                    {copiedToken === t.token ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                                  </button>
                                </div>
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                                    <span>Daily Requests</span>
                                    <span className="text-slate-300">{(t.requestCount / t.dailyLimit * 100).toFixed(2)}%</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-indigo-500 transition-all duration-1000" 
                                      style={{ width: `${(t.requestCount / t.dailyLimit) * 100}%` }}
                                    />
                                  </div>
                                  <div className="flex justify-between items-center text-[10px] text-slate-500">
                                    <span>{t.requestCount.toLocaleString()} used</span>
                                    <span>1M limit</span>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Docs Panel */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 md:p-8">
                    <h2 className="text-xl font-bold mb-6 text-white flex items-center gap-2">
                      <Terminal className="w-6 h-6 text-indigo-400" />
                      API Reference
                    </h2>
                    
                    <div className="space-y-6">
                      {[
                        { title: 'Mobile Legends (MLBB)', path: '/mobile/api', params: 'id={ID}&zone={ZONE}&token={TOKEN}', desc: 'Verify MLBB player names using User ID and Zone ID.' },
                        { title: 'Free Fire (FF)', path: '/ff/api', params: 'id={ID}&token={TOKEN}', desc: 'Verify Garena Free Fire player names using Player UID.' },
                        { title: 'Blood Strike', path: '/blood-strike/api', params: 'id={ID}&token={TOKEN}', desc: 'Verify Blood Strike player names using User ID.' },
                      ].map((api, i) => (
                        <div key={i} className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-slate-200">{api.title}</h4>
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-bold">GET</span>
                          </div>
                          <p className="text-sm text-slate-400 leading-relaxed">{api.desc}</p>
                          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center justify-between group">
                            <code className="text-xs text-indigo-300 break-all font-mono">
                              {window.location.origin}{api.path}?{api.params}
                            </code>
                            <button onClick={() => copyToClipboard(`${window.location.origin}${api.path}?${api.params}`)} className="text-slate-600 hover:text-white ml-3">
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-10 p-6 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl">
                      <h4 className="text-sm font-bold text-indigo-400 mb-2">Request Headers</h4>
                      <div className="bg-slate-950 p-3 rounded-xl font-mono text-[11px] text-slate-300">
                        x-api-token: YOUR_API_TOKEN
                      </div>
                      <p className="text-[11px] text-slate-500 mt-2">
                        You can pass the token as a query parameter <code className="text-indigo-400">?token=...</code> or as a header <code className="text-indigo-400">x-api-token</code>.
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 md:p-8">
                    <h2 className="text-xl font-bold mb-6 text-white flex items-center gap-2">
                      <Info className="w-6 h-6 text-indigo-400" />
                      Frequently Asked Questions
                    </h2>
                    
                    <div className="space-y-8">
                      {[
                        {
                          q: "How do I authenticate my requests?",
                          a: "You can authenticate by sending your API token in the 'x-api-token' header or as a 'token' query parameter in the URL. Tokens can be generated in the API Usage panel."
                        },
                        {
                          q: "What are the rate limits?",
                          a: "Each token has a standard limit of 1,000,000 requests per 24-hour period. Usage counters reset automatically every day at 00:00 UTC."
                        },
                        {
                          q: "What do the different error codes mean?",
                          a: (
                            <div className="space-y-3 mt-2">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-mono text-emerald-400 w-8">200</span>
                                <span className="text-xs text-slate-400">Success. The account was found and nickname returned.</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-mono text-rose-400 w-8">401</span>
                                <span className="text-xs text-slate-400">Unauthorized. Your API token is invalid or missing.</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-mono text-amber-400 w-8">404</span>
                                <span className="text-xs text-slate-400">Not Found. The Player ID or Zone ID is incorrect.</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-mono text-blue-400 w-8">429</span>
                                <span className="text-xs text-slate-400">Rate Limited. You have exceeded your 1M daily limit.</span>
                              </div>
                            </div>
                          )
                        },
                        {
                          q: "Is there a limit on concurrent requests?",
                          a: "Yes, we implement a safety burst limit of 60 requests per minute per IP to prevent system abuse and ensure fair resource distribution for all developers."
                        }
                      ].map((faq, i) => (
                        <div key={i} className="group">
                          <h4 className="font-bold text-slate-200 mb-2 flex items-center gap-2 group-hover:text-indigo-400 transition-colors">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                            {faq.q}
                          </h4>
                          <div className="text-sm text-slate-400 leading-relaxed pl-3.5 border-l border-slate-800">
                            {faq.a}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : activeView === 'settings' ? (
            <motion.div
              key="settings"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <header className="text-center">
                <h1 className="text-4xl font-bold text-white tracking-tight">Settings</h1>
                <p className="text-slate-400 mt-2">Manage your account and view system health.</p>
              </header>

              <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden">
                <div className="p-8 space-y-8">
                  <div className="flex items-center gap-6">
                    <img src={user?.photoURL || ''} alt="" className="w-20 h-20 rounded-full border-4 border-slate-800 shadow-xl shadow-black/50" />
                    <div>
                      <h2 className="text-2xl font-bold text-white">{user?.displayName}</h2>
                      <p className="text-slate-400">{user?.email}</p>
                      <span className="inline-block mt-2 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase border border-emerald-500/20">Standard Member</span>
                    </div>
                  </div>

                  <div className="h-px bg-slate-800" />

                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-white">System Status</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl">
                        <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Service Health</span>
                        <div className="flex items-center gap-2 mt-1">
                          <div className={`w-2 h-2 rounded-full ${apiStatus === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-rose-500'}`} />
                          <span className="font-bold text-slate-200 capitalize">{apiStatus}</span>
                        </div>
                      </div>
                      <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl">
                        <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Security Proxy</span>
                        <div className="flex items-center gap-2 mt-1">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span className="font-bold text-slate-200">Active (L7)</span>
                        </div>
                      </div>
                      <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl">
                        <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">DDoS Shield</span>
                        <div className="flex items-center gap-2 mt-1">
                          <ShieldCheck className="w-4 h-4 text-indigo-400" />
                          <span className="font-bold text-slate-200">Hardened</span>
                        </div>
                      </div>
                      <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl">
                        <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Data Privacy</span>
                        <div className="flex items-center gap-2 mt-1">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span className="font-bold text-slate-200">Compliant</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-slate-800" />

                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-2xl font-bold transition-all border border-rose-500/20"
                  >
                    <LogOut className="w-5 h-5" />
                    Sign Out
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="checker"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="max-w-2xl mx-auto"
            >
              <header className="text-center mb-12">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-medium mb-4">
                  <ShieldCheck className="w-4 h-4" />
                  Verified Game ID Checker
                </div>
                <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 tracking-tight">
                  Account Verifier
                </h1>
                <p className="mt-4 text-slate-400 text-lg">
                  Verify player accounts accurately for Cambodia's top games.
                  <br />
                  <span className="text-sm font-khmer opacity-60">ពិនិត្យឈ្មោះគណនីហ្គេមរបស់អ្នកនៅទីនេះ</span>
                </p>
              </header>

              <div className="flex flex-wrap justify-center gap-3 mb-8">
                {games.map((game) => (
                  <button
                    key={game.id}
                    onClick={() => {
                      setActiveGame(game.id as GameType);
                      setResult(null);
                      setValidationError(null);
                      setUserId('');
                      setZoneId('');
                    }}
                    className={`flex items-center gap-2 px-6 py-3 rounded-2xl transition-all duration-300 border ${
                      activeGame === game.id
                        ? 'bg-indigo-600 border-indigo-500 shadow-[0_0_20px_rgba(79,70,229,0.3)] text-white font-bold'
                        : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 text-slate-400'
                    }`}
                  >
                    {game.icon}
                    <span>{game.name}</span>
                  </button>
                ))}
              </div>

              <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl">
                <form onSubmit={handleCheck} className="space-y-6">
                  <div className="space-y-4">
                    <div className="relative group">
                      <label className="block text-sm font-medium text-slate-400 mb-2 ml-1 text-xs uppercase tracking-widest font-bold">Player ID</label>
                      <div className="relative">
                        <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                        <input
                          type="text"
                          value={userId}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '' || /^\d+$/.test(val)) {
                              setUserId(val);
                              setValidationError(null);
                            }
                          }}
                          placeholder="Enter User ID here..."
                          className={`w-full bg-slate-950 border rounded-2xl py-4 pl-12 pr-4 focus:ring-2 outline-none transition-all placeholder:text-slate-700 text-white font-medium ${
                            validationError && validationError.includes('User ID') ? 'border-rose-500 ring-rose-500/20' : 'border-slate-800 focus:ring-indigo-500/50 focus:border-indigo-500'
                          }`}
                          required
                        />
                      </div>
                    </div>

                    {activeGame === 'MLBB' && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="relative group overflow-hidden">
                        <label className="block text-sm font-medium text-slate-400 mb-2 ml-1 text-xs uppercase tracking-widest font-bold">Zone ID</label>
                        <div className="relative">
                          <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                          <input
                            type="text"
                            value={zoneId}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || /^\d+$/.test(val)) {
                                setZoneId(val);
                                setValidationError(null);
                              }
                            }}
                            placeholder="e.g. 1234"
                            className={`w-full bg-slate-950 border rounded-2xl py-4 pl-12 pr-4 focus:ring-2 outline-none transition-all placeholder:text-slate-700 text-white font-medium ${
                              validationError && validationError.includes('Zone ID') ? 'border-rose-500 ring-rose-500/20' : 'border-slate-800 focus:ring-indigo-500/50 focus:border-indigo-500'
                            }`}
                            required
                          />
                        </div>
                      </motion.div>
                    )}
                  </div>

                  <AnimatePresence>
                    {validationError && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2 text-rose-400 text-sm font-medium px-1">
                        <ShieldAlert className="w-4 h-4" />
                        {validationError}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl shadow-[0_10px_30px_-10px_rgba(79,70,229,0.6)] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                    {loading ? 'Verifying...' : 'Check Account'}
                  </button>
                </form>

                <AnimatePresence mode="wait">
                  {result && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className={`mt-8 p-6 rounded-2xl border ${result.success ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}>
                      <div className="flex items-start gap-4">
                        <div className={`mt-1 p-2 rounded-xl ${result.success ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                          {result.success ? <ShieldCheck className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
                        </div>
                        <div className="flex-1">
                          <h3 className={`text-lg font-bold ${result.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {result.success ? 'Account Verified' : 'Verification Failed'}
                          </h3>
                          {result.success && result.nickname && (
                            <div className="mt-3 bg-slate-950/50 p-4 rounded-xl border border-emerald-500/20">
                              <span className="text-slate-500 text-[10px] uppercase tracking-widest font-black">Display Name</span>
                              <p className="text-3xl font-black text-white mt-1 break-all tracking-tighter leading-none">{result.nickname}</p>
                            </div>
                          )}
                          <p className={`mt-3 text-sm font-medium ${result.success ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>{result.message}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Recent Searches Section */}
              {recentSearches.length > 0 && (
                <div className="mt-8 space-y-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest ml-1">Recent Searches</h3>
                  <div className="grid grid-cols-1 gap-3">
                    {recentSearches.map((search, idx) => (
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        key={`${search.timestamp}-${idx}`}
                        className="bg-slate-900/30 border border-slate-800/50 p-4 rounded-2xl flex items-center justify-between group hover:border-indigo-500/30 transition-all cursor-pointer"
                        onClick={() => {
                          setActiveGame(search.game);
                          setUserId(search.userId);
                          setZoneId(search.zoneId || '');
                          setResult(null);
                        }}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-indigo-400 transition-colors">
                            <Gamepad2 className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white leading-none">{search.nickname}</p>
                            <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-tight font-medium">
                              {search.game} • ID: {search.userId}{search.zoneId ? ` (${search.zoneId})` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-600 font-medium">
                          {new Date(search.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 bg-slate-900/30 rounded-2xl border border-slate-800/50 hover:bg-slate-900/40 transition-colors">
                  <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 mb-4">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold mb-2 text-slate-100 text-sm">Verified Results</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">Direct connection to official game servers for accurate identification.</p>
                </div>
                <div className="p-6 bg-slate-900/30 rounded-2xl border border-slate-800/50 hover:bg-slate-900/40 transition-colors">
                  <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-400 mb-4">
                    <Terminal className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold mb-2 text-slate-100 text-sm">Enterprise API</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">High-performance JSON API with 1 million daily requests.</p>
                </div>
                <div className="p-6 bg-slate-900/30 rounded-2xl border border-slate-800/50 hover:bg-slate-900/40 transition-colors">
                  <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400 mb-4">
                    <Info className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold mb-2 text-slate-100 text-sm">System Health</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">Real-time status monitoring with DDoS protection and secure proxy.</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="mt-20 text-center text-slate-500 text-sm border-t border-slate-900 pt-8 pb-12">
          <p className="font-medium text-[11px]">© 2026 GameID.PRO Cambodia. Developed for the Gaming Community.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-6 text-[10px] font-bold uppercase tracking-widest opacity-60">
            <span className="flex items-center gap-1.5 text-emerald-500"><ShieldCheck className="w-3 h-3" /> SSL Secure</span>
            <span className="flex items-center gap-1.5 text-indigo-500"><Terminal className="w-3 h-3" /> API Ready</span>
            <button onClick={() => setActiveView('developer')} className="flex items-center gap-1.5 text-purple-500 hover:text-purple-400 transition-colors">Developer Portal</button>
            <a href="https://t.me/p_xorzz" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[#229ED9] hover:text-[#1e8dbf] transition-colors">
              <Send className="w-3 h-3" /> Telegram
            </a>
          </div>
        </footer>
      </div>

      {/* Floating Telegram Button */}
      <a 
        href="https://t.me/p_xorzz" 
        target="_blank" 
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-[60] w-12 h-12 bg-[#229ED9] hover:bg-[#1e8dbf] rounded-full flex items-center justify-center shadow-lg shadow-[#229ED9]/30 transition-all hover:scale-110 active:scale-95 group"
        title="Contact Support"
      >
        <Send className="w-6 h-6 text-white -translate-x-0.5 translate-y-0.5" />
      </a>
    </div>
  );
};

export default App;
