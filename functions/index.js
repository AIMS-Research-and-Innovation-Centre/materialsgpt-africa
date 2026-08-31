const { logger } = require("firebase-functions");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineString } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { FieldValue } = require("firebase-admin/firestore");
const { google } = require("googleapis");

initializeApp();

const submissionsSpreadsheetId = defineString("SUBMISSIONS_SPREADSHEET_ID", {
  description: "Google Sheets spreadsheet ID that receives MaterialsGPT Africa submissions."
});

const functionOptions = {
  region: "africa-south1",
  memory: "256MiB",
  timeoutSeconds: 60
};

const sheetsAuth = new google.auth.GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

let sheetsClient;

async function getSheetsClient() {
  if (!sheetsClient) {
    const authClient = await sheetsAuth.getClient();
    sheetsClient = google.sheets({
      version: "v4",
      auth: authClient
    });
  }
  return sheetsClient;
}

function timestampToIso(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value.seconds === "number") {
    const millis = value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
    return new Date(millis).toISOString();
  }
  return "";
}

function cell(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  return JSON.stringify(value);
}

function teamRow(id, data) {
  return [
    id,
    timestampToIso(data.createdAt),
    new Date().toISOString(),
    cell(data.name),
    cell(data.email),
    cell(data.institution),
    cell(data.team_name),
    cell(data.skills),
    cell(data.track),
    cell(data.path),
    cell(data.selected_challenge_id),
    cell(data.team_interest)
  ];
}

function challengeRow(id, data) {
  return [
    id,
    timestampToIso(data.createdAt),
    new Date().toISOString(),
    cell(data.name),
    cell(data.email),
    cell(data.institution),
    cell(data.challenge_role),
    cell(data.challenge_title),
    cell(data.problem),
    cell(data.african_context),
    cell(data.desired_outcome),
    cell(data.domain),
    cell(data.track),
    cell(data.status || "pending")
  ];
}

async function appendSubmission({ snapshot, id, data, range, row, syncType }) {
  const spreadsheetId = submissionsSpreadsheetId.value();
  if (!spreadsheetId) {
    throw new Error("SUBMISSIONS_SPREADSHEET_ID is not configured.");
  }

  if (data.sheetSync?.status === "synced") {
    logger.info("Submission already marked as synced; skipping.", { id, syncType });
    return;
  }

  const sheets = await getSheetsClient();

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [row]
      }
    });

    await snapshot.ref.set({
      sheetSync: {
        status: "synced",
        spreadsheetId,
        range,
        syncedAt: FieldValue.serverTimestamp()
      }
    }, { merge: true });

    logger.info("Submission synced to Google Sheets.", { id, syncType, range });
  } catch (error) {
    await snapshot.ref.set({
      sheetSync: {
        status: "error",
        range,
        message: String(error.message || error).slice(0, 500),
        attemptedAt: FieldValue.serverTimestamp()
      }
    }, { merge: true }).catch((writeError) => {
      logger.error("Failed to record Sheets sync error on Firestore document.", writeError);
    });

    logger.error("Failed to sync submission to Google Sheets.", error);
    throw error;
  }
}

exports.syncTeamSubmissionToSheet = onDocumentCreated({
  ...functionOptions,
  document: "teams/{submissionId}"
}, async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    logger.warn("Team submission event had no snapshot.", { params: event.params });
    return;
  }

  const data = snapshot.data();
  const id = event.params.submissionId;
  await appendSubmission({
    snapshot,
    id,
    data,
    range: "'Team Applications'!A:L",
    row: teamRow(id, data),
    syncType: "team"
  });
});

exports.syncChallengeSubmissionToSheet = onDocumentCreated({
  ...functionOptions,
  document: "challenges/{submissionId}"
}, async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    logger.warn("Challenge submission event had no snapshot.", { params: event.params });
    return;
  }

  const data = snapshot.data();
  const id = event.params.submissionId;
  await appendSubmission({
    snapshot,
    id,
    data,
    range: "'Challenge Proposals'!A:N",
    row: challengeRow(id, data),
    syncType: "challenge"
  });
});
