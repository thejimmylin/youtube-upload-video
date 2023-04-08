import fs from "fs";
import { OAuth2Client } from "google-auth-library";
import http from "http";
import open from "open";
import { URL } from "url";

export function enableDestroy(server) {
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

type LocalAuthOptions = {
  keyfilePath: string;
  scopes: string[];
};

async function authenticate(options: LocalAuthOptions): Promise<OAuth2Client> {
  const content = fs.readFileSync(options.keyfilePath, "utf8");
  const keyFile = JSON.parse(content);
  const keys = keyFile.installed || keyFile.web;
  const redirectUri = new URL(keys.redirect_uris[0] ?? "http://localhost");
  const client = new OAuth2Client({
    clientId: keys.client_id,
    clientSecret: keys.client_secret,
  });

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url!, "http://localhost:3000");
        if (url.pathname !== redirectUri.pathname) {
          res.end("Invalid callback URL");
          return;
        }
        const searchParams = url.searchParams;
        const code = searchParams.get("code");
        const { tokens } = await client.getToken({
          code: code!,
          redirect_uri: redirectUri.toString(),
        });
        client.credentials = tokens;
        resolve(client);
        res.end("Authentication successful! Please return to the console.");
      } catch (e) {
        reject(e);
      } finally {
        (server as any).destroy();
      }
    });

    server.listen(Number(redirectUri.port), () => {
      const authorizeUrl = client.generateAuthUrl({
        redirect_uri: redirectUri.toString(),
        access_type: "offline",
        scope: options.scopes,
      });
      open(authorizeUrl, { wait: false }).then((cp) => cp.unref());
    });
    enableDestroy(server);
  });
}

authenticate({
  keyfilePath: "client_secret.json",
  scopes: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"],
});
