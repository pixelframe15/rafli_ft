import express from "express";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

console.log("GOOGLE_CLIENT_ID set:", !!process.env.GOOGLE_CLIENT_ID);
console.log("GOOGLE_CLIENT_SECRET set:", !!process.env.GOOGLE_CLIENT_SECRET);
console.log("APP_URL:", process.env.APP_URL);

// Google OAuth setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL}/auth/callback`
);

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.file"];

// Auth URL endpoint
app.get("/api/auth/url", (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ 
      error: "Google Client ID atau Secret belum disetel di panel Secrets AI Studio." 
    });
  }

  const redirectUri = `${process.env.APP_URL}/auth/callback`;
  
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    redirect_uri: redirectUri, // Explicitly pass redirect_uri
  });
  res.json({ url });
});

// Auth callback endpoint
app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const redirectUri = `${process.env.APP_URL}/auth/callback`;
    const { tokens } = await oauth2Client.getToken({
      code: code as string,
      redirect_uri: redirectUri,
    });
    // In a real app, we'd store this in a session or DB.
    // For this demo, we'll send it back to the client to store in localStorage (not secure for production, but works for demo)
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_SUCCESS', tokens: ${JSON.stringify(tokens)} }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error getting tokens:", error);
    res.status(500).send("Authentication failed");
  }
});

// Google Sheets API proxy
app.post("/api/sheets/append", async (req, res) => {
  const { tokens, spreadsheetId, range, values } = req.body;
  if (!tokens) return res.status(401).json({ error: "No tokens" });

  try {
    oauth2Client.setCredentials(tokens);
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });
    res.json(result.data);
  } catch (error: any) {
    console.error("Sheets API error:", error);
    const message = error.response?.data?.error?.message || error.message;
    res.status(500).json({ error: message });
  }
});

app.post("/api/sheets/get", async (req, res) => {
  const { tokens, spreadsheetId, range } = req.body;
  if (!tokens) return res.status(401).json({ error: "No tokens" });

  try {
    oauth2Client.setCredentials(tokens);
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    res.json(result.data);
  } catch (error: any) {
    console.error("Sheets API error:", error);
    // Return a more descriptive error if possible
    const message = error.response?.data?.error?.message || error.message;
    res.status(500).json({ error: message });
  }
});

app.post("/api/sheets/create", async (req, res) => {
  const { tokens, title } = req.body;
  if (!tokens) return res.status(401).json({ error: "No tokens" });

  try {
    oauth2Client.setCredentials(tokens);
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title },
        sheets: [
          {
            properties: {
              title: "Transactions",
              gridProperties: { rowCount: 1000, columnCount: 6 },
            },
          },
        ],
      },
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    // Add headers
    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId!,
      range: "Transactions!A1:F1",
      valueInputOption: "RAW",
      requestBody: {
        values: [["Date", "Description", "Category", "Type", "Amount", "Note"]],
      },
    });

    res.json({ spreadsheetId });
  } catch (error: any) {
    console.error("Sheets API error:", error);
    const message = error.response?.data?.error?.message || error.message;
    res.status(500).json({ error: message });
  }
});

app.post("/api/sheets/init", async (req, res) => {
  const { tokens, spreadsheetId } = req.body;
  if (!tokens || !spreadsheetId) return res.status(400).json({ error: "Missing tokens or spreadsheetId" });

  try {
    oauth2Client.setCredentials(tokens);
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });
    
    // Check if sheet exists
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetExists = spreadsheet.data.sheets?.some(s => s.properties?.title === "Transactions");

    if (!sheetExists) {
      // Add the sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: "Transactions",
                  gridProperties: { rowCount: 1000, columnCount: 6 },
                },
              },
            },
          ],
        },
      });
    }

    // Always try to update headers (in case it's a new sheet or empty)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Transactions!A1:F1",
      valueInputOption: "RAW",
      requestBody: {
        values: [["Date", "Description", "Category", "Type", "Amount", "Note"]],
      },
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("Sheets API error:", error);
    const message = error.response?.data?.error?.message || error.message;
    res.status(500).json({ error: message });
  }
});

app.post("/api/sheets/delete", async (req, res) => {
  const { tokens, spreadsheetId, rowIndex } = req.body;
  if (!tokens || !spreadsheetId || rowIndex === undefined) {
    return res.status(400).json({ error: "Missing tokens, spreadsheetId or rowIndex" });
  }

  try {
    oauth2Client.setCredentials(tokens);
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });
    
    // Get the sheet ID for "Transactions"
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === "Transactions");
    
    if (!sheet) {
      return res.status(404).json({ error: "Sheet 'Transactions' not found" });
    }

    const sheetId = sheet.properties?.sheetId;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowIndex,
                endIndex: rowIndex + 1,
              },
            },
          },
        ],
      },
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("Sheets API error:", error);
    const message = error.response?.data?.error?.message || error.message;
    res.status(500).json({ error: message });
  }
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(__dirname, "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
