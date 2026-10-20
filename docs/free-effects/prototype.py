import sys, cv2, numpy as np
src, out = sys.argv[1], sys.argv[2]
f = cv2.imread(src)

def comic(img):
    smooth = img
    for _ in range(4): smooth = cv2.bilateralFilter(smooth, 9, 60, 60)
    # flatten colours a little, then ink the edges
    q = np.minimum((smooth // 40) * 40 + 20, 255).astype(np.uint8)  # no wrap-around
    gray = cv2.medianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), 7)
    edges = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 9, 4)
    return cv2.bitwise_and(q, q, mask=edges)

def poster(img, k=6):
    z = img.reshape(-1, 3).astype(np.float32)
    _, lab, cen = cv2.kmeans(z, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0), 2, cv2.KMEANS_PP_CENTERS)
    return cen.astype(np.uint8)[lab.flatten()].reshape(img.shape)

def sketch(img):
    g, _ = cv2.pencilSketch(img, sigma_s=50, sigma_r=0.07, shade_factor=0.05)
    return cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)

def watercolor(img):
    return cv2.stylization(img, sigma_s=60, sigma_r=0.45)

def curve(ch, pts):
    xs, ys = zip(*pts); lut = np.interp(np.arange(256), xs, ys).astype(np.uint8); return cv2.LUT(ch, lut)

def teal_orange(img):
    b, g, r = cv2.split(img)
    r = curve(r, [(0, 0), (128, 140), (255, 255)]); b = curve(b, [(0, 30), (128, 120), (255, 225)])
    out = cv2.merge([b, g, r]); hsv = cv2.cvtColor(out, cv2.COLOR_BGR2HSV); hsv[..., 1] = cv2.multiply(hsv[..., 1], 1.25)
    return cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)

def vintage(img):
    k = np.array([[0.272, 0.534, 0.131], [0.349, 0.686, 0.168], [0.393, 0.769, 0.189]])
    sep = cv2.transform(img, k); sep = np.clip(sep, 0, 255).astype(np.uint8)
    h, w = img.shape[:2]; X = cv2.getGaussianKernel(w, w * 0.6); Y = cv2.getGaussianKernel(h, h * 0.6)
    m = (Y @ X.T); m = m / m.max()
    noise = np.random.default_rng(1).normal(0, 10, img.shape)
    return np.clip(sep * m[..., None] + noise, 0, 255).astype(np.uint8)

def noir(img):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY); g = cv2.createCLAHE(3.0, (8, 8)).apply(g)
    return cv2.cvtColor(curve(g, [(0, 0), (70, 30), (180, 220), (255, 255)]), cv2.COLOR_GRAY2BGR)

def popart(img):
    p = poster(img, 5); hsv = cv2.cvtColor(p, cv2.COLOR_BGR2HSV).astype(np.float32); hsv[..., 1] = np.clip(hsv[..., 1] * 1.8, 0, 255)
    hsv = hsv.astype(np.uint8)
    return cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)

fx = [('Original', f), ('Comic ink', comic(f)), ('Posterize', poster(f)), ('Pencil sketch', sketch(f)), ('Watercolor', watercolor(f)), ('Teal & orange', teal_orange(f)), ('Vintage film', vintage(f)), ('Noir', noir(f)), ('Pop art', popart(f))]
tiles = []
for name, im in fx:
    im = cv2.resize(im, (int(im.shape[1] * 300 / im.shape[0]), 300))
    cv2.rectangle(im, (0, 0), (im.shape[1], 30), (0, 0, 0), -1)
    cv2.putText(im, name, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2, cv2.LINE_AA)
    tiles.append(im)
rows = [np.hstack(tiles[i:i + 3]) for i in range(0, 9, 3)]
cv2.imwrite(out, np.vstack(rows))
print('ok')
