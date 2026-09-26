import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const app = express();
const port = Number(process.env.PORT || 3000);

// Trust Render's reverse proxy so rate limiting uses real client IPs
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ── Security headers ─────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,        // frontend is served by Vercel, not here
  crossOriginEmbedderPolicy: false     // allow cross-origin Firebase SDK scripts
}));

// ── Rate limiting ────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // 100 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' }
});

const voteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,                    // voting is infrequent — 10 per 15 min is generous
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many vote attempts. Please try again later.' }
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin requests. Please try again later.' }
});

app.use('/api', apiLimiter);

function createFirebaseApp() {
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    throw new Error('Missing Firebase server credentials. Copy backend/.env.example to backend/.env and fill it in.');
  }
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
}

const firebaseApp = getApps().length ? getApps()[0] : createFirebaseApp();
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const adminEmails = new Set((process.env.FIREBASE_ADMIN_EMAILS || '')
  .split(',')
  .map(email => email.trim().toLowerCase())
  .filter(Boolean));

const allowedOrigins = new Set((process.env.FRONTEND_ORIGIN || 'http://localhost:5500')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean));

app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '32kb' }));

async function requireAdmin(req, res, next) {
  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Sign in with an administrator account.' });

  try {
    const decoded = await auth.verifyIdToken(token, true);
    const email = (decoded.email || '').toLowerCase();
    if (!decoded.email_verified || !adminEmails.has(email)) {
      return res.status(403).json({ error: 'This account is not authorized to access the admin dashboard.' });
    }
    req.admin = { uid: decoded.uid, email };
    next();
  } catch {
    res.status(401).json({ error: 'Your sign-in has expired. Please sign in again.' });
  }
}

function cleanDoc(doc) {
  return { id: doc.id, ...doc.data() };
}

async function listCollection(name, orderBy = 'name') {
  const snapshot = await db.collection(name).orderBy(orderBy).get();
  return snapshot.docs.map(cleanDoc);
}

async function getElectionSettings() {
  const doc = await db.collection('settings').doc('election').get();
  if (!doc.exists) {
    return {
      resultsPublished: false,
      votingOpen: true,
      votingDeadline: null
    };
  }
  const data = doc.data() || {};
  return {
    resultsPublished: Boolean(data.resultsPublished),
    votingOpen: data.votingOpen !== false,
    votingDeadline: data.votingDeadline || null
  };
}

function isVotingAllowed(settings) {
  if (!settings.votingOpen) {
    return { allowed: false, reason: 'Voting has been closed by the election administration.' };
  }
  if (settings.votingDeadline) {
    const deadline = new Date(settings.votingDeadline).getTime();
    if (!Number.isNaN(deadline) && Date.now() > deadline) {
      return { allowed: false, reason: 'The deadline for voting has passed.' };
    }
  }
  return { allowed: true };
}

async function computeResults() {
  const [elections, candidates, votesSnapshot, votersSnapshot] = await Promise.all([
    listCollection('elections', 'title'),
    listCollection('candidates', 'name'),
    db.collection('votes').get(),
    db.collection('voters').get()
  ]);

  const totalVoters = votersSnapshot.size;
  const uniqueVoters = new Set();
  const votes = [];
  votesSnapshot.forEach(doc => {
    const data = doc.data();
    uniqueVoters.add(data.voterId);
    votes.push(data);
  });

  const totalVotesCast = votes.length;
  const turnoutPercent = totalVoters > 0 ? Number(((uniqueVoters.size / totalVoters) * 100).toFixed(1)) : 0;

  const positions = elections.map(election => {
    const positionCandidates = candidates.filter(c => c.electionId === election.id);
    const candidateTallies = positionCandidates.map(candidate => {
      const candidateVotes = votes.filter(v => v.electionId === election.id && v.candidateId === candidate.id).length;
      return {
        id: candidate.id,
        name: candidate.name,
        votes: candidateVotes,
        percentage: 0
      };
    });

    const positionTotalVotes = candidateTallies.reduce((sum, c) => sum + c.votes, 0);
    let maxVotes = 0;
    candidateTallies.forEach(c => {
      c.percentage = positionTotalVotes > 0 ? Number(((c.votes / positionTotalVotes) * 100).toFixed(1)) : 0;
      if (c.votes > maxVotes) maxVotes = c.votes;
    });

    candidateTallies.sort((a, b) => b.votes - a.votes);
    const winnerIds = maxVotes > 0 ? candidateTallies.filter(c => c.votes === maxVotes).map(c => c.id) : [];

    return {
      id: election.id,
      title: election.title,
      totalVotes: positionTotalVotes,
      candidates: candidateTallies,
      winnerIds
    };
  });

  return {
    totalVoters,
    totalBallotsCast: uniqueVoters.size,
    totalVotesCast,
    turnoutPercent,
    positions
  };
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/voters/:voterId', async (req, res, next) => {
  try {
    const voter = await db.collection('voters').doc(req.params.voterId).get();
    if (!voter.exists) return res.status(404).json({ error: 'Voter ID not found.' });
    res.json(cleanDoc(voter));
  } catch (error) { next(error); }
});

