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

# ------------------------------------------------------------------------------------
# I/O HELPERS
# ------------------------------------------------------------------------------------
def load_calib(calib_path):
    """Load calibration matrices from calib.txt."""
    with open(calib_path, 'r') as f:
        calib = {}
        for line in f:
            key, value = line.split(':', 1)
            calib[key.strip()] = np.array([float(x) for x in value.split()])
    Tr = calib['Tr'].reshape(3, 4)
    Tr = np.vstack([Tr, [0, 0, 0, 1]])                # 4×4 homogeneous
    P2 = calib['P2'].reshape(3, 4)
    return Tr, P2

def load_poses(pose_path):
    """Load poses from poses.txt."""
    poses = []
    with open(pose_path, 'r') as f:
        for line in f:
            pose = np.array([float(x) for x in line.split()]).reshape(3, 4)
            pose = np.vstack([pose, [0, 0, 0, 1]])
            poses.append(pose)
    return poses

def load_times(times_path):
    """Load timestamps from times.txt."""
    with open(times_path, 'r') as f:
        return [float(line.strip()) for line in f]

def load_frame_data(frame_id, velodyne_dir, label_dir):
    """Load point cloud and 16-bit semantic labels for a frame."""
    # point cloud (x,y,z,i) → keep xyz
    points = (
        np.fromfile(os.path.join(velodyne_dir, f"{frame_id}.bin"), dtype=np.float32)
        .reshape(-1, 4)[:, :3]
    )

    # labels: 32-bit, lower 16 bits = semantic id, upper 16 bits = instance id
    labels_raw = np.fromfile(os.path.join(label_dir, f"{frame_id}.label"), dtype=np.uint32)
    labels = labels_raw & 0xFFFF  # extract 16-bit semantic id

    return points, labels

# ------------------------------------------------------------------------------------
# GEOMETRY
# ------------------------------------------------------------------------------------
def project_to_front_view(points, labels, Tr, P2):
    """Project points to front view and filter for windshield perspective."""
    points_hom = np.hstack([points, np.ones((points.shape[0], 1))])
    points_cam = (Tr @ points_hom.T).T

    mask_z = points_cam[:, 2] > 0          # keep points in front of camera
    points_cam   = points_cam[mask_z]
    labels       = labels[mask_z]
    points_world = points[mask_z]          # original xyz after z-filter

    proj = (P2 @ np.hstack([points_cam[:, :3], np.ones((points_cam.shape[0], 1))]).T).T
    proj   = proj[:, :2] / proj[:, 2:]

    mask_img = (
        (proj[:, 0] >= 0) & (proj[:, 0] < 1242) &
        (proj[:, 1] >= 0) & (proj[:, 1] < 375)
    )

    return points_world[mask_img], proj[mask_img], labels[mask_img]

# ------------------------------------------------------------------------------------
# MAIN SEQUENCE PROCESSOR
# ------------------------------------------------------------------------------------
def process_sequence(sequence_dir, output_dir):
    scene        = os.path.basename(os.path.normpath(sequence_dir))
    calib_path   = f"./calibration/sequences/{scene}/calib.txt"
    times_path   = f"./calibration/sequences/{scene}/times.txt"
    pose_path    = f"./dataset/sequences/{scene}/poses.txt"
    velodyne_dir = f"./dataset/sequences/{scene}/velodyne/"
    label_dir    = f"./Output/sequences/{scene}/predictions/"

    Tr, P2  = load_calib(calib_path)
    poses   = load_poses(pose_path)
    times   = load_times(times_path)

    frame_summaries         = []
    class_percentages_list  = []
    speeds                  = []
    total_distance          = 0.0
    prev_pose, prev_time    = None, None
    prev_speed              = 0.0

    for fid in range(len(poses)):
        fid_str = f"{fid:06d}"
        pts, lbl = load_frame_data(fid_str, velodyne_dir, label_dir)
        pts_f, _, lbl_f = project_to_front_view(pts, lbl, Tr, P2)

        # class distribution
        uniq, cnts = np.unique(lbl_f, return_counts=True)
        total = len(lbl_f) if len(lbl_f) else 1
        pct   = {int(k): float(v) * 100 / total for k, v in zip(uniq, cnts)}
        pct_named = {label_to_name.get(k, f"unknown_{k}"): v for k, v in pct.items()}

        # ego-motion
        pose  = poses[fid]
        t_now = times[fid]
        if prev_pose is None:
            speed, acc = 0.0, 0.0
        else:
            disp      = np.linalg.norm(pose[:3, 3] - prev_pose[:3, 3])
            dt        = t_now - prev_time
            speed     = disp / dt if dt > 0 else 0.0
            acc       = (speed - prev_speed) / dt if dt > 0 else 0.0
            total_distance += disp
        yaw = np.degrees(np.arctan2(pose[1, 0], pose[0, 0]))

        frame_summaries.append({
            "frame_id": fid_str,
            "timestamp": t_now,
            "class_percentages": pct_named,
            "unique_classes": list(pct_named.keys()),
            "ego_motion": {"speed": speed, "acceleration": acc, "direction": yaw}
        })

        class_percentages_list.append(pct_named)
        speeds.append(speed)
        prev_pose, prev_time, prev_speed = pose, t_now, speed

    duration = times[-1] - times[0] if len(times) > 1 else 0.0
    avg_speed = total_distance / duration if duration > 0 else 0.0

    all_classes = set().union(*class_percentages_list)
    avg_class_pct = {
        cls: float(np.mean([cp.get(cls, 0.0) for cp in class_percentages_list]))
        for cls in all_classes
    }

    sequence_summary = {
        "total_frames": len(poses),
        "total_duration": duration,
        "total_distance": total_distance,
        "average_speed": avg_speed,
        "min_speed": min(speeds) if speeds else 0.0,
        "max_speed": max(speeds) if speeds else 0.0,
        "average_speed_from_frames": float(np.mean(speeds)) if speeds else 0.0,
        "average_class_percentages": avg_class_pct,
        "total_unique_classes": list(all_classes),
        "time_series": [
            {"timestamp": times[i], "class_percentages": class_percentages_list[i]}
            for i in range(len(times))
        ]
    }

    os.makedirs(output_dir, exist_ok=True)
    with open(os.path.join(output_dir, "frame_summaries.json"), "w") as f:
        json.dump(frame_summaries, f, indent=4)
    with open(os.path.join(output_dir, "sequence_summary.json"), "w") as f:
        json.dump(sequence_summary, f, indent=4)

    print(f"Finished {scene} → {output_dir}")

# ------------------------------------------------------------------------------------
# DRIVER
# ------------------------------------------------------------------------------------
def process_all_sequences(dataset_root):
    stats_root = "stats"
    os.makedirs(stats_root, exist_ok=True)

    for seq_id in range(11, 22):                 # sequences 11-21 inclusive
        seq_str      = f"{seq_id:02d}"
        seq_dir      = os.path.join(dataset_root, seq_str)
        out_dir      = os.path.join(stats_root, seq_str)

        if not os.path.exists(seq_dir):
            print(f"{seq_dir} missing → skipped")
            continue

        try:
            print(f"Processing {seq_str} …")
            process_sequence(seq_dir, out_dir)
        except Exception as e:
            print(f"Error {seq_str}: {e}")

if __name__ == "__main__":
    process_all_sequences("./dataset/sequences")
