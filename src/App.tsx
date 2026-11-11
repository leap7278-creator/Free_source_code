import React, { useState, useEffect } from 'react';
import { Search, ShieldCheck, ShieldAlert, Gamepad2, Info, Loader2, User as UserIcon, Hash, Key, Copy, CheckCircle2, LogIn, LogOut, Terminal, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, User } from './firebase';

type GameType = 'MLBB' | 'FREEFIRE' | 'BLOODSTRIKE';

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

const App = () => {
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
  const [showApiDocs, setShowApiDocs] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) fetchTokens(u.uid);
    });
    return unsubscribe;
  }, []);

  const fetchTokens = async (uid: string) => {
    try {
      const res = await fetch(`/api/tokens/list?userId=${uid}`);
      const data = await res.json();
      if (data.success) setTokens(data.tokens);
    } catch (e) { console.error('Fetch tokens error:', e); }
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
    try { await signInWithPopup(auth, googleProvider); }
    catch (e) { console.error('Login error:', e); }
  };

  const handleLogout = async () => {
    try { await signOut(auth); setTokens([]); }
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
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg hidden sm:block">GameID.API</span>
          </div>
          
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setShowApiDocs(!showApiDocs)}
                  className="text-sm font-medium text-slate-400 hover:text-indigo-400 transition-colors hidden sm:block"
                >
                  {showApiDocs ? 'ID Checker' : 'API Developers'}
                </button>
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full">
                  <img src={user.photoURL || ''} alt="" className="w-6 h-6 rounded-full" />
                  <span className="text-xs font-medium hidden md:block">{user.displayName}</span>
                  <button onClick={handleLogout} className="text-slate-500 hover:text-rose-400 transition-colors ml-1">
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-600/20"
              >
                <LogIn className="w-4 h-4" />
                Login for API
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

      <div className="relative max-w-4xl mx-auto px-4 pt-28 pb-12">
        <AnimatePresence mode="wait">
          {showApiDocs ? (
            <motion.div
              key="docs"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <header className="text-center">
                <h1 className="text-4xl font-bold">Developer API</h1>
                <p className="text-slate-400 mt-2">Integrate our verification into your own apps.</p>
              </header>

              {/* API Key Section */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 md:p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-600/10 rounded-xl flex items-center justify-center text-indigo-400">
                      <Key className="w-5 h-5" />
                    </div>
                    <h2 className="text-xl font-bold">Your API Tokens</h2>
                  </div>
                  <button
                    onClick={handleGenerateToken}
                    disabled={generating}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 rounded-xl text-sm font-bold transition-all"
                  >
                    {generating ? 'Generating...' : 'Create New Token'}
                  </button>
                </div>

                <div className="space-y-4">
                  {tokens.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl">
                      <p className="text-slate-500">No tokens generated yet. Create one to start using the API.</p>
                    </div>
                  ) : (
                    tokens.map((t, idx) => (
                      <div key={idx} className="bg-slate-950/50 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <code className="text-indigo-400 font-mono text-sm bg-indigo-500/10 px-2 py-0.5 rounded">
                              {t.token.substring(0, 8)}...{t.token.substring(t.token.length - 4)}
                            </code>
                            <button onClick={() => copyToClipboard(t.token)} className="text-slate-500 hover:text-white transition-colors">
                              {copiedToken === t.token ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                          <p className="text-xs text-slate-500">
                            Usage: <span className="text-slate-300 font-medium">{t.requestCount.toLocaleString()}</span> / {t.dailyLimit.toLocaleString()} requests today
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-full md:w-32 h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-indigo-500 transition-all duration-1000" 
                              style={{ width: `${(t.requestCount / t.dailyLimit) * 100}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">Resets at 00:00</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Endpoints Documentation */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-indigo-400" />
                  API Documentation
                </h3>
                
                {[
                  { title: 'Mobile Legends', path: '/mobile/api', params: '?id=12345&zone=6789&token=YOUR_TOKEN' },
                  { title: 'Free Fire', path: '/ff/api', params: '?id=12345678&token=YOUR_TOKEN' },
                  { title: 'Blood Strike', path: '/blood-strike/api', params: '?id=12345678&token=YOUR_TOKEN' },
                ].map((api, i) => (
                  <div key={i} className="bg-slate-900/30 border border-slate-800 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200">{api.title}</span>
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase font-bold tracking-wider">GET</span>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between group">
                      <code className="text-xs text-indigo-300 break-all">
                        {window.location.origin}{api.path}{api.params}
                      </code>
                      <button onClick={() => copyToClipboard(`${window.location.origin}${api.path}${api.params}`)} className="text-slate-600 hover:text-white ml-2">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="checker"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="max-w-2xl mx-auto"
            >
              <header className="text-center mb-12">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-medium mb-4">
                  <ShieldCheck className="w-4 h-4" />
                  Verified Game ID Checker
                </div>
                <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400">
                  Account Verifier
                </h1>
                <p className="mt-4 text-slate-400 text-lg">
                  Verify player accounts accurately for Cambodia's top games.
                  <br />
                  <span className="text-sm font-khmer opacity-60">ពិនិត្យឈ្មោះគណនីហ្គេមរបស់អ្នកនៅទីនេះ</span>
                </p>
              </header>

              {/* Game Selection */}
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
                        ? 'bg-indigo-600 border-indigo-500 shadow-[0_0_20px_rgba(79,70,229,0.3)]'
                        : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 text-slate-400'
                    }`}
                  >
                    {game.icon}
                    <span className="font-semibold">{game.name}</span>
                  </button>
                ))}
              </div>

              {/* Form Card */}
              <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl">
                <form onSubmit={handleCheck} className="space-y-6">
                  <div className="space-y-4">
                    <div className="relative group">
                      <label className="block text-sm font-medium text-slate-400 mb-2 ml-1">Player ID / User ID</label>
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
                          placeholder="Enter ID here..."
                          className={`w-full bg-slate-950 border rounded-2xl py-4 pl-12 pr-4 focus:ring-2 outline-none transition-all placeholder:text-slate-600 ${
                            validationError && validationError.includes('User ID') ? 'border-rose-500 ring-rose-500/20' : 'border-slate-800 focus:ring-indigo-500/50 focus:border-indigo-500'
                          }`}
                          required
                        />
                      </div>
                    </div>

                    {activeGame === 'MLBB' && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="relative group overflow-hidden">
                        <label className="block text-sm font-medium text-slate-400 mb-2 ml-1">Zone ID / Server ID</label>
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
                            className={`w-full bg-slate-950 border rounded-2xl py-4 pl-12 pr-4 focus:ring-2 outline-none transition-all placeholder:text-slate-600 ${
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
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl shadow-[0_10px_20px_-10px_rgba(79,70,229,0.5)] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                    {loading ? 'Verifying...' : 'Check ID'}
                  </button>
                </form>

                <AnimatePresence mode="wait">
                  {result && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className={`mt-8 p-6 rounded-2xl border ${result.success ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}>
                      <div className="flex items-start gap-4">
                        <div className={`mt-1 p-2 rounded-xl ${result.success ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                          {result.success ? <ShieldCheck className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
                        </div>
                        <div>
                          <h3 className={`text-lg font-bold ${result.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {result.success ? 'Account Found' : 'Check Failed'}
                          </h3>
                          {result.success && result.nickname && (
                            <div className="mt-2">
                              <span className="text-slate-400 text-sm uppercase tracking-wider font-semibold">Nickname:</span>
                              <p className="text-2xl font-black text-white mt-1 break-all tracking-tight">{result.nickname}</p>
                            </div>
                          )}
                          <p className={`mt-2 text-sm ${result.success ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>{result.message}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 bg-slate-900/30 rounded-2xl border border-slate-800/50">
                  <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 mb-4">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold mb-2 text-slate-100">Accurate</h4>
                  <p className="text-sm text-slate-400">Direct verification against official game databases.</p>
                </div>
                <div className="p-6 bg-slate-900/30 rounded-2xl border border-slate-800/50">
                  <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-400 mb-4">
                    <Terminal className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold mb-2 text-slate-100">Public API</h4>
                  <p className="text-sm text-slate-400">Robust API with 1M requests/day for developers.</p>
                </div>
                <div className="p-6 bg-slate-900/30 rounded-2xl border border-slate-800/50">
                  <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400 mb-4">
                    <Info className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold mb-2 text-slate-100">Free</h4>
                  <p className="text-sm text-slate-400">Free verification for the Cambodian gaming community.</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="mt-16 text-center text-slate-500 text-sm">
          <p>© 2026 GameID.API Cambodia. All rights reserved.</p>
          <p className="mt-1 flex items-center justify-center gap-4">
            <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Secure</span>
            <span className="flex items-center gap-1"><Terminal className="w-3 h-3" /> API Ready</span>
            <span className="flex items-center gap-1 hover:text-indigo-400 cursor-pointer" onClick={() => setShowApiDocs(!showApiDocs)}>
              {showApiDocs ? 'Back to Checker' : 'API for Developers'}
            </span>
          </p>
        </footer>
      </div>
    </div>
  );
};

export default App;
