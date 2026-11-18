const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const auditLog = require('./middleware/audit');
const emotionConn = require('./db/emotion');

mongoose.set('runValidators', true); // findByIdAndUpdate & co. obey schema rules too

const app = express();

// Keeps query values as plain strings, so ?classGroup[$ne]=x can't become a database operator.
app.set('query parser', 'simple');
// Behind a hosting proxy, set TRUST_PROXY=1 so rate limiting and the audit log see real client IPs.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(o => o.trim());

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' })); // session reports carry a timeline per student
app.use(cookieParser());
app.use(auditLog);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/teachers', require('./routes/teachers'));
app.use('/api/students', require('./routes/students'));
app.use('/api/pending-faces', require('./routes/pendingFaces'));
app.use('/api/class-groups', require('./routes/classGroups'));
app.use('/api/droids', require('./routes/droids'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/subjects', require('./routes/subjects'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/emotion', require('./routes/emotion'));
app.use('/api/audit-logs', require('./routes/auditLogs'));

app.get('/api/health', (_, res) => res.json({
  status: 'ok',
  appDb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  emotionDb: emotionConn.isReady() ? 'connected' : 'disconnected',
}));

app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

// Errors raised before a route runs (CORS rejection, malformed or oversized JSON).
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.message === 'Not allowed by CORS') return res.status(403).json({ message: err.message });
  if (err.status && err.status < 500) return res.status(err.status).json({ message: err.message });
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

module.exports = app;
