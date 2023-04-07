import json
import os

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload


CLIENT_SECRETS_FILE = "client_secrets.json"
LOCAL_SERVER_PORT = 8080
SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
]


def get_authenticated_service():
    creds = None
    token_file = "token.json"

    if os.path.exists(token_file):
        creds = Credentials.from_authorized_user_file(token_file, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRETS_FILE, SCOPES)
            creds = flow.run_local_server(port=LOCAL_SERVER_PORT, prompt="consent")

        creds_data = json.loads(creds.to_json())
        creds_data["refresh_token"] = creds.refresh_token

        with open(token_file, "w") as token:
            json.dump(creds_data, token)

    return build("youtube", "v3", credentials=creds)


def upload_video(youtube, video_file, title, description, category, privacy_status):
    body = {
        "snippet": {"title": title, "description": description, "categoryId": category},
        "status": {"privacyStatus": privacy_status},
    }

    media_body = MediaFileUpload(video_file, chunksize=-1, resumable=True)
    request = youtube.videos().insert(part=",".join(body.keys()), body=body, media_body=media_body)
    response = None

    while response is None:
        status, response = request.next_chunk()
        if status:
            print(f"Uploaded {int(status.progress() * 100)}%")

    print(f'Uploaded video with ID "{response["id"]}"')


def list_videos(youtube):
    channels_response = (
        youtube.channels()
        .list(
            part="contentDetails",
            mine=True
        )
        .execute()
    )

    if not channels_response["items"]:
        print("No channel found.")
        return

    uploaded_videos_playlist_id = channels_response["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]

    playlistitems_response = (
        youtube.playlistItems().list(part="snippet", playlistId=uploaded_videos_playlist_id, maxResults=50).execute()
    )

    videos = playlistitems_response.get("items", [])
    if not videos:
        print("No videos found.")
        return

    print("Videos:")
    for video in videos:
        print(f"{video['snippet']['title']} ({video['snippet']['resourceId']['videoId']})")


def upload_a_video():
    service = get_authenticated_service()
    upload_video(
        service,
        video_file="dummy_video.mp4",
        title="My Dummy Video",
        description="This is a dummy video uploaded using the YouTube Data API and Python.",
        category="22",
        privacy_status="public",
    )


def list_my_videos():
    service = get_authenticated_service()
    list_videos(service)


if __name__ == "__main__":
    list_my_videos()
