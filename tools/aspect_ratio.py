import os
from PIL import Image
from typing import List, Tuple

def get_image_files(directory: str) -> List[str]:
    """递归获取目录下所有 jpg 和 png 文件路径"""
    extensions = {'.jpg', '.jpeg', '.png'}
    files = []
    for root, _, filenames in os.walk(directory):
        for name in filenames:
            ext = os.path.splitext(name)[1].lower()
            if ext in extensions:
                files.append(os.path.join(root, name))
    return files

def get_aspect_ratio(image_path: str) -> float:
    """获取图片的宽高比（宽/高）"""
    try:
        with Image.open(image_path) as img:
            width, height = img.size
            if height == 0:
                return 0.0
            return width / height
    except Exception as e:
        print(f"无法读取图片 {image_path}: {e}")
        return 0.0

def main(directory: str):
    image_files = get_image_files(directory)
    ratios: List[Tuple[str, float]] = []

    for path in image_files:
        ratio = get_aspect_ratio(path)
        ratios.append((path, ratio))

    # 按宽高比从大到小排序
    ratios.sort(key=lambda x: x[1], reverse=True)

    # 输出结果
    for path, ratio in ratios:
        print(f"{ratio:.4f} - {path}")

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        print("用法: python aspect_ratio.py <图片目录路径>")
    else:
        main(sys.argv[1])