from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

# Set your client secrets file path
CLIENT_SECRETS_FILE = "client_secrets.json"

# Set your API scope and access token
SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
API_SERVICE_NAME = "youtube"
API_VERSION = "v3"


def get_authenticated_service():
    flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRETS_FILE, SCOPES)
    credentials = flow.run_local_server(port=8080)  # Replace 8080 with the port you chose
    return build(API_SERVICE_NAME, API_VERSION, credentials=credentials)


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


def main():
    video_file = "dummy_video.mp4"  # Path to your dummy video file
    title = "My Dummy Video"
    description = "This is a dummy video uploaded using the YouTube Data API and Python."
    category = "22"  # Category ID for "People & Blogs"
    privacy_status = "private"  # Video privacy status: 'public', 'private', or 'unlisted'

    youtube = get_authenticated_service()
    try:
        upload_video(youtube, video_file, title, description, category, privacy_status)
    except HttpError as error:
        print(f"An error occurred: {error}")
        print("Video upload aborted.")


if __name__ == "__main__":
    main()
