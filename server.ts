import express, { Request, Response } from 'express';
import axios from 'axios';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
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

const db = getFirestore();

// Configure Axios with retry and optional proxy
const axiosInstance = axios.create();
axiosRetry(axiosInstance, { retries: 3, retryDelay: axiosRetry.exponentialDelay });

const PROXY_URL = process.env.PROXY_URL;
if (PROXY_URL) {
  const agent = new HttpsProxyAgent(PROXY_URL);
  axiosInstance.defaults.httpsAgent = agent;
  axiosInstance.defaults.proxy = false;
  console.log('Using Proxy for checker:', PROXY_URL);
}

console.log('App starting for: https://api-game-baser.vercel.app');

async function startServer() {
  const app = express();
  
  // Enable 'trust proxy' for rate limiting to work correctly behind Google Cloud's proxy
  app.set('trust proxy', 1);
  
  // Security Headers (Helmet)
  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for Vite dev mode compatibility
    crossOriginEmbedderPolicy: false
  }));

  app.use(cors());
  app.use(express.json());
  app.use(morgan('combined'));

  // --- DDoS Protection: Rate Limiting ---
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    message: { success: false, message: 'Too many requests from this IP, please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
  });

  const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute
    message: { success: false, message: 'API Rate limit exceeded. Please wait.' },
    validate: { trustProxy: false },
  });

  app.use('/api/', globalLimiter);
  app.use(['/ff/api', '/blood-strike/api', '/mobile/api'], apiLimiter);

  const isProd = process.env.NODE_ENV === 'production';

  let vite: any;
  if (!isProd) {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
  }

  const SMILE_BASE_URL = 'https://www.smile.one/kh';

  // --- Robust Verification Function ---
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

    try {
      const response = await axiosInstance.post(`${SMILE_BASE_URL}${target.path}`, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': `${SMILE_BASE_URL}/${target.referer}`,
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Origin': 'https://www.smile.one'
        },
        timeout: 15000 // 15 seconds timeout
      });

      if (response.data && response.data.status === 200) {
        return { success: true, nickname: response.data.username || response.data.nickname };
      }
      return { success: false, message: response.data.msg || 'Account not found or invalid ID' };
    } catch (error: any) {
      console.error(`Verification error for ${game}:`, error.message);
      // Try alternative endpoint if smile.one fails? 
      // For now, return a more descriptive error
      if (error.response) {
        return { success: false, message: `Game server returned ${error.response.status}. Please try again later.` };
      }
      return { success: false, message: 'Verification server is currently busy or unreachable.' };
    }
  };

  // --- Middleware for Public API Token Validation ---
  const validateApiToken = async (req: Request, res: Response, next: any) => {
    const token = req.headers['x-api-token'] || req.query.token;
    if (!token) return res.status(401).json({ success: false, message: 'API token is required' });

    try {
      const tokensRef = db.collection('api_tokens');
      const q = await tokensRef.where('token', '==', token).limit(1).get();

      if (q.empty) return res.status(401).json({ success: false, message: 'Invalid API token' });

      const tokenDoc = q.docs[0];
      const tokenData = tokenDoc.data();
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];

      let currentCount = tokenData.requestCount;
      if (tokenData.lastResetDate !== todayStr) {
        currentCount = 0;
      }

      if (currentCount >= tokenData.dailyLimit) {
        return res.status(429).json({ success: false, message: 'Daily limit exceeded (1,000,000). Resets at midnight.' });
      }

      // Non-blocking update
      tokenDoc.ref.update({ requestCount: currentCount + 1, lastResetDate: todayStr }).catch(e => console.error('Token count update failed:', e));

      next();
    } catch (error) {
      res.status(500).json({ success: false, message: 'Security layer error' });
    }
  };

  // --- Public API Endpoints ---
  app.get('/ff/api', validateApiToken, async (req: Request, res: Response) => {
    const userId = req.query.id as string;
    if (!userId) return res.status(400).json({ success: false, message: 'ID is required' });
    const result = await checkAccount('freefire', userId);
    res.status(result.success ? 200 : 404).json(result);
  });

  app.get('/blood-strike/api', validateApiToken, async (req: Request, res: Response) => {
    const userId = req.query.id as string;
    if (!userId) return res.status(400).json({ success: false, message: 'ID is required' });
    const result = await checkAccount('bloodstrike', userId);
    res.status(result.success ? 200 : 404).json(result);
  });

  app.get('/mobile/api', validateApiToken, async (req: Request, res: Response) => {
    const userId = req.query.id as string;
    const zoneId = req.query.zone as string;
    if (!userId || !zoneId) return res.status(400).json({ success: false, message: 'ID and Zone are required' });
    const result = await checkAccount('mlbb', userId, zoneId);
    res.status(result.success ? 200 : 404).json(result);
  });

  // --- Token Management API ---
  app.post('/api/tokens/generate', async (req: Request, res: Response) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'Authentication required' });

    try {
      const { v4: uuidv4 } = await import('uuid');
      const newToken = uuidv4();
      await db.collection('api_tokens').doc(newToken).set({
        token: newToken,
        userId: userId,
        requestCount: 0,
        dailyLimit: 1000000,
        lastResetDate: new Date().toISOString().split('T')[0],
        createdAt: FieldValue.serverTimestamp() as any
      });
      res.json({ success: true, token: newToken });
    } catch (e) { res.status(500).json({ success: false, message: 'Token creation failed' }); }
  });

  app.get('/api/tokens/list', async (req: Request, res: Response) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, message: 'Unauthorized' });
    try {
      const q = await db.collection('api_tokens').where('userId', '==', userId).get();
      res.json({ success: true, tokens: q.docs.map((doc: any) => doc.data()) });
    } catch (e) { res.status(500).json({ success: false, message: 'Access denied' }); }
  });

  // --- Internal UI Check Endpoints ---
  app.post('/api/check/mlbb', async (req: Request, res: Response) => {
    const { userId, zoneId } = req.body;
    if (!userId || !zoneId) return res.status(400).json({ success: false, message: 'Missing fields' });
    const result = await checkAccount('mlbb', userId, zoneId);
    res.json(result);
  });

  app.post('/api/check/freefire', async (req: Request, res: Response) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'Missing ID' });
    const result = await checkAccount('freefire', userId);
    res.json(result);
  });

  app.post('/api/check/bloodstrike', async (req: Request, res: Response) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'Missing ID' });
    const result = await checkAccount('bloodstrike', userId);
    res.json(result);
  });

  app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));
  // Serve index.html for all non-API routes
  app.get('*', async (req, res, next) => {
    const url = req.originalUrl;
    try {
      let template: string;
      if (!isProd) {
        template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
      } else {
        template = fs.readFileSync(path.resolve(__dirname, 'dist/index.html'), 'utf-8');
      }
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e: any) {
      if (!isProd) vite.ssrFixStacktrace(e);
      next(e);
    }
  });

  const PORT = 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
