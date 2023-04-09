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

    // Add the 'tokens' event listener here
    client.on("tokens", (tokens) => {
      if (tokens.refresh_token) {
        // Save the refresh_token to the token.json file, if it's not already there.
        credentials.refresh_token = tokens.refresh_token;
      }
      if (tokens.access_token) {
        // Update the access_token in the token.json file.
        credentials.access_token = tokens.access_token;
        credentials.expiry_date = tokens.expiry_date;
        fs.writeFileSync(token_file, JSON.stringify(credentials, null, 2));
      }
    });

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
          fs.writeFileSync(token_file, JSON.stringify(tokens, null, 2));
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
          prompt: "consent",
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
