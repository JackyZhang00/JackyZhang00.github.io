# 为我的网页编写的小工具

**其他语言版本: [English](README.md), [中文](README_zh.md).**

这是所有为网页方便而开发的小程序。这些程序大多是基于Python编写的。这些工具也可以作为单独使用。

## aspect_ratio.py

这是用来计算一个目录下所有图片的宽高比，并按照从大到小的顺序排列（**横向到竖向**）。

### 必要库安装

**python版本：3.12.12**

如果你是`conda`用户，使用下面的命令安装必要的库：

```
conda install --file aspect_ratio_requirements.txt
```

如果你是`pip`用户，使用下面的命令：

```
pip install -r aspect_ratio_requirements.txt
```

### 使用方法
在调用时，首先使用命令行进入tools目录，在命令行执行下面的命令：

```
python aspect_ratio.py <dictionary>
```

其中`<dictionary>`为图片所在目录。执行后会看到类似于下面的输出：

```
0.7502 - D:\2025-11-07\blog-2025-11-07-1.jpg
0.7502 - D:\2025-11-07\blog-2025-11-07-2.jpg
0.7502 - D:\2025-11-07\blog-2025-11-07-3.jpg
```
其中前面的数字表示宽高比，**小于1表示为竖向图片，大于1表示横向图片**。