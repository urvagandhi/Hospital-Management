/**
 * App Version Controller
 * Public GET /api/version — clients call on launch to check for updates.
 * Admin POST/PUT /api/version — manage version metadata.
 */

import AppVersion from "../models/AppVersion.js";

/** semver-like compare: returns -1, 0, or 1 */
function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/**
 * GET /api/version?platform=android&currentVersion=1.2.0
 * Public (no auth). Used by Android at launch.
 */
export const getVersion = async (req, res) => {
  try {
    const platform = String(req.query.platform || "android").toLowerCase();
    const currentVersion = String(req.query.currentVersion || "0.0.0");

    if (!["android", "ios"].includes(platform)) {
      return res.status(400).json({ success: false, message: "Invalid platform" });
    }

    const latest = await AppVersion.findOne({ platform }).sort({ createdAt: -1 }).lean();
    if (!latest) {
      return res.json({
        success: true,
        data: {
          updateRequired: false,
          forceUpdate: false,
          latestVersion: currentVersion,
          minVersion: currentVersion,
          updateUrl: "",
          releaseNotes: "",
        },
      });
    }

    const belowMin = compareVersions(currentVersion, latest.minVersion) < 0;
    const belowLatest = compareVersions(currentVersion, latest.latestVersion) < 0;

    return res.json({
      success: true,
      data: {
        updateRequired: belowLatest,
        forceUpdate: latest.forceUpdate || belowMin,
        latestVersion: latest.latestVersion,
        minVersion: latest.minVersion,
        updateUrl: latest.updateUrl || "",
        releaseNotes: latest.releaseNotes || "",
      },
    });
  } catch (err) {
    req.log.error({ event: "app_version_fetch_failed", err }, "[appVersion] getVersion error");
    return res.status(500).json({ success: false, message: "Failed to fetch version" });
  }
};

/** Admin: list version history */
export const listVersions = async (req, res) => {
  try {
    const platform = req.query.platform ? String(req.query.platform).toLowerCase() : null;
    const query = platform ? { platform } : {};
    const items = await AppVersion.find(query).sort({ createdAt: -1 }).limit(100).lean();
    return res.json({ success: true, data: items });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to list versions" });
  }
};

/** Admin: create new version entry */
export const createVersion = async (req, res) => {
  try {
    const { platform, minVersion, latestVersion, forceUpdate, updateUrl, releaseNotes } = req.body;
    if (!platform || !minVersion || !latestVersion) {
      return res.status(400).json({ success: false, message: "platform, minVersion, latestVersion are required" });
    }
    const entry = await AppVersion.create({
      platform: String(platform).toLowerCase(),
      minVersion,
      latestVersion,
      forceUpdate: !!forceUpdate,
      updateUrl: updateUrl || "",
      releaseNotes: releaseNotes || "",
    });
    return res.status(201).json({ success: true, data: entry });
  } catch (err) {
    req.log.error({ event: "app_version_create_failed", err }, "[appVersion] createVersion error");
    return res.status(500).json({ success: false, message: "Failed to create version" });
  }
};

/** Admin: update existing entry */
export const updateVersion = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};
    ["minVersion", "latestVersion", "forceUpdate", "updateUrl", "releaseNotes"].forEach((k) => {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    });
    const entry = await AppVersion.findByIdAndUpdate(id, updates, { new: true });
    if (!entry) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, data: entry });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to update version" });
  }
};
