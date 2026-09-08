require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const seedDB = require('./seed/productSeeds');
const productRoutes = require('./routes/products');
const checkoutRoutes = require('./routes/checkout');
const orderRoutes = require('./routes/orders');
const authRoutes = require('./routes/auth');
const { setupSwaggerUi, setupSwaggerJson } = require('./docs/swagger');

const app = express();
const PORT = process.env.PORT || 8000;
const IS_SERVERLESS = Boolean(process.env.VERCEL);

// ---------------------------------------------------------------------------
// Database connection
//
// On Vercel every request may hit a cold or warm lambda, so the connection
// promise is cached on globalThis and reused instead of dialling MongoDB again.
// ---------------------------------------------------------------------------
if (!globalThis.__localinkMongo) {
  globalThis.__localinkMongo = { conn: null, promise: null, bootstrapped: false };
}
const cached = globalThis.__localinkMongo;

async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not set. Add it to your environment variables.');
  }

  if (!cached.promise) {
    mongoose.set('strictQuery', false);
    cached.promise = mongoose
      .connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        maxPoolSize: 10,
      })
      .then(m => {
        console.log('✅ MongoDB connected');
        return m;
      })
      .catch(err => {
        cached.promise = null;
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

// Optional one-time bootstrap (seeding / vector sync). Off by default so cold
// starts stay fast; enable with env flags when you actually want it to run.
async function bootstrapOnce() {
  if (cached.bootstrapped) return;
  cached.bootstrapped = true;

  if (process.env.SEED_ON_START === 'true') {
    try {
      const result = await seedDB({
        force: process.env.FORCE_SEED_ON_START === 'true',
        skipIfExists: process.env.FORCE_SEED_ON_START !== 'true',
      });
      if (result?.seeded) console.log('🪴 Database seeded');
      else if (result?.skipped) console.log('🌱 Seed skipped (existing products retained)');
    } catch (err) {
      console.error('❌ Seeding error:', err.message);
    }
  }

  if (process.env.SYNC_PINECONE_ON_START === 'true') {
    try {
      const syncPinecone = require('./sync/syncPinecone');
      await syncPinecone();
      console.log('✅ Pinecone synced');
    } catch (err) {
      console.error('❌ Pinecone sync error (continuing with Mongo fallbacks):', err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Every API request makes sure the database is up before it is handled.
app.use('/api', async (req, res, next) => {
  try {
    await connectDB();
    await bootstrapOnce();
    next();
  } catch (err) {
    console.error('❌ Database unavailable:', err.message);
    res.status(503).json({ error: 'Database unavailable', detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'localink-api',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/products', productRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/search', require('./routes/search'));
app.use('/api/auth', authRoutes);

// API docs
setupSwaggerJson(app); // serves /api-docs/swagger.json
setupSwaggerUi(app);

app.get('/', (req, res) => {
  res.redirect('/api-docs');
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Local server (skipped on Vercel, which imports the exported app instead)
// ---------------------------------------------------------------------------
if (!IS_SERVERLESS && require.main === module) {
  connectDB()
    .then(bootstrapOnce)
    .catch(err => console.error('❌ Startup DB error:', err.message))
    .finally(() => {
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Localink API ready on port ${PORT}`);
        console.log(`   Docs: http://localhost:${PORT}/api-docs`);
      });
    });
}

module.exports = app;
