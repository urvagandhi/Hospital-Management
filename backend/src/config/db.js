/**
 * Database Configuration
 * Handles MongoDB connection setup and initialization
 */

import mongoose from "mongoose";
import logger from "../utils/logger.js";

const connectDB = async () => {
  const mongoURI = process.env.MONGODB_URI || "mongodb://localhost:27017/hospital-management";
  const redactedURI = mongoURI.replace(/:([^@]+)@/, ":****@");
  try {
    logger.info({ event: "db_connect_attempt", uri: redactedURI }, "[Database] Attempting to connect to MongoDB...");
    const connection = await mongoose.connect(mongoURI);

    logger.info(
      {
        event: "db_connected",
        host: connection.connection.host,
        database: connection.connection.name,
      },
      "[Database] MongoDB connected successfully"
    );
    return connection;
  } catch (error) {
    logger.error(
      { event: "db_connect_failed", err: error },
      `[Database] MongoDB connection error: ${error.message}`
    );
    process.exit(1);
  }
};

export default connectDB;
