#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from 'url';
import fsSync from 'fs';
import dotenv from 'dotenv';

// 1. LOAD ENV IMMEDIATELY (Minimal change for local/server compatibility)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const possiblePaths = [
  path.resolve(__dirname, '../.env'),    // backend/.env
  path.resolve(__dirname, '../../.env')  // root/.env
];
let envPath = possiblePaths.find(p => fsSync.existsSync(p));
if (envPath) dotenv.config({ path: envPath });

const DEFAULT_BASE_URL = "http://localhost:5000/api";
const DEFAULT_PATIENT_SEARCH = "Urva";
const DEFAULT_FOLDER_NAME = "others";
const DEFAULT_FILE_SIZE_MB = 9;

function parseArgs(argv) {
    const options = {};
    for (const arg of argv) {
        if (!arg.startsWith("--")) continue;
        const raw = arg.slice(2);
        const equalsIndex = raw.indexOf("=");
        if (equalsIndex === -1) {
            options[raw] = true;
            continue;
        }
        const key = raw.slice(0, equalsIndex);
        const value = raw.slice(equalsIndex + 1);
        options[key] = value;
    }
    return options;
}

function requireValue(value, name) {
    if (!value) {
        throw new Error(`Missing required ${name}. Pass it as --${name}=...`);
    }
    return value;
}

function mb(bytes) {
    return (bytes / (1024 * 1024)).toFixed(2);
}

function logSection(title) {
    const line = "═".repeat(72);
    console.log(`\n${line}\n${title}\n${line}`);
}

function summarizeError(error, fallbackMessage) {
    if (!error) return fallbackMessage;
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "string" && error.trim()) return error;
    return fallbackMessage;
}

async function readJsonResponse(response) {
    const text = await response.text();
    let body;
    try {
        body = text ? JSON.parse(text) : {};
    } catch {
        body = { raw: text };
    }
    return { status: response.status, ok: response.ok, body, text };
}

async function postJson(url, body, headers = {}) {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
        body: JSON.stringify(body),
    });
    return readJsonResponse(response);
}

async function getJson(url, headers = {}) {
    const response = await fetch(url, { headers });
    return readJsonResponse(response);
}

async function uploadMultipart(url, formData, headers = {}) {
    const response = await fetch(url, {
        method: "POST",
        headers,
        body: formData,
    });
    return readJsonResponse(response);
}

async function ensureTestFile(filePath, sizeBytes) {
    const header = Buffer.from("%PDF-1.4\n% HSM smoke test file\n");
    if (sizeBytes <= header.length + 32) {
        throw new Error(`Requested file size (${sizeBytes}) is too small to build a valid smoke file`);
    }

    const payload = Buffer.concat([
        header,
        crypto.randomBytes(sizeBytes - header.length),
    ]);
    await fs.writeFile(filePath, payload);
    return payload;
}

function findFileEntry(patientResponse, fileName) {
    const folders = patientResponse?.data?.folders || [];
    for (const folder of folders) {
        for (const file of folder.files || []) {
            if (file.fileName === fileName) {
                return { folderName: folder.folderName || folder.name || "unknown", file };
            }
        }
    }
    return null;
}

async function loginAndVerify(baseUrl, email, password, authCode) {
    logSection("AUTHENTICATION");
    const login = await postJson(`${baseUrl}/auth/login`, {
        identifier: email,
        password,
    });

    console.log(`login status: ${login.status}`);
    console.log(`login body: ${JSON.stringify(login.body)}`);

    if (!login.ok) {
        throw new Error(`Login failed: HTTP ${login.status}`);
    }

    const tempToken = login.body?.data?.tempToken;
    if (!tempToken) {
        throw new Error("Login response did not include a tempToken");
    }

    const verify = await postJson(
        `${baseUrl}/auth/login/verify-auth-code`,
        { authCode },
        { Authorization: `Bearer ${tempToken}` },
    );

    console.log(`verify status: ${verify.status}`);
    console.log(`verify body keys: ${Object.keys(verify.body || {}).join(", ")}`);

    if (!verify.ok) {
        throw new Error(`Auth code verification failed: HTTP ${verify.status}`);
    }

    const accessToken = verify.body?.data?.accessToken;
    const refreshToken = verify.body?.data?.refreshToken;
    const hospital = verify.body?.data?.hospital;

    if (!accessToken || !refreshToken || !hospital?._id) {
        throw new Error("Auth code verification response was missing session data");
    }

    console.log(`authenticated hospital: ${hospital.hospitalName || hospital.email || hospital._id}`);
    console.log(`access token length: ${accessToken.length}`);
    return { accessToken, hospital };
}

