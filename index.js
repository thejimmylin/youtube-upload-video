import fs from "fs";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { createServer } from "http";
import open from "open";
import { URL } from "url";

// Get youtube service
const SCOPE = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];
const CLIENT_SECRET_FILE = "client_secret.json";
const TOKEN_FILE = "token.json";

async function getYoutube(clientSecretFile = CLIENT_SECRET_FILE, token_file = TOKEN_FILE) {
  const oAuth2Client = getOAuth2Client(clientSecretFile);
  const token = await getCredentials(oAuth2Client, token_file);
  oAuth2Client.setCredentials(token);
  return google.youtube({ version: "v3", auth: oAuth2Client });
}

function getOAuth2Client(clientSecretFile) {
  const content = fs.readFileSync(clientSecretFile, "utf8");
  const { client_id, client_secret, redirect_uris } = JSON.parse(content).web;
  return new OAuth2Client(client_id, client_secret, redirect_uris[0]);
}

async function getCredentials(oAuth2Client, token_file) {
  if (fs.existsSync(token_file)) {
    const token = fs.readFileSync(token_file, "utf8");
    const credentials = JSON.parse(token);
    return credentials;
  } else {
    const authUrl = oAuth2Client.generateAuthUrl({ access_type: "offline", scope: SCOPE });
    await open(authUrl);
    const code = await getCodeFromLocalServer();
    const credentials = (await oAuth2Client.getToken(code)).tokens;
    fs.writeFileSync(token_file, JSON.stringify(credentials));
    return credentials;
  }
}

function getCodeFromLocalServer() {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      if (req.url && req.url.startsWith("/?code=")) {
        const code = extractCodeFromUrl(req.url, req.headers.host);
        code ? resolve(code) : reject(new Error("No authorization code found in the URL"));
        res.statusCode = 200;
        res.end("You can close this page now.");
        server.close();
      }
    });
    server.listen(8080);
  });
}

function extractCodeFromUrl(requestUrl, host) {
  const url = new URL(requestUrl, `http://${host}`);
  return url.searchParams.get("code");
}

// List videos
async function listVideos(youtube) {
  const channels = await getChannels(youtube);
  const playlistId = channels[0].contentDetails.relatedPlaylists.uploads;
  const videos = await getPlaylistItems(youtube, playlistId);
  displayVideos(videos);
}

async function getChannels(youtube) {
  const channelsResponse = await youtube.channels.list({
    part: ["contentDetails"],
    mine: true,
  });
  return channelsResponse.data.items;
}

async function getPlaylistItems(youtube, playlistId) {
  const playlistItemsResponse = await youtube.playlistItems.list({
    part: ["snippet"],
    playlistId: playlistId,
    maxResults: 50,
  });
  return playlistItemsResponse.data.items;
}

function displayVideos(videos) {
  console.log("Videos:");
  for (const video of videos) {
    console.log(`${video.snippet.title} (${video.snippet.resourceId.videoId})`);
  }
}

// Main
async function listMyVideos() {
  const service = await getYoutube();
  await listVideos(service);
}

listMyVideos();
