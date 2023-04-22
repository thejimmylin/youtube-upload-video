import fs from "fs";
import { OAuth2Client, Credentials } from "google-auth-library";
import { google, youtube_v3 } from "googleapis";
import http from "http";
import open from "open";
import url from "url";

// Typings

type ClientSecret = {
  web: {
    client_id: string;
    client_secret: string;
    redirect_uris: Array<string>;
  };
};

// Helpers

function readJson(path: string): any {
  const content = fs.readFileSync(path, "utf8");
  return JSON.parse(content);
}

function writeJson(path: string, obj: object): void {
  const content = JSON.stringify(obj, null, 2);
  fs.writeFileSync(path, content);
}

function updateJson(path: string, obj: object): void {
  const prevObj = fs.existsSync(path) ? readJson(path) : {};
  writeJson(path, { ...prevObj, ...obj });
}

// Private APIs

function getOAuth2Client(clientSecret: ClientSecret): OAuth2Client {
  const { client_id, client_secret, redirect_uris } = clientSecret.web;
  return new OAuth2Client(client_id, client_secret, redirect_uris[0]);
}

async function requestToken(oAuth2Client: OAuth2Client, scope: Array<string>): Promise<Credentials> {
  let token: Credentials | null = null;
  const connections: Array<any> = [];

  const server = http.createServer(async (req, res) => {
    const urlString = req.url as string;
    const code = url.parse(urlString, true).query.code as string;
    const response = await oAuth2Client.getToken(code);
    token = response.tokens;
    res.end("Authentication successful!");
    server.close();
    connections.forEach((conn: any) => conn.destroy());
  });

  server.on("connection", (conn: any) => connections.push(conn));
  // @ts-ignore
  server.listen(new URL(oAuth2Client.redirectUri).port, () => {
    const authUrl = oAuth2Client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope });
    open(authUrl);
  });

  await new Promise((resolve) => server.on("close", resolve));
  if (!token) throw Error("Token not recieved");
  return token;
}

// Public API

export async function getYoutube(
  clientSecretFile = "data/client_secret.json",
  tokenFile = "data/token.json",
  scope = ["https://www.googleapis.com/auth/youtube"]
): Promise<youtube_v3.Youtube> {
  const clientSecret = readJson(clientSecretFile);
  const oAuth2Client = getOAuth2Client(clientSecret);
  oAuth2Client.on("tokens", (newToken) => updateJson(tokenFile, newToken));
  const token = fs.existsSync(tokenFile) ? readJson(tokenFile) : await requestToken(oAuth2Client, scope);
  oAuth2Client.setCredentials(token);
  return google.youtube({ version: "v3", auth: oAuth2Client });
}
