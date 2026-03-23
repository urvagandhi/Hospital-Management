/**
 * Database Configuration
 * Handles MongoDB connection setup and initialization
 */

import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || "mongodb://localhost:27017/hospital-management";
    console.log("[Database] Attempting to connect to MongoDB...");
    console.log("[Database] URI:", mongoURI.replace(/:([^@]+)@/, ":****@"));
    const connection = await mongoose.connect(mongoURI);

    console.log("[Database] ✓ MongoDB connected successfully");
    console.log("[Database] Host:", connection.connection.host);
    console.log("[Database] Database:", connection.connection.name);
    return connection;
  } catch (error) {
    console.error("[Database] ✗ MongoDB connection error:", error.message);
    console.error("[Database] Error details:", error);
    process.exit(1);
  }
};

export default connectDB;
