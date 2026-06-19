# Moonvine Forge Apps Script backend

This directory contains the private submission endpoint for the compact Forge editor.
The endpoint is deployed from a Google Sheet-bound Apps Script project. Raw submissions
stay in the private sheet and are not written to the public website repository.

## One-time setup

1. Create a private Google Sheet named `Moonvine Forge Submissions`.
2. In that sheet, open **Extensions -> Apps Script**.
3. Replace the contents of `Code.gs` with the complete contents of this repository's
   `apps-script/Code.gs` file.
4. Save the Apps Script project and name it `Moonvine Forge Submissions`.
5. Select the function `setupForgeBackend` and click **Run**.
6. Approve the requested Google Sheets permission.
7. Return to the sheet and verify that a `Submissions` tab with 22 header columns exists.
8. In Apps Script, choose **Deploy -> New deployment**.
9. Select **Web app** as the deployment type.
10. Set **Execute as** to **Me**.
11. Set access to **Anyone**.
12. Deploy and copy the URL ending in `/exec`.

Do not use the `/dev` test URL on the public website. The next website patch stores the
`/exec` URL in a small public configuration file; it does not expose access to the Google
account or the private sheet.

## Updating the deployment

After changing `Code.gs`, save it and edit the existing deployment to create a new version.
The `/exec` URL remains the integration URL.

## Data safety

- The server validates the complete submission again instead of trusting browser validation.
- A script lock prevents concurrent writes from colliding.
- Duplicate submission IDs return the existing public reference instead of adding a row.
- User-facing sheet cells are neutralized when they begin with formula characters.
- The full normalized payload is also stored as JSON for lossless processing.
- The web response contains no sheet contents and no Google credentials.
