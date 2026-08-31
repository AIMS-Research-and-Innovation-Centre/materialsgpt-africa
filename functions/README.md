# MaterialsGPT Africa submission sync

This Firebase Functions backend copies new Firestore submissions into a Google Sheet.

## What it watches

- `teams/{submissionId}` -> `Team Applications` tab
- `challenges/{submissionId}` -> `Challenge Proposals` tab

## Required setup

1. Upgrade the Firebase project to the Blaze plan before deploying Cloud Functions.
2. Enable the Google Sheets API in the Google Cloud project.
3. Create `functions/.env` from `functions/.env.example` and set:

   ```txt
   SUBMISSIONS_SPREADSHEET_ID=YOUR_SPREADSHEET_ID
   ```

4. Share the Google Sheet with the Cloud Functions 2nd gen default service account as an editor:

   ```txt
   123872073212-compute@developer.gserviceaccount.com
   ```

5. Install dependencies:

   ```sh
   cd functions
   npm install
   ```

6. Deploy the functions:

   ```sh
   firebase deploy --only functions
   ```

## Verification

After deployment, submit a test application from the live site. The Firestore document should gain a `sheetSync.status` value of `synced`, and a new row should appear in the corresponding Google Sheet tab.
