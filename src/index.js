import fs from "fs";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import http from "http";
import open from "open";
import { URL } from "url";

const SCOPE = ["https://www.googleapis.com/auth/youtube"];
const CLIENT_SECRET_FILE = "data/client_secret.json";
const TOKEN_FILE = "data/token.json";

function enableDestroy(server) {
  const connections = new Map();

  server.on("connection", (conn) => {
    const key = `${conn.remoteAddress}:${conn.remotePort}`;
    connections.set(key, conn);
    conn.on("close", () => {
      connections.delete(key);
    });
  });

  server.destroy = (cb) => {
    server.close(cb);
    for (const conn of connections.values()) {
      conn.destroy();
    }
  };
}

async function loadClientCredentials(clientSecretFile) {
  const { installed, web } = JSON.parse(fs.readFileSync(clientSecretFile, "utf8"));
  return installed || web;
}

async function createOAuth2Client({ client_id, client_secret }) {
  return new OAuth2Client({ clientId: client_id, clientSecret: client_secret });
}

async function loadToken(tokenFile) {
  return JSON.parse(fs.readFileSync(tokenFile, "utf8"));
}

async function saveToken(tokenFile, token) {
  fs.writeFileSync(tokenFile, JSON.stringify(token, null, 2));
}

async function authenticate(clientSecretFile, tokenFile, scope) {
  const { client_id, client_secret, redirect_uris } = await loadClientCredentials(clientSecretFile);
  const oauth2Client = await createOAuth2Client({ client_id, client_secret });
  const redirectUri = new URL(redirect_uris[0]);

  if (fs.existsSync(tokenFile)) {
    const token = await loadToken(tokenFile);
    oauth2Client.setCredentials(token);
    oauth2Client.on("tokens", async ({ refresh_token, access_token, expiry_date }) => {
      if (refresh_token) token.refresh_token = refresh_token;
      if (access_token) {
        token.access_token = access_token;
        token.expiry_date = expiry_date;
        await saveToken(tokenFile, token);
      }
    });

    return oauth2Client;
  }

  return authenticateWithServer(oauth2Client, tokenFile, redirectUri, scope);
}

async function authenticateWithServer(oauth2Client, tokenFile, redirectUri, scope) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost:3000");
      const code = url.searchParams.get("code");
      const { tokens } = await oauth2Client.getToken({ code, redirect_uri: redirectUri.toString() });
      oauth2Client.setCredentials(tokens);
      await saveToken(tokenFile, tokens);
      res.end("Authentication successful! Please return to the console.");
    } catch (e) {
      console.error(e);
      res.statusCode = 500;
      res.end("Authentication failed");
    } finally {
      server.destroy();
    }
  });

  server.listen(Number(redirectUri.port), async () => {
    const authUrl = oauth2Client.generateAuthUrl({
      redirect_uri: redirectUri.toString(),
      access_type: "offline",
      prompt: "consent",
      scope,
    });
    await open(authUrl, { wait: false });
  });
  enableDestroy(server);

  return new Promise((resolve) => {
    server.on("close", () => {
      resolve(oauth2Client);
    });
  });
}

export async function getYoutube(clientSecretFile = CLIENT_SECRET_FILE, token_file = TOKEN_FILE) {
  const oAuth2Client = await authenticate(clientSecretFile, token_file, SCOPE);
  return google.youtube({ version: "v3", auth: oAuth2Client });
}