app.get('/api/voters/:voterId/votes', async (req, res, next) => {
  try {
    const voterId = req.params.voterId;
    const votesSnapshot = await db.collection('votes').where('voterId', '==', voterId).get();
    const votes = votesSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        electionId: data.electionId,
        candidateId: data.candidateId,
        candidateName: data.candidateName
      };
    });
    res.json({ votes });
  } catch (error) { next(error); }
});

app.get('/api/ballot', async (_req, res, next) => {
  try {
    const [elections, candidates, settings] = await Promise.all([
      listCollection('elections', 'title'),
      listCollection('candidates', 'name'),
      getElectionSettings()
    ]);
    const check = isVotingAllowed(settings);
    res.json({
      elections,
      candidates,
      votingAllowed: check.allowed,
      votingReason: check.reason || null,
      votingDeadline: settings.votingDeadline,
      votingOpen: settings.votingOpen
    });
  } catch (error) { next(error); }
});

// Public results endpoint — accessible to all, gated by admin's resultsPublished toggle
app.get('/api/results', async (_req, res, next) => {
  try {
    const settings = await getElectionSettings();
    if (!settings.resultsPublished) {
      return res.json({
        published: false,
        message: 'Official results have not been published by the election commission yet.',
        votingOpen: settings.votingOpen,
        votingDeadline: settings.votingDeadline
      });
    }
    const tally = await computeResults();
    res.json({
      published: true,
      ...tally,
      votingOpen: settings.votingOpen,
      votingDeadline: settings.votingDeadline
    });
  } catch (error) { next(error); }
});

app.post('/api/votes', voteLimiter, async (req, res, next) => {
  try {
    const { voterId, voterName, electionId, candidateId, candidateName } = req.body;
    if (!voterId || !voterName || !electionId || !candidateId || !candidateName) {
      return res.status(400).json({ error: 'Missing vote details.' });
    }

    const settings = await getElectionSettings();
    const check = isVotingAllowed(settings);
    if (!check.allowed) {
      return res.status(403).json({ error: check.reason });
    }

    const voteRef = db.collection('votes').doc(`${voterId}_${electionId}`);
    await db.runTransaction(async transaction => {
      const existingVote = await transaction.get(voteRef);
      if (existingVote.exists) throw new Error('You have already voted in this election.');
      transaction.set(voteRef, {
        voterId, voterName, electionId, candidateId, candidateName,
        timestamp: FieldValue.serverTimestamp()
      });
    });
    res.status(201).json({ ok: true });
  } catch (error) {
    if (error.message.includes('already voted')) return res.status(409).json({ error: error.message });
    next(error);
  }
});

app.use('/api/admin', adminLimiter, requireAdmin);

// Admin stats: complete real-time tallies, turnout %, and settings
app.get('/api/admin/stats', async (_req, res, next) => {
  try {
    const [settings, tally] = await Promise.all([
      getElectionSettings(),
      computeResults()
    ]);
    res.json({
      settings,
      ...tally
    });
  } catch (error) { next(error); }
});

// Admin settings: toggle results published, deadline, open/close voting
app.post('/api/admin/settings', async (req, res, next) => {
  try {
    const { resultsPublished, votingOpen, votingDeadline } = req.body;
    const updateData = {};
    if (resultsPublished !== undefined) updateData.resultsPublished = Boolean(resultsPublished);
    if (votingOpen !== undefined) updateData.votingOpen = Boolean(votingOpen);
    if (votingDeadline !== undefined) {
      updateData.votingDeadline = votingDeadline ? new Date(votingDeadline).toISOString() : null;
    }
    updateData.updatedAt = FieldValue.serverTimestamp();

    await db.collection('settings').doc('election').set(updateData, { merge: true });
    const settings = await getElectionSettings();
    res.json({ ok: true, settings });
  } catch (error) { next(error); }
});

app.get('/api/admin/data', async (_req, res, next) => {
  try {
    const [voters, elections, candidates] = await Promise.all([
      listCollection('voters'), listCollection('elections', 'title'), listCollection('candidates')
    ]);
    res.json({ voters, elections, candidates });
  } catch (error) { next(error); }
});