async function findPatient(baseUrl, accessToken, search) {
    logSection("PATIENT LOOKUP");
    const response = await getJson(
        `${baseUrl}/patients?limit=50&search=${encodeURIComponent(search)}`,
        { Authorization: `Bearer ${accessToken}` },
    );

    console.log(`patient search status: ${response.status}`);
    if (!response.ok) {
        throw new Error(`Patient search failed: HTTP ${response.status}`);
    }

    const patients = response.body?.data?.patients || [];
    console.log(`matches: ${patients.length}`);
    patients.slice(0, 5).forEach((patient, index) => {
        console.log(`  [${index}] ${patient.patientName} :: ${patient.patientId} :: ${patient._id}`);
    });

    const patient = patients.find((item) => /Urva/i.test(item.patientName || "")) || patients[0];
    if (!patient?._id) {
        throw new Error(`No patient matched search term: ${search}`);
    }

    console.log(`selected patient: ${patient.patientName} (${patient._id})`);
    return patient;
}

async function fetchPatientDetails(baseUrl, accessToken, patientId) {
    const response = await getJson(
        `${baseUrl}/patients/${patientId}`,
        { Authorization: `Bearer ${accessToken}` },
    );
    if (!response.ok) {
        throw new Error(`Fetching patient ${patientId} failed: HTTP ${response.status}`);
    }
    return response.body;
}

function folderExists(patientDetails, folderName) {
    const folders = patientDetails?.data?.folders || [];
    return folders.some((folder) => (folder.folderName || folder.name || "").toLowerCase() === folderName.toLowerCase());
}

async function ensureFolder(baseUrl, accessToken, patientId, patientDetails, folderName) {
    logSection("FOLDER SETUP");
    if (folderExists(patientDetails, folderName)) {
        console.log(`folder already exists: ${folderName}`);
        return patientDetails;
    }

    console.log(`creating folder: ${folderName}`);
    const response = await postJson(
        `${baseUrl}/patients/${patientId}/folders`,
        { folderName },
        { Authorization: `Bearer ${accessToken}` },
    );
    console.log(`create folder status: ${response.status}`);
    console.log(`create folder body: ${JSON.stringify(response.body)}`);

    if (!response.ok) {
        throw new Error(`Folder creation failed: HTTP ${response.status}`);
    }

    return response.body;
}

async function uploadViaBackend(baseUrl, accessToken, patientId, folderName, filePath, fileName, fileSizeBytes) {
    logSection("BACKEND PROXY UPLOAD");
    const fileBuffer = await fs.readFile(filePath);
    const form = new FormData();
    form.append(
        "file",
        new Blob([fileBuffer], { type: "application/pdf" }),
        fileName,
    );

    const idempotencyKey = `smoke-backend-${Date.now()}-${crypto.randomUUID()}`;
    const startedAt = Date.now();

    const response = await uploadMultipart(
        `${baseUrl}/patients/${patientId}/files/${encodeURIComponent(folderName)}`,
        form,
        {
            Authorization: `Bearer ${accessToken}`,
            "Idempotency-Key": idempotencyKey,
        },
    );

    const durationMs = Date.now() - startedAt;
    console.log(`status: ${response.status}`);
    console.log(`duration: ${durationMs}ms`);
    console.log(`body: ${JSON.stringify(response.body)}`);

    if (!response.ok) {
        throw new Error(`Backend proxy upload failed: HTTP ${response.status}`);
    }

    const patient = response.body?.data;
    const entry = findFileEntry({ data: patient }, fileName);
    console.log(`file present in returned patient: ${Boolean(entry)}`);
    if (entry) {
        console.log(`folder: ${entry.folderName}`);
        console.log(`stored size: ${entry.file.size} bytes (${mb(entry.file.size)} MB)`);
    }

    return {
        status: response.status,
        durationMs,
        patient,
        idempotencyKey,
        fileName,
        fileSizeBytes,
    };
}

