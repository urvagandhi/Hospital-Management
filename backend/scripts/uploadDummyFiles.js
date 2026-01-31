/**
 * Upload Dummy Files Script
 * Creates sample files in Cloudflare R2 for patients
 * Run: node scripts/uploadDummyFiles.js
 */

import mongoose from "mongoose";
import Patient from "../src/models/Patient.js";
import { uploadFile } from "../src/services/r2.service.js";
import config from "../src/config/env.js";

// Dummy file content (medical documents)
const dummyFiles = [
  {
    fileName: "patient-id-card.pdf",
    folder: "id",
    content: Buffer.from(`%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/Resources <<
/Font <<
/F1 4 0 R
>>
>>
/MediaBox [0 0 612 792]
/Contents 5 0 R
>>
endobj
4 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj
5 0 obj
<<
/Length 100
>>
stream
BT
/F1 24 Tf
100 700 Td
(Patient ID Card - Medical Record) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000274 00000 n
0000000351 00000 n
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
503
%%EOF`),
    mimeType: "application/pdf",
  },
  {
    fileName: "insurance-claim-form.pdf",
    folder: "claim paper",
    content: Buffer.from(`%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/Resources <<
/Font <<
/F1 4 0 R
>>
>>
/MediaBox [0 0 612 792]
/Contents 5 0 R
>>
endobj
4 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj
5 0 obj
<<
/Length 120
>>
stream
BT
/F1 24 Tf
100 700 Td
(Insurance Claim Form) Tj
/F1 12 Tf
100 650 Td
(Date: 2025-11-22) Tj
100 630 Td
(Claim Amount: $1,500.00) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000274 00000 n
0000000351 00000 n
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
523
%%EOF`),
    mimeType: "application/pdf",
  },
  {
    fileName: "hospital-bill-january.pdf",
    folder: "hospital bills",
    content: Buffer.from(`%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/Resources <<
/Font <<
/F1 4 0 R
>>
>>
/MediaBox [0 0 612 792]
/Contents 5 0 R
>>
endobj
4 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj
5 0 obj
<<
/Length 150
>>
stream
BT
/F1 24 Tf
100 700 Td
(Hospital Bill - January 2025) Tj
/F1 12 Tf
100 650 Td
(Consultation Fee: $200) Tj
100 630 Td
(Lab Tests: $350) Tj
100 610 Td
(Total: $550.00) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000274 00000 n
0000000351 00000 n
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
553
%%EOF`),
    mimeType: "application/pdf",
  },
  {
    fileName: "discharge-summary.pdf",
    folder: "discharge summary",
    content: Buffer.from(`%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/Resources <<
/Font <<
/F1 4 0 R
>>
>>
/MediaBox [0 0 612 792]
/Contents 5 0 R
>>
endobj
4 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj
5 0 obj
<<
/Length 200
>>
stream
BT
/F1 24 Tf
100 700 Td
(Discharge Summary) Tj
/F1 12 Tf
100 650 Td
(Patient Name: John Doe) Tj
100 630 Td
(Admission Date: 2025-11-15) Tj
100 610 Td
(Discharge Date: 2025-11-20) Tj
100 590 Td
(Diagnosis: Recovery from surgery) Tj
100 570 Td
(Condition at discharge: Stable) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000274 00000 n
0000000351 00000 n
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
603
%%EOF`),
    mimeType: "application/pdf",
  },
  {
    fileName: "blood-test-report.pdf",
    folder: "reports",
    content: Buffer.from(`%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/Resources <<
/Font <<
/F1 4 0 R
>>
>>
/MediaBox [0 0 612 792]
/Contents 5 0 R
>>
endobj
4 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj
5 0 obj
<<
/Length 180
>>
stream
BT
/F1 24 Tf
100 700 Td
(Blood Test Report) Tj
/F1 12 Tf
100 650 Td
(Date: 2025-11-22) Tj
100 630 Td
(Hemoglobin: 14.5 g/dL (Normal)) Tj
100 610 Td
(Blood Sugar: 95 mg/dL (Normal)) Tj
100 590 Td
(Cholesterol: 180 mg/dL (Normal)) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000274 00000 n
0000000351 00000 n
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
583
%%EOF`),
    mimeType: "application/pdf",
  },
  {
    fileName: "prescription-november.pdf",
    folder: "medical prescription & bills",
    content: Buffer.from(`%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/Resources <<
/Font <<
/F1 4 0 R
>>
>>
/MediaBox [0 0 612 792]
/Contents 5 0 R
>>
endobj
4 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj
5 0 obj
<<
/Length 170
>>
stream
BT
/F1 24 Tf
100 700 Td
(Medical Prescription) Tj
/F1 12 Tf
100 650 Td
(Date: 2025-11-22) Tj
100 630 Td
(Medication: Amoxicillin 500mg) Tj
100 610 Td
(Dosage: 3 times daily for 7 days) Tj
100 590 Td
(Dr. Smith - Medical License #12345) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000274 00000 n
0000000351 00000 n
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
573
%%EOF`),
    mimeType: "application/pdf",
  },
  {
    fileName: "consent-form-surgery.pdf",
    folder: "consent",
    content: Buffer.from(`%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/Resources <<
/Font <<
/F1 4 0 R
>>
>>
/MediaBox [0 0 612 792]
/Contents 5 0 R
>>
endobj
4 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj
5 0 obj
<<
/Length 200
>>
stream
BT
/F1 24 Tf
100 700 Td
(Surgery Consent Form) Tj
/F1 12 Tf
100 650 Td
(Patient Name: John Doe) Tj
100 630 Td
(Procedure: Appendectomy) Tj
100 610 Td
(Date: 2025-11-15) Tj
100 590 Td
(I consent to the above procedure) Tj
100 570 Td
(Signature: ___________________) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000274 00000 n
0000000351 00000 n
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
603
%%EOF`),
    mimeType: "application/pdf",
  },
];

