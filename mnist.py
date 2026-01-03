import numpy as np
import urllib.request
import gzip
import os

BASE = "https://storage.googleapis.com/cvdf-datasets/mnist/"

FILES = {
    "train_images": "train-images-idx3-ubyte.gz",
    "train_labels": "train-labels-idx1-ubyte.gz",
    "test_images":  "t10k-images-idx3-ubyte.gz",
    "test_labels":  "t10k-labels-idx1-ubyte.gz",
}

def download(url, filename):
    if not os.path.exists(filename):
        print(f"Downloading {filename}...")
        urllib.request.urlretrieve(url, filename)

def load_images(filename):
    with gzip.open(filename, "rb") as f:
        data = np.frombuffer(f.read(), np.uint8, offset=16)
    return data.reshape(-1, 28, 28).astype(np.float32) / 255.0

def load_labels(filename):
    with gzip.open(filename, "rb") as f:
        return np.frombuffer(f.read(), np.uint8, offset=8).astype(np.float32)

for fname in FILES.values():
    download(BASE + fname, fname)

train_images = load_images(FILES["train_images"])
test_images  = load_images(FILES["test_images"])
train_labels = load_labels(FILES["train_labels"])
test_labels  = load_labels(FILES["test_labels"])

train_images.tofile("train_images.mat")
test_images.tofile("test_images.mat")
train_labels.tofile("train_labels.mat")
test_labels.tofile("test_labels.mat")

print(train_images.shape, train_labels.shape)
print(test_images.shape, test_labels.shape)

