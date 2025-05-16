import subprocess
import os

def fix_video_for_streaming(input_video, output_video=None):
    """
    Fixes the input MP4 video for web streaming by transcoding to H.264,
    setting the pixel format to yuv420p, and moving the moov atom to the start.

    Args:
        input_video (str): Path to the input MP4 video.
        output_video (str, optional): Path to save the fixed video.
            If not provided, it will be the input filename with '_fixed' appended.

    Returns:
        None
    """
    if output_video is None:
        base, ext = os.path.splitext(input_video)
        output_video = f"{base}_fixed{ext}"

    try:
        subprocess.run([
            'ffmpeg',
            '-i', input_video,          # Input video
            '-c:v', 'libx264',          # Transcode to H.264
            '-pix_fmt', 'yuv420p',      # Set pixel format for compatibility
            '-movflags', 'faststart',   # Move moov atom to start
            output_video                # Output video
        ], check=True)
        print(f"Fixed video saved as '{output_video}'")
    except subprocess.CalledProcessError as e:
        print(f"Error processing video: {e}")
    except FileNotFoundError:
        print("FFmpeg not found. Please ensure FFmpeg is installed and in your PATH.")

if __name__ == "__main__":
    # Default input video (you can change this or pass via command line)
    input_video = 'sequence_01_animation.mp4'

    # Optionally, specify output video path (default is input with '_fixed' appended)
    output_video = '01.mp4'  # Or specify, e.g., 'fixed_video.mp4'

    # Allow user to specify input and output via command line arguments
    import sys
    if len(sys.argv) > 1:
        input_video = sys.argv[1]
    if len(sys.argv) > 2:
        output_video = sys.argv[2]

    fix_video_for_streaming(input_video, output_video)