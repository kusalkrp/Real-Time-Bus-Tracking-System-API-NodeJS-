require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

console.log('Starting app.js');

// Import configurations and middleware
const { redisClient } = require('./config/database');

console.log('Database config imported');

// Import route modules
const authRoutes = require('./routes/auth');
const routeRoutes = require('./routes/routes');
const busRoutes = require('./routes/buses');
const tripRoutes = require('./routes/trips');

console.log('All routes imported successfully');

const app = express();
app.use(bodyParser.json());

// Routes
app.use('/auth', authRoutes);
app.use('/routes', routeRoutes);
app.use('/buses', busRoutes);
app.use('/trips', tripRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Bus Tracking API is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));