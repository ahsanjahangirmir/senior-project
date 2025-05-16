import cv2
import glob

# Define paths
projections_folder = 'projections'
output_video = 'sequence_01_animation.mp4'

# Collect and sort projection image files for sequence 01
image_files = sorted(glob.glob(f'{projections_folder}/01_*_projection.png'))
if not image_files:
    raise FileNotFoundError("No projection images found in the 'projections' folder.")

# Read the first image to determine frame size
first_image = cv2.imread(image_files[0])
if first_image is None:
    raise ValueError("Failed to read the first image. Check the file path or format.")
height, width, _ = first_image.shape

# Set the frame rate (based on ~0.1s intervals from times.txt)
fps = 10

# Initialize the VideoWriter with 'mp4v' codec
fourcc = cv2.VideoWriter_fourcc(*'mp4v')
video = cv2.VideoWriter(output_video, fourcc, fps, (width, height))

# Process each image and write to the video
for i, image_file in enumerate(image_files):
    # Optional: Print progress every 100 frames
    if i % 100 == 0:
        print(f"Processing frame {i}/{len(image_files)}")
    
    # Read the image
    img = cv2.imread(image_file)
    if img is None:
        print(f"Warning: Failed to read {image_file}. Skipping this frame.")
        continue
    
    # Write the frame to the video without color conversion
    video.write(img)

# Release the video writer to save the file
video.release()
print(f"Video successfully saved as '{output_video}' with {len(image_files)} frames.")