#!/usr/bin/env node
// Simple script to set CORS on a DigitalOcean Space (S3-compatible)
// Usage: DO_SPACES_ENDPOINT=... DO_SPACES_ACCESS_KEY_ID=... DO_SPACES_SECRET_ACCESS_KEY=... DO_SPACES_BUCKET=... node scripts/set_do_spaces_cors.js https://example.com

import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

const origin = process.argv[2] || process.env.FRONTEND_URL || "*";

const endpoint = process.env.DO_SPACES_ENDPOINT;
const accessKeyId = process.env.DO_SPACES_ACCESS_KEY_ID;
const secret = process.env.DO_SPACES_SECRET_ACCESS_KEY;
const bucket = process.env.DO_SPACES_BUCKET;
const region = process.env.DO_SPACES_REGION || "sfo3";

if (!endpoint || !accessKeyId || !secret || !bucket) {
    console.error("Missing DO_SPACES_* env vars. Set DO_SPACES_ENDPOINT, DO_SPACES_ACCESS_KEY_ID, DO_SPACES_SECRET_ACCESS_KEY and DO_SPACES_BUCKET.");
    process.exit(2);
}

const client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey: secret },
    forcePathStyle: false,
});

const cors = {
    CORSRules: [
        {
            AllowedHeaders: ["*"],
            AllowedMethods: ["GET", "PUT", "POST", "HEAD", "DELETE", "OPTIONS"],
            AllowedOrigins: [origin],
            ExposeHeaders: ["ETag", "x-amz-meta-*"],
            MaxAgeSeconds: 3600,
        },
    ],
};

async function run() {
    try {
        const cmd = new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: cors });
        await client.send(cmd);
        console.log(`CORS applied to bucket ${bucket} for origin ${origin}`);
    } catch (err) {
        console.error("Failed to set CORS:", err);
        process.exit(1);
    }
}

run();
