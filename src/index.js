import fs from "fs";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import http from "http";
import open from "open";
import url from "url";

function readJson(path) {
  const content = fs.readFileSync(path, "utf8");
  return JSON.parse(content);
}

function writeJson(path, obj) {
  const content = JSON.stringify(obj, null, 2);
  fs.writeFileSync(path, content);
}

function updateJson(path, newObj) {
  if (!fs.existsSync(path)) writeJson(path, {});
  const obj = readJson(path);
  writeJson(path, { ...obj, ...newObj });
}

function getOAuth2Client(clientSecretFile) {
  const obj = readJson(clientSecretFile);
  const { client_id, client_secret, redirect_uris } = obj.installed || obj.web;
  return new OAuth2Client(client_id, client_secret, redirect_uris[0]);
}

async function requestToken(oAuth2Client, scope) {
  let token;
  const connections = [];
  const server = http.createServer(async (req, res) => {
    const code = url.parse(req.url, true).query.code;
    const response = await oAuth2Client.getToken(code);
    token = response.tokens;
    res.end("Authentication successful!");
    server.close();
    connections.forEach((conn) => conn.destroy());
  });
  server.on("connection", (conn) => connections.push(conn));
  server.listen(new URL(oAuth2Client.redirectUri).port, () => {
    const authUrl = oAuth2Client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope });
    open(authUrl);
  });
  await new Promise((resolve) => server.on("close", resolve));
  return token;
}

export async function getYoutube(
  clientSecretFile = "data/client_secret.json",
  tokenFile = "data/token.json",
  scope = ["https://www.googleapis.com/auth/youtube"]
) {
  const oAuth2Client = getOAuth2Client(clientSecretFile);
  oAuth2Client.on("tokens", (newToken) => updateJson(tokenFile, newToken));
  const token = fs.existsSync(tokenFile) ? readJson(tokenFile) : await requestToken(oAuth2Client, scope);
  oAuth2Client.setCredentials(token);
  return google.youtube({ version: "v3", auth: oAuth2Client });
}
