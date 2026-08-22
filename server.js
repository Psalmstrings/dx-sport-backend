const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const connectDB = require('./src/config/db');
const seedDatabase = require('./src/utils/seeder');
const errorHandler = require('./src/middlewares/errorHandler');

// Route Imports
const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const postRoutes = require('./src/routes/postRoutes');
const mediaRoutes = require('./src/routes/mediaRoutes');
const matchRoutes = require('./src/routes/matchRoutes');
const tableRoutes = require('./src/routes/tableRoutes');
const teamRoutes = require('./src/routes/teamRoutes');
const leagueRoutes = require('./src/routes/leagueRoutes');
const transferRoutes = require('./src/routes/transferRoutes');

const app = express();

// Express Middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Mount API Routers
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/posts', postRoutes);
app.use('/api/v1/media', mediaRoutes);
app.use('/api/v1/matches', matchRoutes);
app.use('/api/v1/table', tableRoutes);
app.use('/api/v1/teams', teamRoutes);
app.use('/api/v1/leagues', leagueRoutes);
app.use('/api/v1/transfers', transferRoutes);

// Single Page Web Dashboard entry route
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Central Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Initialize Database & Start Server
const startServer = async () => {
  await connectDB();
  await seedDatabase();

  const { isCloudinaryConfigured } = require('./src/config/cloudinary');

  app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`🚀 DX SPORT FOOTBALL BACKEND ENGINE RUNNING`);
    console.log(`🌐 Dashboard & API Portal: http://localhost:${PORT}`);
    console.log(`⚡ Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`☁️ Cloudinary Storage: ${isCloudinaryConfigured() ? 'ENABLED & CONNECTED' : 'LOCAL FALLBACK (Set CLOUDINARY_* in .env)'}`);
    console.log(`=================================================`);
  });
};

startServer();