async function uploadDirect(baseUrl, accessToken, patientId, folderName, filePath, fileName, fileSizeBytes) {
    logSection("DIRECT CLOUDINARY UPLOAD");
    const signStartedAt = Date.now();
    const signResponse = await postJson(
        `${baseUrl}/patients/${patientId}/files/${encodeURIComponent(folderName)}/sign`,
        { fileName },
        { Authorization: `Bearer ${accessToken}` },
    );

    const signDurationMs = Date.now() - signStartedAt;
    console.log(`sign status: ${signResponse.status}`);
    console.log(`sign duration: ${signDurationMs}ms`);
    console.log(`sign body: ${JSON.stringify(signResponse.body)}`);

    if (!signResponse.ok) {
        throw new Error(`Sign request failed: HTTP ${signResponse.status}`);
    }

    const params = signResponse.body?.params;
    if (!params?.uploadUrl || !params?.apiKey || !params?.signature || !params?.timestamp || !params?.publicId) {
        throw new Error("Sign response was missing Cloudinary upload parameters");
    }

    const fileBuffer = await fs.readFile(filePath);
    const cloudinaryForm = new FormData();
    cloudinaryForm.append(
        "file",
        new Blob([fileBuffer], { type: "application/pdf" }),
        fileName,
    );
    cloudinaryForm.append("api_key", params.apiKey);
    cloudinaryForm.append("signature", params.signature);
    cloudinaryForm.append("timestamp", String(params.timestamp));
    cloudinaryForm.append("public_id", params.publicId);
    cloudinaryForm.append("type", params.type || "upload");

    const uploadStartedAt = Date.now();
    const cloudinaryResponse = await uploadMultipart(params.uploadUrl, cloudinaryForm);
    const uploadDurationMs = Date.now() - uploadStartedAt;
    console.log(`cloudinary status: ${cloudinaryResponse.status}`);
    console.log(`cloudinary duration: ${uploadDurationMs}ms`);
    console.log(`cloudinary body: ${JSON.stringify(cloudinaryResponse.body)}`);

    if (!cloudinaryResponse.ok) {
        throw new Error(`Cloudinary upload failed: HTTP ${cloudinaryResponse.status}`);
    }

    const secureUrl = cloudinaryResponse.body?.secure_url;
    const cloudinaryPublicId = cloudinaryResponse.body?.public_id || params.publicId;
    if (!secureUrl) {
        throw new Error("Cloudinary response did not include secure_url");
    }

    const confirmStartedAt = Date.now();
    const confirmResponse = await postJson(
        `${baseUrl}/patients/${patientId}/files/${encodeURIComponent(folderName)}/confirm`,
        {
            publicId: cloudinaryPublicId,
            secureUrl,
            originalFileName: fileName,
            size: fileSizeBytes,
            mimeType: "application/pdf",
        },
        {
            Authorization: `Bearer ${accessToken}`,
            "Idempotency-Key": `smoke-direct-${Date.now()}-${crypto.randomUUID()}`,
        },
    );
    const confirmDurationMs = Date.now() - confirmStartedAt;
    console.log(`confirm status: ${confirmResponse.status}`);
    console.log(`confirm duration: ${confirmDurationMs}ms`);
    console.log(`confirm body: ${JSON.stringify(confirmResponse.body)}`);

    if (!confirmResponse.ok) {
        throw new Error(`Confirm request failed: HTTP ${confirmResponse.status}`);
    }

    const patient = confirmResponse.body?.data;
    const entry = findFileEntry({ data: patient }, fileName);
    console.log(`file present in confirmed patient: ${Boolean(entry)}`);
    if (entry) {
        console.log(`folder: ${entry.folderName}`);
        console.log(`stored size: ${entry.file.size} bytes (${mb(entry.file.size)} MB)`);
    }

    return {
        signDurationMs,
        uploadDurationMs,
        confirmDurationMs,
        patient,
        publicId: cloudinaryPublicId,
        secureUrl,
        fileName,
        fileSizeBytes,
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const baseUrl = args.baseUrl || process.env.HMS_SMOKE_BASE_URL || DEFAULT_BASE_URL;
    const email = requireValue(args.email || process.env.HMS_SMOKE_EMAIL, "email");
    const password = requireValue(args.password || process.env.HMS_SMOKE_PASSWORD, "password");
    const authCode = requireValue(args.authCode || process.env.HMS_SMOKE_AUTH_CODE, "authCode");
    const patientSearch = args.patientSearch || process.env.HMS_SMOKE_PATIENT_SEARCH || DEFAULT_PATIENT_SEARCH;
    const folderName = args.folder || process.env.HMS_SMOKE_FOLDER || DEFAULT_FOLDER_NAME;
    const fileSizeMb = Number(args.fileSizeMb || process.env.HMS_SMOKE_FILE_SIZE_MB || DEFAULT_FILE_SIZE_MB);

    if (!Number.isFinite(fileSizeMb) || fileSizeMb <= 0) {
        throw new Error(`Invalid file size: ${args.fileSizeMb}`);
    }

    const fileSizeBytes = Math.floor(fileSizeMb * 1024 * 1024);
    const tempDir = "/tmp";
    const filePath = path.join(tempDir, `hms_smoke_${fileSizeMb}mb.pdf`);

    logSection("SMOKE CONFIG");
    console.log(`baseUrl: ${baseUrl}`);
    console.log(`email: ${email}`);
    console.log(`patientSearch: ${patientSearch}`);
    console.log(`folderName: ${folderName}`);
    console.log(`fileSizeMb: ${fileSizeMb}`);
    console.log(`testFile: ${filePath}`);

    const { accessToken } = await loginAndVerify(baseUrl, email, password, authCode);
    const patient = await findPatient(baseUrl, accessToken, patientSearch);
    const patientDetailsBefore = await fetchPatientDetails(baseUrl, accessToken, patient._id);
    const ensuredPatientDetails = await ensureFolder(baseUrl, accessToken, patient._id, patientDetailsBefore, folderName);

    const uploadBuffer = await ensureTestFile(filePath, fileSizeBytes);
    console.log(`generated test file: ${filePath}`);
    console.log(`generated size: ${uploadBuffer.length} bytes (${mb(uploadBuffer.length)} MB)`);

    const backendFileName = `hms-smoke-backend-${fileSizeMb}mb-${Date.now()}.pdf`;
    const directFileName = `hms-smoke-direct-${fileSizeMb}mb-${Date.now()}.pdf`;

    const beforeCount = ensuredPatientDetails?.data?.folders?.reduce((total, folder) => total + (folder.files?.length || 0), 0) || 0;
    console.log(`patient file count before uploads: ${beforeCount}`);

    const backendResult = await uploadViaBackend(
        baseUrl,
        accessToken,
        patient._id,
        folderName,
        filePath,
        backendFileName,
        fileSizeBytes,
    );

    const backendPatient = await fetchPatientDetails(baseUrl, accessToken, patient._id);
    const backendCount = backendPatient?.data?.folders?.reduce((total, folder) => total + (folder.files?.length || 0), 0) || 0;
    console.log(`patient file count after backend upload: ${backendCount}`);

    const directResult = await uploadDirect(
        baseUrl,
        accessToken,
        patient._id,
        folderName,
        filePath,
        directFileName,
        fileSizeBytes,
    );

    const finalPatient = await fetchPatientDetails(baseUrl, accessToken, patient._id);
    const finalCount = finalPatient?.data?.folders?.reduce((total, folder) => total + (folder.files?.length || 0), 0) || 0;
    console.log(`patient file count after direct upload: ${finalCount}`);

    const backendEntry = findFileEntry(backendPatient, backendFileName);
    const directEntry = findFileEntry(finalPatient, directFileName);

    logSection("RESULT SUMMARY");
    console.log(`backend proxy: ${backendResult.status === 200 ? "PASS" : "FAIL"}`);
    console.log(`direct Cloudinary: ${directResult.secureUrl ? "PASS" : "FAIL"}`);
    console.log(`backend file found: ${Boolean(backendEntry)}`);
    console.log(`direct file found: ${Boolean(directEntry)}`);
    console.log(`backend upload duration: ${backendResult.durationMs}ms`);
    console.log(`direct sign duration: ${directResult.signDurationMs}ms`);
    console.log(`direct upload duration: ${directResult.uploadDurationMs}ms`);
    console.log(`direct confirm duration: ${directResult.confirmDurationMs}ms`);
    console.log(`patient before: ${beforeCount}`);
    console.log(`patient after backend: ${backendCount}`);
    console.log(`patient after direct: ${finalCount}`);

    await fs.unlink(filePath).catch(() => { });
}

main().catch(async (error) => {
    console.error("\n❌ Smoke test failed:");
    console.error(summarizeError(error, "Unknown error"));
    await fs.unlink(path.join("/tmp", "hms_smoke_9mb.pdf")).catch(() => { });
    process.exitCode = 1;
});
