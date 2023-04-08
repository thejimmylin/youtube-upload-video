import fs from "fs";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import http from "http";
import open from "open";
import { URL } from "url";

const SCOPE = ["https://www.googleapis.com/auth/youtube"];
const CLIENT_SECRET_FILE = "client_secret.json";
const TOKEN_FILE = "token.json";

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

async function authenticate(clientSecretFile, token_file, scope) {
  const content = fs.readFileSync(clientSecretFile, "utf8");
  const keyFile = JSON.parse(content);
  const keys = keyFile.installed || keyFile.web;

  const redirectUri = new URL(keys.redirect_uris[0]);
  const client = new OAuth2Client({
    clientId: keys.client_id,
    clientSecret: keys.client_secret,
  });

  if (fs.existsSync(token_file)) {
    const token = fs.readFileSync(token_file, "utf8");
    const credentials = JSON.parse(token);
    client.setCredentials(credentials);
    return client;
  } else {
    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url, "http://localhost:3000");
          const searchParams = url.searchParams;
          const code = searchParams.get("code");
          const { tokens } = await client.getToken({ code: code, redirect_uri: redirectUri.toString() });
          client.setCredentials(tokens);
          fs.writeFileSync(token_file, JSON.stringify(tokens));
          resolve(client);
          res.end("Authentication successful! Please return to the console.");
        } catch (e) {
          reject(e);
        } finally {
          server.destroy();
        }
      });

      server.listen(Number(redirectUri.port), () => {
        const authorizeUrl = client.generateAuthUrl({
          redirect_uri: redirectUri.toString(),
          access_type: "offline",
          scope,
        });
        open(authorizeUrl, { wait: false }).then((cp) => cp.unref());
      });
      enableDestroy(server);
    });
  }
}

export async function getYoutube(clientSecretFile = CLIENT_SECRET_FILE, token_file = TOKEN_FILE) {
  const oAuth2Client = await authenticate(clientSecretFile, token_file, SCOPE);
  return google.youtube({ version: "v3", auth: oAuth2Client });
}
