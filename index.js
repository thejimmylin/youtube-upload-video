import fs from "fs";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { createServer } from "http";
import open from "open";
import { URL } from "url";

const CLIENT_SECRETS_FILE = "client_secret.json";
const TOKEN_FILE = "token.json";
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];

async function getAuthenticatedService() {
  let credentials = JSON.parse(fs.readFileSync(CLIENT_SECRETS_FILE, "utf8"));

  const { client_secret, client_id, redirect_uris } = credentials.web;
  const oAuth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(TOKEN_FILE)) {
    const token = fs.readFileSync(TOKEN_FILE, "utf8");
    oAuth2Client.setCredentials(JSON.parse(token));
  } else {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
    });
    console.log("Authorize this app by visiting this URL: ", authUrl);

    await open(authUrl);

    const code = await new Promise((resolve, reject) => {
      const server = createServer(async (req, res) => {
        if (req.url && req.url.startsWith("/?code=")) {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const code = url.searchParams.get("code");
          if (code) {
            resolve(code);
            server.close();
          } else {
            reject(new Error("No authorization code found in the URL"));
          }
          res.statusCode = 200;
          res.end("You can close this page now.");
          server.close();
        }
      });

      server.listen(8080, () => {
        console.log("Listening for the authorization code on http://localhost:8080");
      });

      server.on("error", (err) => {
        reject(err);
      });

      // Close the server after receiving the code
      server.on("close", () => {
        console.log("Server closed");
      });
    });

    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens));
  }

  return google.youtube({ version: "v3", auth: oAuth2Client });
}

async function listVideos(youtube) {
  const channelsResponse = await youtube.channels.list({
    part: ["contentDetails"],
    mine: true,
  });

  if (!channelsResponse.data.items) {
    console.log("No channel found.");
    return;
  }

  const uploadedVideosPlaylistId = channelsResponse.data.items[0].contentDetails.relatedPlaylists.uploads;

  const playlistitemsResponse = await youtube.playlistItems.list({
    part: ["snippet"],
    playlistId: uploadedVideosPlaylistId,
    maxResults: 50,
  });

  const videos = playlistitemsResponse.data.items;
  if (!videos) {
    console.log("No videos found.");
    return;
  }

  console.log("Videos:");
  for (const video of videos) {
    console.log(`${video.snippet.title} (${video.snippet.resourceId.videoId})`);
  }
}

async function listMyVideos() {
  const service = await getAuthenticatedService();
  await listVideos(service);
}

listMyVideos();
