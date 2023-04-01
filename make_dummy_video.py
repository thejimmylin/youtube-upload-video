import cv2
import numpy as np


def create_dummy_video(filename, width=640, height=480, duration=5, fps=30):
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    video_writer = cv2.VideoWriter(filename, fourcc, fps, (width, height))

    for _ in range(duration * fps):
        frame = np.random.randint(0, 256, (height, width, 3), dtype=np.uint8)
        video_writer.write(frame)

    video_writer.release()


def main():
    create_dummy_video("dummy_video.mp4")


if __name__ == "__main__":
    main()
