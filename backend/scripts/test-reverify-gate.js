
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hospital-management';

async function triggerReverifyGate() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully.');

    // Define minimal schemas
    const Hospital = mongoose.model('Hospital', new mongoose.Schema({ email: String }));
    const Session = mongoose.model('Session', new mongoose.Schema({
      authCodeVerifiedAt: Date,
      hospitalId: mongoose.Schema.Types.ObjectId,
      isActive: Boolean,
      platform: String
    }));

    const TARGET_EMAIL = 'admin@citymedical.com';
    const hospital = await Hospital.findOne({ email: TARGET_EMAIL });

    if (!hospital) {
      console.error(`❌ Hospital with email ${TARGET_EMAIL} not found!`);
      process.exit(1);
    }

    // Find the most recently active mobile session for THIS hospital
    const latestSession = await Session.findOne({ 
      hospitalId: hospital._id,
      platform: 'android',
      isActive: true 
    }).sort({ lastAccessedAt: -1 });

    if (!latestSession) {
      console.error(`❌ No active Android session found for ${TARGET_EMAIL}. Please log in on your phone first!`);
      process.exit(1);
    }

    console.log(`Found session for ${TARGET_EMAIL} (ID: ${latestSession.hospitalId})`);
    
    // Set verification time to 8 days ago
    const eightDaysAgo = new Date();
    eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

    latestSession.authCodeVerifiedAt = eightDaysAgo;
    await latestSession.save();

    console.log('✅ SUCCESS: Your session has been aged to 8 days ago.');
    console.log('👉 Now open your Android app. It should prompt you for the Auth Code.');

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

triggerReverifyGate();
