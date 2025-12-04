# Tools for my Website

**Read this in other languages: [English](README.md), [中文](README_zh.md).**

A collection of small utilities that make working with webpages easier.  
Most scripts are written in Python and can also be used stand-alone.

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

## blog_create

This is a tool designed for generating blog posts. With this tool, you can easily locate and modify the corresponding previous and next posts.

Additionally, this tool offers excellent editor support, making it easy to implement various layout and formatting features.

### Installation

To run this tool, you need to have `node.js` installed. To set up the environment, open a terminal in the `blog_create` directory (e.g., hold Shift + Right-click inside the folder) and enter the following commands:

```bash
npm init -y
npm install express body-parser cors
```

### Usage

1. Open a terminal in the `blog_create` directory and run the command `node server.js`. The access URL will be displayed in the console (usually `http://localhost:3000/`).
2. **Open the URL in your browser** to access the features. Input the relevant information in the upper section, and export your work once completed.

### About data.json

This file stores the current blog post data. The program will automatically retrieve the relevant information from this file.

### Roadmap

- [ ] Implement online preview feature
- [ ] Add more comprehensive layout and formatting features