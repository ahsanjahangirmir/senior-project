import numpy as np
import os
import json
from collections import defaultdict

# SemanticKITTI label mapping
label_to_name = {
    0: "unlabeled", 1: "outlier", 10: "car", 11: "bicycle", 13: "bus", 15: "motorcycle", 16: "on-rails", 18: "truck",
    20: "other-vehicle", 30: "person", 31: "bicyclist", 32: "motorcyclist", 40: "road", 44: "parking", 48: "sidewalk",
    49: "other-ground", 50: "building", 51: "fence", 52: "vegetation", 60: "trunk", 61: "terrain", 70: "pole",
    71: "traffic-sign", 80: "other-object", 252: "moving-car", 253: "moving-bicyclist", 254: "moving-person",
    255: "moving-motorcyclist", 256: "moving-on-rails", 257: "moving-bus", 258: "moving-truck", 259: "moving-other-vehicle"
}

def load_calib(calib_path):
    """Load calibration matrices from calib.txt."""
    try:
        with open(calib_path, 'r') as f:
            calib = {}
            for line in f:
                key, value = line.split(':', 1)
                calib[key.strip()] = np.array([float(x) for x in value.split()])
        Tr = calib['Tr'].reshape(3, 4)
        Tr = np.vstack([Tr, [0, 0, 0, 1]])  # Homogeneous transformation
        P2 = calib['P2'].reshape(3, 4)
        return Tr, P2
    except Exception as e:
        raise FileNotFoundError(f"Error loading calib file {calib_path}: {e}")

def load_poses(pose_path):
    """Load poses from poses.txt."""
    try:
        poses = []
        with open(pose_path, 'r') as f:
            for line in f:
                pose = np.array([float(x) for x in line.split()]).reshape(3, 4)
                pose = np.vstack([pose, [0, 0, 0, 1]])
                poses.append(pose)
        return poses
    except Exception as e:
        raise FileNotFoundError(f"Error loading poses file {pose_path}: {e}")

def load_times(times_path):
    """Load timestamps from times.txt."""
    try:
        with open(times_path, 'r') as f:
            times = [float(line.strip()) for line in f]
        return times
    except Exception as e:
        raise FileNotFoundError(f"Error loading times file {times_path}: {e}")

def load_frame_data(frame_id, velodyne_dir, label_dir):
    """Load point cloud and labels for a frame."""
    try:
        points = np.fromfile(os.path.join(velodyne_dir, f"{frame_id}.bin"), dtype=np.float32).reshape(-1, 4)[:, :3]
        labels = np.fromfile(os.path.join(label_dir, f"{frame_id}.label"), dtype=np.uint32)
        return points, labels
    except Exception as e:
        raise FileNotFoundError(f"Error loading frame {frame_id} data: {e}")

def project_to_front_view(points, labels, Tr, P2):
    """Project points to front view and filter for windshield perspective. Return original 3D points in front view."""
    # Transform to camera coordinates
    points_hom = np.hstack([points, np.ones((points.shape[0], 1))])
    points_cam = (Tr @ points_hom.T).T
    mask_z = points_cam[:, 2] > 0  # Only points in front of the camera
    points_after_z = points[mask_z]  # Original 3D points after z-filter
    points_cam = points_cam[mask_z]
    labels_after_z = labels[mask_z]

    # Project to image plane
    points_img = (P2 @ np.hstack([points_cam[:, :3], np.ones((points_cam.shape[0], 1))]).T).T
    points_img = points_img[:, :2] / points_img[:, 2:]
    mask_img = (points_img[:, 0] >= 0) & (points_img[:, 0] < 1242) & (points_img[:, 1] >= 0) & (points_img[:, 1] < 375)
    points_front = points_after_z[mask_img]  # Original 3D points in front view
    points_img = points_img[mask_img]
    labels_front = labels_after_z[mask_img]
    return points_front, points_img, labels_front

