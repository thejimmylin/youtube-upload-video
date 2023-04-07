// Import necessary modules
import fs from "fs";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { createServer } from "http";
import open from "open";
import { URL } from "url";

// Define constants
const CLIENT_SECRETS_FILE = "client_secret.json";
const TOKEN_FILE = "token.json";
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];

// Define functions
async function getAuthenticatedService() {
  // Read client secrets from file
  const credentials = JSON.parse(fs.readFileSync(CLIENT_SECRETS_FILE, "utf8"));

  // Get client ID and secret from credentials
  const { client_secret, client_id, redirect_uris } = credentials.web;

  // Create OAuth2 client with client ID and secret
  const oAuth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);

  // Set OAuth2 client credentials from token file, or generate new token if none found
  if (fs.existsSync(TOKEN_FILE)) {
    const token = fs.readFileSync(TOKEN_FILE, "utf8");
    oAuth2Client.setCredentials(JSON.parse(token));
  } else {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
    });

    // Prompt user to authorize the app
    console.log("Authorize this app by visiting this URL: ", authUrl);
    await open(authUrl);

    // Create server to receive authorization code
    const code = await new Promise((resolve, reject) => {
      const server = createServer(async (req, res) => {
        if (req.url && req.url.startsWith("/?code=")) {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const code = url.searchParams.get("code");

          if (code) {
            // Resolve promise with authorization code and close server
            resolve(code);
            server.close();
          } else {
            // Reject promise if no authorization code found
            reject(new Error("No authorization code found in the URL"));
          }

          // Send response to user and close server
          res.statusCode = 200;
          res.end("You can close this page now.");
          server.close();
        }
      });

      // Listen for authorization code on port 8080
      server.listen(8080, () => {
        console.log("Listening for the authorization code on http://localhost:8080");
      });

      // Handle errors and close server
      server.on("error", (err) => {
        reject(err);
      });
      server.on("close", () => {
        console.log("Server closed");
      });
    });

    // Get access token with authorization code and set OAuth2 client credentials
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens));
  }

  // Return YouTube API client with authenticated OAuth2 client
  return google.youtube({ version: "v3", auth: oAuth2Client });
}

async function listVideos(youtube) {
  // Get channels that the authenticated user owns
  const channelsResponse = await youtube.channels.list({
    part: ["contentDetails"],
    mine: true,
  });

  // Get playlist ID for the uploaded videos playlist
  const uploadedVideosPlaylistId = channelsResponse.data.items[0].contentDetails.relatedPlaylists.uploads;

  // Get list of videos in the uploaded videos playlist
  const playlistitemsResponse = await youtube.playlistItems.list({
    part: ["snippet"],
    playlistId: uploadedVideosPlaylistId,
    maxResults: 50,
  });

  const videos = playlistitemsResponse.data.items;

  // Print title and ID for each video in the playlist
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