app.post('/api/admin/voters', async (req, res, next) => {
  try {
    const { id, name } = req.body;
    if (!id || !name) return res.status(400).json({ error: 'Voter ID and name are required.' });
    await db.collection('voters').doc(id).set({ name });
    res.status(201).json({ id, name });
  } catch (error) { next(error); }
});

app.put('/api/admin/voters/:id', async (req, res, next) => {
  try {
    const { name } = req.body;
    const id = req.params.id;
    if (!name) return res.status(400).json({ error: 'Voter name is required.' });
    const ref = db.collection('voters').doc(id);
    const exists = await ref.get();
    if (!exists.exists) return res.status(404).json({ error: 'Voter not found.' });
    await ref.update({ name });
    res.json({ id, name });
  } catch (error) { next(error); }
});

app.delete('/api/admin/voters/:id', async (req, res, next) => {
  try {
    const ref = db.collection('voters').doc(req.params.id);
    const exists = await ref.get();
    if (!exists.exists) return res.status(404).json({ error: 'Voter not found.' });
    await ref.delete();
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post('/api/admin/elections', async (req, res, next) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'Election title is required.' });
    const doc = await db.collection('elections').add({ title, createdAt: FieldValue.serverTimestamp() });
    res.status(201).json({ id: doc.id, title });
  } catch (error) { next(error); }
});

app.put('/api/admin/elections/:id', async (req, res, next) => {
  try {
    const { title } = req.body;
    const id = req.params.id;
    if (!title) return res.status(400).json({ error: 'Election title is required.' });
    const ref = db.collection('elections').doc(id);
    const exists = await ref.get();
    if (!exists.exists) return res.status(404).json({ error: 'Election not found.' });
    await ref.update({ title });
    res.json({ id, title });
  } catch (error) { next(error); }
});

app.delete('/api/admin/elections/:id', async (req, res, next) => {
  try {
    const electionRef = db.collection('elections').doc(req.params.id);
    const election = await electionRef.get();
    if (!election.exists) return res.status(404).json({ error: 'Election not found.' });

    const batch = db.batch();
    const candidatesSnapshot = await db.collection('candidates').where('electionId', '==', req.params.id).get();
    const votesSnapshot = await db.collection('votes').where('electionId', '==', req.params.id).get();

    batch.delete(electionRef);
    candidatesSnapshot.docs.forEach((candidateDoc) => batch.delete(candidateDoc.ref));
    votesSnapshot.docs.forEach((voteDoc) => batch.delete(voteDoc.ref));
    await batch.commit();
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post('/api/admin/candidates', async (req, res, next) => {
  try {
    const { electionId, name } = req.body;
    if (!electionId || !name) return res.status(400).json({ error: 'Election and candidate name are required.' });
    const doc = await db.collection('candidates').add({ electionId, name, createdAt: FieldValue.serverTimestamp() });
    res.status(201).json({ id: doc.id, electionId, name });
  } catch (error) { next(error); }
});

app.put('/api/admin/candidates/:id', async (req, res, next) => {
  try {
    const { electionId, name } = req.body;
    const id = req.params.id;
    if (!electionId || !name) return res.status(400).json({ error: 'Election and candidate name are required.' });
    const ref = db.collection('candidates').doc(id);
    const exists = await ref.get();
    if (!exists.exists) return res.status(404).json({ error: 'Candidate not found.' });
    await ref.update({ electionId, name });
    res.json({ id, electionId, name });
  } catch (error) { next(error); }
});

app.delete('/api/admin/candidates/:id', async (req, res, next) => {
  try {
    const ref = db.collection('candidates').doc(req.params.id);
    const exists = await ref.get();
    if (!exists.exists) return res.status(404).json({ error: 'Candidate not found.' });
    await ref.delete();
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// Root route — helpful message instead of "Cannot GET /"
app.get('/', (_req, res) => res.json({
  service: 'DESA Decides 2026 API',
  status: 'running',
  endpoints: '/api/health, /api/ballot, /api/results, /api/voters/:id, /api/voters/:id/votes, /api/votes, /api/admin/*',
  note: 'The frontend is served separately (Vercel in production, Live Server locally).'
}));

// NOTE: Static file serving removed. The frontend is deployed on Vercel.
// The previous line served the parent directory which exposed backend/.env!
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'The server could not complete that request.' });
});

app.listen(port, () => console.log(`DESA backend is running at http://localhost:${port}`));