import express, { Request, Response } from 'express';
import axios from 'axios';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import axiosRetry from 'axios-retry';
import { HttpsProxyAgent } from 'https-proxy-agent';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
let firebaseConfig: any = {};
if (fs.existsSync(configPath)) {
  firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({
    credential: cert(serviceAccount),
    projectId: firebaseConfig.projectId || serviceAccount.project_id,
  });
} else {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

// Initialize Firestore with specific database ID if provided
const db = getFirestore(process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId || undefined);

const app = express();

// List of User Agents for randomization
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
];

// Configure Axios with retry and optional proxy
const axiosInstance = axios.create();
axiosRetry(axiosInstance, { 
  retries: 3, 
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response?.status === 429;
  }
});

const PROXY_URL = process.env.PROXY_URL;
if (PROXY_URL) {
  const agent = new HttpsProxyAgent(PROXY_URL);
  axiosInstance.defaults.httpsAgent = agent;
  axiosInstance.defaults.proxy = false;
  console.log('Using Proxy for SMILE checker:', PROXY_URL);
} else {
  console.warn('WARNING: No PROXY_URL set. SMILE check may be rate limited by IP.');
}

// Enable 'trust proxy' for rate limiting
app.set('trust proxy', 1);

// Security Headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Rate Limiting (Internal API Protection)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests from this IP.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { success: false, message: 'API Rate limit exceeded.' },
  validate: { trustProxy: false },
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));
app.use('/api/', globalLimiter);
app.use(['/ff/api', '/blood-strike/api', '/mobile/api'], apiLimiter);

const SMILE_BASE_URL = 'https://www.smile.one/kh';

const checkAccount = async (game: string, userId: string, zoneId?: string) => {
  const endpoints: any = {
    mlbb: { path: '/mobilelegends/checkrole', pid: '13', referer: 'mobilelegends' },
    freefire: { path: '/freefire/checkrole', pid: '12', referer: 'freefire' },
    bloodstrike: { path: '/bloodstrike/checkrole', pid: '126', referer: 'bloodstrike' }
  };

  const target = endpoints[game];
  if (!target) throw new Error('Invalid game type');

  const params = new URLSearchParams();
  params.append('user_id', userId);
  if (zoneId) params.append('zone_id', zoneId);
  params.append('pid', target.pid);
  params.append('checkrole', '1');

  const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  try {
    const response = await axiosInstance.post(`${SMILE_BASE_URL}${target.path}`, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': `${SMILE_BASE_URL}/${target.referer}`,
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': randomUA,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Origin': 'https://www.smile.one',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
      },
      timeout: 15000
    });

    if (response.data && response.data.status === 200) {
      return { success: true, nickname: response.data.username || response.data.nickname };
    }
    return { success: false, message: response.data.msg || 'Account not found' };
  } catch (error: any) {
    if (error.response?.status === 429) {
      return { success: false, message: 'Provider rate limit hit. Try again later.' };
    }
    return { success: false, message: 'Server busy or blocked' };
  }
};

const validateApiToken = async (req: Request, res: Response, next: any) => {
  const token = req.headers['x-api-token'] || req.query.token;
  if (!token) return res.status(401).json({ success: false, message: 'Token required' });

  try {
    const tokensRef = db.collection('api_tokens');
    const q = await tokensRef.where('token', '==', token).limit(1).get();
    if (q.empty) return res.status(401).json({ success: false, message: 'Invalid token' });

    const tokenDoc = q.docs[0];
    const tokenData = tokenDoc.data();
    const todayStr = new Date().toISOString().split('T')[0];
    let currentCount = tokenData.lastResetDate !== todayStr ? 0 : tokenData.requestCount;

    if (currentCount >= tokenData.dailyLimit) return res.status(429).json({ success: false, message: 'Limit exceeded' });

    // Non-blocking updates
    tokenDoc.ref.update({ requestCount: currentCount + 1, lastResetDate: todayStr }).catch(e => console.error(e));
    tokenDoc.ref.collection('history').doc(todayStr).set({
      date: todayStr,
      count: FieldValue.increment(1)
    }, { merge: true }).catch(e => console.error(e));

    next();
  } catch (error) { res.status(500).json({ success: false, message: 'Security error' }); }
};

app.get('/ff/api', validateApiToken, async (req, res) => {
  const userId = req.query.id as string;
  const result = await checkAccount('freefire', userId);
  res.status(result.success ? 200 : 404).json(result);
});

app.get('/blood-strike/api', validateApiToken, async (req, res) => {
  const userId = req.query.id as string;
  const result = await checkAccount('bloodstrike', userId);
  res.status(result.success ? 200 : 404).json(result);
});

app.get('/mobile/api', validateApiToken, async (req, res) => {
  const userId = req.query.id as string;
  const zoneId = req.query.zone as string;
  const result = await checkAccount('mlbb', userId, zoneId);
  res.status(result.success ? 200 : 404).json(result);
});

app.post('/api/tokens/generate', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).send('User ID required');
  try {
    const { v4: uuidv4 } = await import('uuid');
    const newToken = uuidv4();
    await db.collection('api_tokens').doc(newToken).set({
      token: newToken,
      userId,
      requestCount: 0,
      dailyLimit: 1000000,
      lastResetDate: new Date().toISOString().split('T')[0],
      createdAt: FieldValue.serverTimestamp()
    });
    res.json({ success: true, token: newToken });
  } catch (e) { res.status(500).send('Failed'); }
});

app.get('/api/tokens/list', async (req, res) => {
  const { userId } = req.query;
  try {
    const q = await db.collection('api_tokens').where('userId', '==', userId).get();
    res.json({ success: true, tokens: q.docs.map((d: any) => d.data()) });
  } catch (e: any) { 
    console.error('List Tokens Error:', e);
    res.status(500).send(e.message || 'Internal Server Error'); 
  }
});

app.get('/api/tokens/history', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Token required');
  try {
    const q = await db.collection('api_tokens').where('token', '==', token).limit(1).get();
    if (q.empty) return res.status(404).send('Not found');
    const historyQ = await q.docs[0].ref.collection('history').orderBy('date', 'desc').limit(7).get();
    res.json({ success: true, history: historyQ.docs.map((d: any) => d.data()).reverse() });
  } catch (e: any) { 
    console.error('Fetch History Error:', e);
    res.status(500).send(e.message || 'Internal Server Error'); 
  }
});

app.post('/api/check/mlbb', async (req, res) => {
  const { userId, zoneId } = req.body;
  res.json(await checkAccount('mlbb', userId, zoneId));
});

app.post('/api/check/freefire', async (req, res) => {
  const { userId } = req.body;
  res.json(await checkAccount('freefire', userId));
});

app.post('/api/check/bloodstrike', async (req, res) => {
  const { userId } = req.body;
  res.json(await checkAccount('bloodstrike', userId));
});

// Vite middleware for local development
if (process.env.NODE_ENV !== 'production') {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'custom' });
  app.use(vite.middlewares);
}

// Serve Frontend
const distPath = path.resolve(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', async (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/ff/api') || req.path.startsWith('/blood-strike/api') || req.path.startsWith('/mobile/api')) {
    return res.status(404).send('Not found');
  }

  const indexPath = path.resolve(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else if (process.env.NODE_ENV !== 'production') {
    // In dev mode, if dist isn't built yet, the Vite middleware (mounted earlier) 
    // should have handled the request. If we reach here, it's likely a 404.
    res.status(404).send('Development build not found. Please wait for Vite to initialize.');
  } else {
    res.status(404).send('Production build not found. Please run npm run build.');
  }
});

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Running on ${PORT}`));
}

export default app;
