/**
 * Hospitals Controller
 * Handles hospital management operations
 */

import Hospital from "../models/Hospital.js";

/**
 * Get all hospitals
 * GET /api/hospitals
 */
export const getAllHospitals = async (req, res) => {
  try {
    const hospitals = await Hospital.find().select("-passwordHash -fcmToken -biometricKeys -failedLoginAttempts -lockUntil -__v").sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: hospitals,
      count: hospitals.length,
    });
  } catch (error) {
    console.error("Get hospitals error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch hospitals",
    });
  }
};

/**
 * Get current authenticated hospital
 * GET /api/hospitals/me
 */
export const getCurrentHospital = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;

    if (!hospitalId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const hospital = await Hospital.findById(hospitalId).select("-passwordHash -failedLoginAttempts -lockUntil -__v");

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: hospital,
    });
  } catch (error) {
    console.error("Get current hospital error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch hospital",
    });
  }
};

/**
 * Get hospital by ID
 * GET /api/hospitals/:id
 */
export const getHospitalById = async (req, res) => {
  try {
    const { id } = req.params;

    const hospital = await Hospital.findById(id).select("-passwordHash -failedLoginAttempts -lockUntil -__v");

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: hospital,
    });
  } catch (error) {
    console.error("Get hospital error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch hospital",
    });
  }
};

/**
 * Update hospital details
 * PUT /api/hospitals/:id
 * Authorization: verifyAdminOrSelf middleware ensures only admin or the hospital itself can update
 */
export const updateHospital = async (req, res) => {
  try {
    const { id } = req.params;
    const { hospitalName, email, phone, address, isActive } = req.body;

    // Validate inputs
    if (!hospitalName || !email || !phone || !address) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Normalize phone: strip formatting, prepend +91 if bare 10 digits
    const phoneDigits = phone.replace(/[^\d]/g, "");
    let normalizedPhone;
    if (phoneDigits.length === 10) {
      normalizedPhone = `+91${phoneDigits}`;
    } else if (phone.startsWith("+") && phoneDigits.length === 12 && phoneDigits.startsWith("91")) {
      normalizedPhone = `+${phoneDigits}`;
    } else {
      return res.status(400).json({
        success: false,
        message: "Phone number must be 10 digits",
      });
    }

    // Check if hospital exists
    const hospital = await Hospital.findById(id);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    // Check if email is already taken by another hospital
    if (email !== hospital.email) {
      const existingHospital = await Hospital.findOne({
        email: email.toLowerCase(),
        _id: { $ne: id },
      });
      if (existingHospital) {
        return res.status(409).json({
          success: false,
          message: "This email is already registered by another hospital",
        });
      }
    }

    // Check if phone is already taken by another hospital
    if (normalizedPhone !== hospital.phone) {
      const existingPhone = await Hospital.findOne({
        phone: normalizedPhone,
        _id: { $ne: id },
      });
      if (existingPhone) {
        return res.status(409).json({
          success: false,
          message: "This phone number is already registered by another hospital",
        });
      }
    }

    // Update hospital
    hospital.hospitalName = hospitalName;
    hospital.email = email.toLowerCase();
    hospital.phone = normalizedPhone;
    hospital.address = address;

    // Only admins can change isActive status
    if (!req.isSelf && isActive !== undefined) {
      hospital.isActive = isActive;
    }

    // Handle logo upload if provided
    if (req.file) {
      const base64Logo = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
      hospital.logoUrl = base64Logo;
    }

    await hospital.save();

    return res.status(200).json({
      success: true,
      message: "Hospital updated successfully",
      data: hospital,
    });
  } catch (error) {
    console.error("Update hospital error:", error);

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      let message = "This information is already registered";

      if (field === "email") {
        message = "This email address is already registered by another hospital";
      } else if (field === "phone") {
        message = "This phone number is already registered by another hospital";
      }

      return res.status(409).json({
        success: false,
        message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update hospital",
    });
  }
};

export default {
  getAllHospitals,
  getCurrentHospital,
  getHospitalById,
  updateHospital,
};
