import numpy as np
import os
import glob
import open3d as o3d
import matplotlib.pyplot as plt

# Define SemanticKITTI color map for visualization
SEMANTIC_KITTI_COLORMAP = {
    0: [0, 0, 0],          # Unlabeled
    1: [255, 255, 255],    # Outlier
    10: [255, 0, 0],       # Car
    11: [255, 128, 0],     # Bicycle
    13: [255, 255, 0],     # Bus
    15: [128, 0, 255],     # Motorcycle
    16: [255, 0, 255],     # On Rails
    18: [0, 255, 255],     # Truck
    20: [128, 128, 0],     # Other vehicle
    30: [0, 0, 255],       # Person
    31: [0, 255, 0],       # Bicyclist
    32: [255, 255, 255],   # Motorcyclist
    40: [128, 0, 0],       # Road
    44: [128, 128, 128],   # Parking
    48: [0, 128, 128],     # Sidewalk
    49: [128, 0, 128],     # Other ground
    50: [0, 128, 0],       # Building
    51: [128, 128, 128],   # Fence
    52: [0, 0, 128],       # Vegetation
    53: [128, 0, 0],       # Trunk
    54: [0, 128, 128],     # Terrain
    60: [0, 0, 255],       # Pole
    61: [255, 255, 0],     # Traffic sign
    70: [128, 128, 0],     # Other man-made
    71: [0, 255, 255],     # Sky
    72: [255, 0, 128],     # Water
    80: [255, 255, 255],   # Ego vehicle
    81: [255, 255, 255],   # Dynamic
    99: [128, 128, 128],   # Other
    252: [255, 0, 0],      # Moving-car
    253: [255, 128, 0],    # Moving-bicyclist
    254: [0, 0, 255],      # Moving-person
    255: [0, 255, 0],      # Moving-motorcyclist
    256: [255, 0, 255],    # Moving-other-vehicle
    257: [255, 255, 0]     # Moving-truck
}

def load_point_cloud(bin_path, label_path):
    """Load point cloud and apply actual labels as colors."""
    points = np.fromfile(bin_path, dtype=np.float32).reshape(-1, 4)[:, :3]
    labels = np.fromfile(label_path, dtype=np.uint32) & 0xFFFF
    colors = np.array([SEMANTIC_KITTI_COLORMAP.get(label, [0, 0, 0]) for label in labels]) / 255.0
    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(points)
    pcd.colors = o3d.utility.Vector3dVector(colors)
    return pcd

def project_to_image(pcd, calib_path, pose_path, frame_id):
    """Project point cloud to 2D image plane using calibration data."""
    try:
        with open(calib_path, 'r') as f:
            calib = {}
            for line in f:
                key, value = line.split(':', 1)
                calib[key.strip()] = np.array([float(x) for x in value.split()])
        
        # Load calibration matrices
        Tr = calib['Tr'].reshape(3, 4)
        Tr = np.vstack([Tr, [0, 0, 0, 1]])
        P2 = calib['P2'].reshape(3, 4)
        
        # Get points and colors
        points = np.asarray(pcd.points)
        points_hom = np.hstack([points, np.ones((points.shape[0], 1))])
        
        # Transform to camera coordinates
        points_cam = (Tr @ points_hom.T).T
        
        # Filter points in front of the camera (z > 0)
        mask_z = points_cam[:, 2] > 0
        points_cam = points_cam[mask_z]
        colors = np.asarray(pcd.colors)[mask_z]
        
        # Project to image plane
        points_img = (P2 @ np.hstack([points_cam[:, :3], np.ones((points_cam.shape[0], 1))]).T).T
        points_img = points_img[:, :2] / points_img[:, 2:]
        
        # Filter points within image bounds
        mask_img = (points_img[:, 0] >= 0) & (points_img[:, 0] < 1242) & \
                   (points_img[:, 1] >= 0) & (points_img[:, 1] < 375)
        points_img = points_img[mask_img]
        colors = colors[mask_img]
        
        # Create image
        img = np.zeros((375, 1242, 3), dtype=np.uint8)
        for pt, color in zip(points_img, colors):
            x, y = int(pt[0]), int(pt[1])
            img[y, x] = (color * 255).astype(np.uint8)
        
        return img
    except Exception as e:
        print(f"Error projecting frame {frame_id}: {e}")
        return None

def generate_projections_for_scenes():
    """Generate 2D projections for scenes 00 to 10."""
    for scene in [f"{i:02d}" for i in range(11)]:  # Scenes 00 to 10
        print(f"Processing scene {scene}...")
        
        # Define paths
        pcd_dir = f"./dataset/sequences/{scene}/velodyne/"
        pred_label_dir = f"./dataset/sequences/{scene}/labels/"
        calib_path = f"./calibration/sequences/{scene}/calib.txt"
        pose_path = f"./dataset/sequences/{scene}/poses.txt"
        output_img_dir = f"./dataset/sequences/{scene}/projections/"
        
        # Create output directory for projections
        os.makedirs(output_img_dir, exist_ok=True)
        
        # Get all point cloud files
        pcd_files = sorted(glob.glob(os.path.join(pcd_dir, "*.bin")))
        
        for pcd_file in pcd_files:
            frame_id = os.path.basename(pcd_file).split(".")[0]
            
            # Load point cloud
            pcd = load_point_cloud(
                os.path.join(pcd_dir, f"{frame_id}.bin"),
                os.path.join(pred_label_dir, f"{frame_id}.label")
            )
            
            # Generate 2D projection
            img_projected = project_to_image(pcd, calib_path, pose_path, frame_id)
            
            if img_projected is not None:
                # Save the projected image
                output_img_path = os.path.join(output_img_dir, f"{scene}_{frame_id}_projection.png")
                plt.imsave(output_img_path, img_projected)
                print(f"Saved projection: {output_img_path}")
            else:
                print(f"Skipped saving projection for frame {frame_id} due to error.")

if __name__ == "__main__":
    generate_projections_for_scenes()