const uploadDummyFiles = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.MONGODB_URI);
    console.log("✓ Connected to MongoDB");

    // Get all patients
    const patients = await Patient.find({});
    console.log(`\nFound ${patients.length} patients in database`);

    if (patients.length === 0) {
      console.log("✗ No patients found. Run seed script first!");
      process.exit(1);
    }

    let totalFilesUploaded = 0;

    for (const patient of patients) {
      console.log(`\nUploading files for patient: ${patient.patientName}`);

      for (const dummyFile of dummyFiles) {
        const key = `${patient.hospitalId}/${patient._id}/${dummyFile.folder}/${Date.now()}_${dummyFile.fileName}`;

        try {
          // Upload to R2
          const uploadResult = await uploadFile(dummyFile.content, key, dummyFile.mimeType);
          console.log(`  ✓ Uploaded ${dummyFile.fileName} to R2`);

          // Find the folder in patient document
          const folder = patient.folders.find((f) => f.name === dummyFile.folder);
          if (folder) {
            // Add file metadata to folder
            folder.files.push({
              fileName: dummyFile.fileName,
              fileUrl: uploadResult.url,
              size: dummyFile.content.length,
              mimeType: dummyFile.mimeType,
              uploadedAt: new Date(),
            });
            totalFilesUploaded++;
          } else {
            console.log(`  ⚠ Folder "${dummyFile.folder}" not found for patient`);
          }
        } catch (error) {
          console.log(`  ✗ Failed to upload ${dummyFile.fileName}:`, error.message);
        }
      }

      // Save patient with updated files
      await patient.save();
      console.log(`  ✓ Updated patient record in database`);
    }

    console.log(`\n✓ Successfully uploaded ${totalFilesUploaded} files across ${patients.length} patients`);
    process.exit(0);
  } catch (error) {
    console.error("✗ Upload failed:", error);
    process.exit(1);
  }
};

uploadDummyFiles();