def get_spatial_location(x, y, img_width=1242, img_height=375):
    """Map image coordinates to descriptive spatial locations (e.g., 'top-left')."""
    if x < img_width / 3:
        x_loc = "left"
    elif x < 2 * img_width / 3:
        x_loc = "center"
    else:
        x_loc = "right"
    if y < img_height / 3:
        y_loc = "top"
    elif y < 2 * img_height / 3:
        y_loc = "middle"
    else:
        y_loc = "bottom"
    return f"{y_loc}-{x_loc}"

def process_sequence(sequence_dir, output_dir):
    """Process the sequence and generate JSON summaries."""
    # Load calibration, poses, and times
    calib_path = os.path.join(sequence_dir, 'calib.txt')
    pose_path = os.path.join(sequence_dir, 'poses.txt')
    times_path = os.path.join(sequence_dir, 'times.txt')
    velodyne_dir = os.path.join(sequence_dir, 'velodyne')
    label_dir = os.path.join(sequence_dir, 'labels')

    Tr, P2 = load_calib(calib_path)
    poses = load_poses(pose_path)
    times = load_times(times_path)

    # Initialize accumulators
    frame_summaries = []
    total_distance = 0
    speeds = []
    class_percentages_list = []
    object_counts_list = []
    prev_pose = None
    prev_time = None
    prev_speed = 0

    # Process each frame
    for frame_id in range(len(poses)):
        frame_id_str = f"{frame_id:06d}"
        points, labels = load_frame_data(frame_id_str, velodyne_dir, label_dir)
        points_front, points_img, front_labels = project_to_front_view(points, labels, Tr, P2)

        # Extract semantic and instance labels
        semantic_labels = front_labels & 0xFFFF
        instance_ids = front_labels >> 16

        # Compute class percentages
        unique, counts = np.unique(semantic_labels, return_counts=True)
        total_points = len(semantic_labels) if len(semantic_labels) > 0 else 1  # Avoid division by zero
        class_percentages = {label: count / total_points * 100 for label, count in zip(unique, counts)}
        class_percentages_named = {label_to_name.get(label, f"unknown_{label}"): percent 
                                   for label, percent in class_percentages.items()}

        # Unique classes
        unique_classes = list(class_percentages_named.keys())

        # Identify instances
        instances = []
        for inst_id in np.unique(instance_ids):
            if inst_id == 0:  # No instance
                continue
            mask = instance_ids == inst_id
            inst_semantic = semantic_labels[mask][0]  # Assume consistent semantic label per instance
            class_name = label_to_name.get(inst_semantic, "unknown")
            inst_points_img = points_img[mask]  # 2D points for spatial location
            inst_points_3d = points_front[mask]  # 3D points for distance
            if len(inst_points_img) > 0:
                mean_x = np.mean(inst_points_img[:, 0])
                mean_y = np.mean(inst_points_img[:, 1])
                spatial_loc = get_spatial_location(mean_x, mean_y)
                # Compute minimum distance from ego vehicle
                distances = np.linalg.norm(inst_points_3d, axis=1)  # Euclidean norm for each point
                min_distance = float(np.min(distances))  # Minimum distance to closest point
                instances.append({
                    "class": class_name,
                    "instance_id": int(inst_id),
                    "spatial_location": spatial_loc,
                    "distance": min_distance  # Add distance in meters
                })

        # Object counts
        num_cars = len([inst for inst in instances if inst["class"] in ["car", "moving-car"]])
        num_persons = len([inst for inst in instances if inst["class"] in ["person", "moving-person"]])

        # Ego-vehicle motion
        current_pose = poses[frame_id]
        current_time = times[frame_id]
        if prev_pose is not None:
            displacement = np.linalg.norm(current_pose[:3, 3] - prev_pose[:3, 3])
            time_diff = current_time - prev_time
            speed = displacement / time_diff if time_diff > 0 else 0
            acceleration = (speed - prev_speed) / time_diff if time_diff > 0 else 0
            total_distance += displacement
        else:
            speed = 0
            acceleration = 0

        # Direction (yaw)
        R = current_pose[:3, :3]
        yaw = np.arctan2(R[1, 0], R[0, 0])
        direction = float(np.degrees(yaw))

        # Frame summary
        frame_summary = {
            "frame_id": frame_id_str,
            "timestamp": current_time,
            "class_percentages": class_percentages_named,
            "unique_classes": unique_classes,
            "instances": instances,
            "num_cars": num_cars,
            "num_persons": num_persons,
            "ego_motion": {
                "speed": speed,
                "acceleration": acceleration,
                "direction": direction
            }
        }
        frame_summaries.append(frame_summary)

        # Collect sequence data
        class_percentages_list.append(class_percentages_named)
        object_counts_list.append({"timestamp": current_time, "car_count": num_cars, "person_count": num_persons})
        speeds.append(speed)

        # Update previous values
        prev_pose = current_pose
        prev_time = current_time
        prev_speed = speed

    # Sequence-level statistics
    total_frames = len(poses)
    total_duration = times[-1] - times[0] if len(times) > 1 else 0
    average_speed = total_distance / total_duration if total_duration > 0 else 0
    min_speed = min(speeds) if speeds else 0
    max_speed = max(speeds) if speeds else 0
    avg_speed_frames = float(np.mean(speeds)) if speeds else 0

    # Average class percentages
    all_classes = set()
    for cp in class_percentages_list:
        all_classes.update(cp.keys())
    average_class_percentages = {}
    for cls in all_classes:
        percentages = [cp.get(cls, 0) for cp in class_percentages_list]
        average_class_percentages[cls] = float(np.mean(percentages))

    # Time series data
    time_series = [
        {
            "timestamp": times[i],
            "class_percentages": class_percentages_list[i],
            "car_count": object_counts_list[i]["car_count"],
            "person_count": object_counts_list[i]["person_count"]
        } for i in range(len(times))
    ]

    # Sequence summary
    sequence_summary = {
        "total_frames": total_frames,
        "total_duration": total_duration,
        "total_distance": total_distance,
        "average_speed": average_speed,
        "min_speed": min_speed,
        "max_speed": max_speed,
        "average_speed_from_frames": avg_speed_frames,
        "average_class_percentages": average_class_percentages,
        "total_unique_classes": list(all_classes),
        "time_series": time_series
    }

    # Save JSON files in the output directory
    os.makedirs(output_dir, exist_ok=True)
    with open(os.path.join(output_dir, 'frame_summaries.json'), 'w') as f:
        json.dump(frame_summaries, f, indent=4)
    with open(os.path.join(output_dir, 'sequence_summary.json'), 'w') as f:
        json.dump(sequence_summary, f, indent=4)

    print(f"JSON files generated for {sequence_dir}: '{output_dir}/frame_summaries.json' and '{output_dir}/sequence_summary.json'")

def process_all_sequences(dataset_root):
    """Process all sequences from 00 to 10 and save results in stats directory."""
    stats_root = "stats"
    os.makedirs(stats_root, exist_ok=True)

    for seq_id in range(11):  # Sequences 00 to 10
        seq_str = f"{seq_id:02d}"
        sequence_dir = os.path.join(dataset_root, seq_str)
        output_dir = os.path.join(stats_root, seq_str)

        if not os.path.exists(sequence_dir):
            print(f"Sequence directory {sequence_dir} does not exist. Skipping.")
            continue

        try:
            print(f"Processing sequence {seq_str}...")
            process_sequence(sequence_dir, output_dir)
        except Exception as e:
            print(f"Error processing sequence {seq_str}: {e}")

if __name__ == "__main__":
    dataset_root = "./dataset/sequences"  # Adjust to your dataset path
    process_all_sequences(dataset_root)