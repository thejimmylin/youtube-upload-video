import fs from "fs";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import http from "http";
import open from "open";
import url from "url";

const SCOPE = ["https://www.googleapis.com/auth/youtube"];
const CLIENT_SECRET_FILE = "data/client_secret.json";
const TOKEN_FILE = "data/token.json";

function getOAuth2Client(clientSecretFile) {
  const content = fs.readFileSync(clientSecretFile, "utf8");
  const credentials = JSON.parse(content);
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  return new OAuth2Client(client_id, client_secret, redirect_uris[0]);
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
  const oAuth2Client = getOAuth2Client(clientSecretFile);
  if (fs.existsSync(tokenFile)) {
    const token = loadToken(tokenFile);
    oAuth2Client.setCredentials(token);
    oAuth2Client.on("tokens", (newToken) => saveToken(tokenFile, { ...token, ...newToken }));
    return oAuth2Client;
  }
  return authenticateWithServer(oAuth2Client, tokenFile, scope);
}

async function authenticateWithServer(oAuth2Client, tokenFile, scope) {
  const connections = [];

  const server = http.createServer(async (req, res) => {
    try {
      const code = url.parse(req.url, true).query.code;
      const response = await oAuth2Client.getToken(code);
      const token = response.tokens;
      oAuth2Client.setCredentials(token);
      saveToken(tokenFile, token);
      res.end("Authentication successful!");
    } catch (e) {
      res.end("Authentication failed");
    } finally {
      server.close();
      connections.forEach((conn) => conn.destroy());
    }
  });

  server.on("connection", (conn) => connections.push(conn));

  server.listen(url.parse(oAuth2Client.redirectUri).port, () => {
    const authUrl = oAuth2Client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope });
    open(authUrl);
  });

  return new Promise((resolve) => {
    server.on("close", () => {
      resolve(oAuth2Client);
    });
  });
}

export async function getYoutube(clientSecretFile = CLIENT_SECRET_FILE, token_file = TOKEN_FILE) {
  const oAuth2Client = await authenticate(clientSecretFile, token_file, SCOPE);
  return google.youtube({ version: "v3", auth: oAuth2Client });
}
