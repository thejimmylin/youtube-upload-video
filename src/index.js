import fs from "fs";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import http from "http";
import open from "open";
import { URL } from "url";

const SCOPE = ["https://www.googleapis.com/auth/youtube"];
const CLIENT_SECRET_FILE = "data/client_secret.json";
const TOKEN_FILE = "data/token.json";

function getOAuth2Client(clientSecretFile) {
  const content = fs.readFileSync(clientSecretFile, "utf8");
  const credentials = JSON.parse(content);
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);
  return oAuth2Client;
}

function loadToken(tokenFile) {
  const content = fs.readFileSync(tokenFile, "utf8");
  const token = JSON.parse(content);
  return token;
}

function saveToken(tokenFile, token) {
  const content = JSON.stringify(token, null, 2);
  fs.writeFileSync(tokenFile, content);
}

async function authenticate(clientSecretFile, tokenFile, scope) {
  const oauth2Client = getOAuth2Client(clientSecretFile);
  const redirectUri = new URL(oauth2Client.redirectUri);

  if (fs.existsSync(tokenFile)) {
    const token = loadToken(tokenFile);
    oauth2Client.setCredentials(token);
    oauth2Client.on("tokens", ({ refresh_token, access_token, expiry_date }) => {
      if (refresh_token) token.refresh_token = refresh_token;
      if (access_token) {
        token.access_token = access_token;
        token.expiry_date = expiry_date;
        saveToken(tokenFile, token);
      }
    });

    return oauth2Client;
  }

  return authenticateWithServer(oauth2Client, tokenFile, redirectUri, scope);
}

async function authenticateWithServer(oauth2Client, tokenFile, redirectUri, scope) {
  const connections = [];

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost:3000");
      const code = url.searchParams.get("code");
      const { tokens } = await oauth2Client.getToken({ code, redirect_uri: redirectUri.toString() });
      oauth2Client.setCredentials(tokens);
      saveToken(tokenFile, tokens);
      res.end("Authentication successful! Please return to the console.");
    } catch (e) {
      console.error(e);
      res.statusCode = 500;
      res.end("Authentication failed");
    } finally {
      server.close();
      connections.forEach((conn) => conn.destroy());
    }
  });

  server.on("connection", (conn) => connections.push(conn));

  server.listen(Number(redirectUri.port), () => {
    const authUrl = oauth2Client.generateAuthUrl({
      redirect_uri: redirectUri.toString(),
      access_type: "offline",
      prompt: "consent",
      scope,
    });
    open(authUrl);
  });

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
