/**
 * Authentication Controller Tests
 * Jest test suite for auth.controller.js
 */

import request from "supertest";
import app from "../index.js";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server"; // Ideally use this, but for now let's use the real DB or mock
// Since I don't want to install new deps if possible, I'll use the real DB connection from config
import connectDB from "../config/db.js";
import Hospital from "../models/Hospital.js";
import AuditLog from "../models/AuditLog.js";
import { hashPassword } from "../utils/hash.js";

describe("Authentication Controller", () => {
  let testHospitalId;
  const testHospital = {
    hospitalName: "Test Hospital",
    email: "test@hospital.com",
    phone: "+919876543210",
    password: "Password123",
    logoUrl: "https://via.placeholder.com/150?text=Test",
  };

  beforeAll(async () => {
    // Connect to DB
    await connectDB();

    // Create test hospital
    const passwordHash = await hashPassword(testHospital.password);
    const hospital = await Hospital.create({
      hospitalName: testHospital.hospitalName,
      email: testHospital.email,
      phone: testHospital.phone,
      passwordHash,
      logoUrl: testHospital.logoUrl,
    });
    testHospitalId = hospital._id;
  });

  afterAll(async () => {
    // Cleanup
    await Hospital.deleteOne({ _id: testHospitalId });
    await AuditLog.deleteMany({ userId: testHospitalId });

    // Close DB connection
    await mongoose.connection.close();
  });

  describe("POST /api/auth/login", () => {
    it("should login successfully and send OTP", async () => {
      const response = await request(app).post("/api/auth/login").send({
        email: testHospital.email,
        password: testHospital.password,
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("tempToken");
      expect(response.body.data).toHaveProperty("phone");
      expect(response.body.data).toHaveProperty("expiresAt");
    });

    it("should fail with invalid email", async () => {
      const response = await request(app).post("/api/auth/login").send({
        email: "invalid-email",
        password: testHospital.password,
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should fail with wrong password", async () => {
      const response = await request(app).post("/api/auth/login").send({
        email: testHospital.email,
        password: "WrongPassword",
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
    it("should lock account after 5 failed attempts", async () => {
      // Reset failed attempts first
      await Hospital.updateOne({ _id: testHospitalId }, { failedLoginAttempts: 0, lockUntil: null });

      // Fail 5 times
      for (let i = 0; i < 5; i++) {
        await request(app).post("/api/auth/login").send({
          email: testHospital.email,
          password: "WrongPassword",
        });
      }

      // 6th attempt should be locked
      const response = await request(app).post("/api/auth/login").send({
        email: testHospital.email,
        password: testHospital.password, // Correct password
      });

      expect(response.status).toBe(423);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("Account is locked");
    });

    it("should log audit events", async () => {
      const logs = await AuditLog.find({ userId: testHospitalId });
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe("POST /api/auth/verify-otp", () => {
    it("should fail without temp token", async () => {
      const response = await request(app).post("/api/auth/verify-otp").send({
        otp: "123456",
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should fail with invalid refresh token", async () => {
      const response = await request(app).post("/api/auth/refresh-token").send({
        refreshToken: "invalid-token",
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
});
