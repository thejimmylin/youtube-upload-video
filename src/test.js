import fs from "fs";
import assert from "assert";
import { getYoutube } from "./index.js";

// Constants

// It's expensive to test so don't always test it.
const TEST_UPLOAD_VIDEO = false;
const VIDEO_FILE = "data/video.mp4";

// Helpers
async function getChannelDetails(youtube) {
  const response = await youtube.channels.list({
    part: "snippet,contentDetails,statistics",
    mine: true,
  });

  if (response.status === 200) {
    return response.data.items[0];
  } else {
    throw new Error(`API call failed with status ${response.status}`);
  }
}

async function uploadVideo(youtube, videoFilePath) {
  const videoMetadata = {
    snippet: {
      title: "Half of unmarried people under 30 in Japan do not want kids",
      description:
        "https://www.reddit.com/r/worldnews/comments/12hc9v1/half_of_unmarried_people_under_30_in_japan_do_not/",
      categoryId: "22", // "People & Blogs" category
    },
    status: {
      privacyStatus: "public", // Set the video to 'unlisted' to avoid public visibility
    },
  };

  const videoContent = fs.createReadStream(videoFilePath);

  const response = await youtube.videos.insert({
    part: "snippet,status",
    requestBody: videoMetadata,
    media: {
      body: videoContent,
    },
  });

  if (response.status === 200) {
    return response.data.id;
  } else {
    throw new Error(`Video upload failed with status ${response.status}`);
  }
}

// Main
async function main() {
  try {
    // Test: Get Youtube client
    const youtube = await getYoutube();
    assert(youtube, "getYoutube() should return a YouTube object");
    console.log("Test 1: getYoutube() - PASSED");

    // Test: Perform API call to get channel details
    const channelDetails = await getChannelDetails(youtube);
    assert(channelDetails, "getChannelDetails() should return channel details");
    console.log("Test 2: Perform API call to get channel details - PASSED");

    // Test: Upload a video.
    if (TEST_UPLOAD_VIDEO) {
      const videoId = await uploadVideo(youtube, VIDEO_FILE);
      assert(videoId, "uploadVideo() should return a videoId");
      console.log("Test 3: Upload a video - PASSED");
    }
  } catch (error) {
    console.error("Test failed:", error);
  }
}

main();
