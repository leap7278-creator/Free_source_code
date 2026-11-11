import express, { Request, Response } from 'express';
import axios from 'axios';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

admin.initializeApp({
  projectId: firebaseConfig.projectId,
});

const db = getFirestore();

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(morgan('dev'));

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

  // --- Middleware for Public API Token Validation ---
  const validateApiToken = async (req: Request, res: Response, next: any) => {
    const token = req.headers['x-api-token'] || req.query.token;
    if (!token) {
      return res.status(401).json({ success: false, message: 'API token is required' });
    }

    try {
      const tokensRef = db.collection('api_tokens');
      const q = await tokensRef.where('token', '==', token).limit(1).get();

      if (q.empty) {
        return res.status(401).json({ success: false, message: 'Invalid API token' });
      }

      const tokenDoc = q.docs[0];
      const tokenData = tokenDoc.data();
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];

      let currentCount = tokenData.requestCount;
      if (tokenData.lastResetDate !== todayStr) {
        currentCount = 0;
      }

      if (currentCount >= tokenData.dailyLimit) {
        return res.status(429).json({ success: false, message: 'Daily limit exceeded. Resets at midnight.' });
      }

      // Increment and update (non-blocking for performance)
      tokenDoc.ref.update({
        requestCount: currentCount + 1,
        lastResetDate: todayStr
      });

      next();
    } catch (error) {
      console.error('Token Validation Error:', error);
      res.status(500).json({ success: false, message: 'Server error during token validation' });
    }
  };

  // --- Public API Endpoints ---

  app.get('/ff/api', validateApiToken, async (req: Request, res: Response) => {
    const userId = req.query.id as string;
    if (!userId) return res.status(400).json({ success: false, message: 'ID is required' });

    try {
      const params = new URLSearchParams();
      params.append('user_id', userId);
      params.append('pid', '12');
      params.append('checkrole', '1');

      const response = await axios.post(`${SMILE_BASE_URL}/freefire/checkrole`, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': `${SMILE_BASE_URL}/freefire` }
      });

      if (response.data && response.data.status === 200) {
        res.json({ success: true, nickname: response.data.username || response.data.nickname });
      } else {
        res.status(404).json({ success: false, message: response.data.msg || 'Invalid ID' });
      }
    } catch (e) { res.status(500).json({ success: false, message: 'API error' }); }
  });

  app.get('/blood-strike/api', validateApiToken, async (req: Request, res: Response) => {
    const userId = req.query.id as string;
    if (!userId) return res.status(400).json({ success: false, message: 'ID is required' });

    try {
      const params = new URLSearchParams();
      params.append('user_id', userId);
      params.append('pid', '126');
      params.append('checkrole', '1');

      const response = await axios.post(`${SMILE_BASE_URL}/bloodstrike/checkrole`, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': `${SMILE_BASE_URL}/bloodstrike` }
      });

      if (response.data && response.data.status === 200) {
        res.json({ success: true, nickname: response.data.username || response.data.nickname });
      } else {
        res.status(404).json({ success: false, message: response.data.msg || 'Invalid ID' });
      }
    } catch (e) { res.status(500).json({ success: false, message: 'API error' }); }
  });

  app.get('/mobile/api', validateApiToken, async (req: Request, res: Response) => {
    const userId = req.query.id as string;
    const zoneId = req.query.zone as string;
    if (!userId || !zoneId) return res.status(400).json({ success: false, message: 'ID and Zone are required' });

    try {
      const params = new URLSearchParams();
      params.append('user_id', userId);
      params.append('zone_id', zoneId);
      params.append('pid', '13');
      params.append('checkrole', '1');

      const response = await axios.post(`${SMILE_BASE_URL}/mobilelegends/checkrole`, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': `${SMILE_BASE_URL}/mobilelegends` }
      });

      if (response.data && response.data.status === 200) {
        res.json({ success: true, nickname: response.data.username || response.data.nickname });
      } else {
        res.status(404).json({ success: false, message: response.data.msg || 'Invalid ID' });
      }
    } catch (e) { res.status(500).json({ success: false, message: 'API error' }); }
  });

  // --- Token Management API (Internal for UI) ---
  app.post('/api/tokens/generate', async (req: Request, res: Response) => {
    // Note: In a real app, you'd verify the Firebase ID Token here to get the userId
    // For this example, we'll use a simplified version
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'User ID is required' });

    try {
      const { v4: uuidv4 } = await import('uuid');
      const newToken = uuidv4();
      const tokenId = newToken;

      await db.collection('api_tokens').doc(tokenId).set({
        token: newToken,
        userId: userId,
        requestCount: 0,
        dailyLimit: 1000000,
        lastResetDate: new Date().toISOString().split('T')[0],
        createdAt: FieldValue.serverTimestamp() as any
      });

      res.json({ success: true, token: newToken });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to generate token' });
    }
  });

  app.get('/api/tokens/list', async (req: Request, res: Response) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, message: 'User ID is required' });

    try {
      const q = await db.collection('api_tokens').where('userId', '==', userId).get();
      const tokens = q.docs.map((doc: any) => doc.data());
      res.json({ success: true, tokens });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to list tokens' });
    }
  });

  // --- Original Internal UI Check Endpoints ---
  app.post('/api/check/mlbb', async (req: Request, res: Response) => {
    const { userId, zoneId } = req.body;
    if (!userId || !zoneId) {
      return res.status(400).json({ success: false, message: 'User ID and Zone ID are required' });
    }

    try {
      const params = new URLSearchParams();
      params.append('user_id', userId);
      params.append('zone_id', zoneId);
      params.append('pid', '13'); // MLBB ID on Smile.one
      params.append('checkrole', '1');

      const response = await axios.post(`${SMILE_BASE_URL}/mobilelegends/checkrole`, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': `${SMILE_BASE_URL}/mobilelegends`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      if (response.data && response.data.status === 200) {
        return res.json({
          success: true,
          nickname: response.data.username || response.data.nickname,
          message: 'Account verified'
        });
      } else {
        return res.status(404).json({
          success: false,
          message: response.data.msg || 'Invalid User ID or Zone ID'
        });
      }
    } catch (error: any) {
      console.error('MLBB Check Error:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to verify MLBB account' });
    }
  });

  app.post('/api/check/freefire', async (req: Request, res: Response) => {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    try {
      const params = new URLSearchParams();
      params.append('user_id', userId);
      params.append('pid', '12'); // Free Fire ID on Smile.one
      params.append('checkrole', '1');

      const response = await axios.post(`${SMILE_BASE_URL}/freefire/checkrole`, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': `${SMILE_BASE_URL}/freefire`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      if (response.data && response.data.status === 200) {
        return res.json({
          success: true,
          nickname: response.data.username || response.data.nickname,
          message: 'Account verified'
        });
      } else {
        return res.status(404).json({
          success: false,
          message: response.data.msg || 'Invalid User ID'
        });
      }
    } catch (error: any) {
      console.error('Free Fire Check Error:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to verify Free Fire account' });
    }
  });

  app.post('/api/check/bloodstrike', async (req: Request, res: Response) => {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    try {
      const params = new URLSearchParams();
      params.append('user_id', userId);
      params.append('pid', '126'); // Blood Strike ID
      params.append('checkrole', '1');

      const response = await axios.post(`${SMILE_BASE_URL}/bloodstrike/checkrole`, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': `${SMILE_BASE_URL}/bloodstrike`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      if (response.data && response.data.status === 200) {
        return res.json({
          success: true,
          nickname: response.data.username || response.data.nickname,
          message: 'Account verified'
        });
      } else {
        return res.status(404).json({
          success: false,
          message: response.data.msg || 'Invalid User ID'
        });
      }
    } catch (error: any) {
      console.error('Blood Strike Check Error:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to verify Blood Strike account' });
    }
  });

  // Serve index.html for all non-API routes
  app.get('*', async (req, res, next) => {
    const url = req.originalUrl;
    try {
      let template: string;
      if (!isProd) {
        const fs = await import('fs');
        template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
      } else {
        const fs = await import('fs');
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
