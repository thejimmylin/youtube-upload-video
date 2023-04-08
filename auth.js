import fs from "fs";
import { OAuth2Client } from "google-auth-library";
import http from "http";
import open from "open";
import { URL } from "url";

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

export async function authenticate(clientSecretFile, scope) {
  const content = fs.readFileSync(clientSecretFile, "utf8");
  const keyFile = JSON.parse(content);
  const keys = keyFile.installed || keyFile.web;
  
  const redirectUri = new URL(keys.redirect_uris[0]);
  const client = new OAuth2Client({
    clientId: keys.client_id,
    clientSecret: keys.client_secret,
  });

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, "http://localhost:3000");
        const searchParams = url.searchParams;
        const code = searchParams.get("code");
        const { tokens } = client.getToken({ code: code, redirect_uri: redirectUri.toString() });
        client.setCredentials(tokens);
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
