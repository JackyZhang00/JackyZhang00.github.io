# Tools for my Website

**Read this in other languages: [English](README.md), [中文](README_zh.md).**

A collection of small utilities that make working with webpages easier.  
All scripts are written in Python and can also be used stand-alone.

## aspect_ratio.py

Recursively scans a folder, calculates the width-to-height ratio of every image and lists them **from the widest to the tallest**.

### Required Libraries

**Python version: 3.12.12**

Conda users:
```bash
conda install --file aspect_ratio_requirements.txt
```

Pip users:
```bash
pip install -r aspect_ratio_requirements.txt
```

### Usage
Open a terminal, `cd` into the `tools` folder and run:

```
python aspect_ratio.py <directory>
```

- `<directory>` – path that contains the images  
- Example output:

```
0.7502 - D:\2025-11-07\blog-2025-11-07-1.jpg
0.7502 - D:\2025-11-07\blog-2025-11-07-2.jpg
0.7502 - D:\2025-11-07\blog-2025-11-07-3.jpg
```

The leading number is the aspect-ratio:  
**< 1** → portrait (tall) image  **> 1** → landscape (wide) image